'use client';

import React, { useState } from 'react';
import type {
  AssessmentWithTopics,
  AcademicNodeWithResources,
  AssessmentTopicSource,
  Assessment,
} from '@campusflow/types';
import {
  createAssessment,
  updateAssessment,
  deleteAssessment,
  linkTopicToAssessment,
  unlinkTopicFromAssessment,
} from '../lib/api';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Edit2,
  FolderTree,
  Plus,
  Trash2,
  X,
  Layers,
} from 'lucide-react';

interface AssessmentManagerProps {
  courseId: string;
  courseTitle: string;
  assessments: AssessmentWithTopics[];
  academicNodes: AcademicNodeWithResources[];
  onAssessmentsUpdated: () => void;
}

export function AssessmentManager({
  courseId,
  courseTitle,
  assessments,
  academicNodes,
  onAssessmentsUpdated,
}: AssessmentManagerProps) {
  const [expandedAssessmentId, setExpandedAssessmentId] = useState<string | null>(
    assessments.length > 0 ? assessments[0]?.id || null : null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<AssessmentWithTopics | null>(null);

  // Form states for create/edit
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<Assessment['type']>('CAT');
  const [formDate, setFormDate] = useState('');
  const [formTotalMarks, setFormTotalMarks] = useState<string>('');
  const [formWeightage, setFormWeightage] = useState('');
  const [formStatus, setFormStatus] = useState<Assessment['status']>('upcoming');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Link topic states
  const [linkingAssessmentId, setLinkingAssessmentId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [linkWeight, setLinkWeight] = useState<string>('');
  const [linkSource, setLinkSource] = useState<AssessmentTopicSource>('user');
  const [linkNotes, setLinkNotes] = useState<string>('');
  const [isLinking, setIsLinking] = useState(false);

  // Filter modules vs topics in academic nodes
  const modules = academicNodes.filter((n) => !n.parentId);
  const allTopics = academicNodes.filter((n) => n.parentId);

  const startCreate = () => {
    setFormTitle('');
    setFormType('CAT');
    setFormDate('');
    setFormTotalMarks('');
    setFormWeightage('');
    setFormStatus('upcoming');
    setIsCreating(true);
    setEditingAssessment(null);
  };

  const startEdit = (a: AssessmentWithTopics) => {
    setFormTitle(a.title);
    setFormType(a.type);
    setFormDate(a.date ? new Date(a.date).toISOString().slice(0, 16) : '');
    setFormTotalMarks(
      a.totalMarks !== null && a.totalMarks !== undefined ? String(a.totalMarks) : '',
    );
    setFormWeightage(a.weightage || '');
    setFormStatus(a.status || 'upcoming');
    setEditingAssessment(a);
    setIsCreating(false);
  };

  const cancelForm = () => {
    setIsCreating(false);
    setEditingAssessment(null);
  };

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    try {
      setIsSubmitting(true);
      const totalMarksNum = formTotalMarks.trim() ? parseFloat(formTotalMarks) : null;
      const dateIso = formDate.trim() ? new Date(formDate).toISOString() : null;

      if (editingAssessment) {
        await updateAssessment(editingAssessment.id, {
          title: formTitle.trim(),
          type: formType,
          date: dateIso,
          totalMarks: totalMarksNum,
          weightage: formWeightage.trim() || null,
          status: formStatus,
        });
      } else {
        await createAssessment({
          courseId,
          title: formTitle.trim(),
          type: formType,
          date: dateIso,
          totalMarks: totalMarksNum,
          weightage: formWeightage.trim() || null,
          status: formStatus,
        });
      }

      setIsCreating(false);
      setEditingAssessment(null);
      onAssessmentsUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAssessment = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete assessment "${title}"?`)) return;
    try {
      await deleteAssessment(id);
      if (expandedAssessmentId === id) setExpandedAssessmentId(null);
      onAssessmentsUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handleLinkTopic = async (assessmentId: string) => {
    if (!selectedTopicId) return;
    try {
      setIsLinking(true);
      const weightNum = linkWeight.trim() ? parseFloat(linkWeight) : null;

      await linkTopicToAssessment(assessmentId, {
        topicId: selectedTopicId,
        weight: weightNum,
        source: linkSource,
        notes: linkNotes.trim() || null,
      });

      setSelectedTopicId('');
      setLinkWeight('');
      setLinkSource('user');
      setLinkNotes('');
      setLinkingAssessmentId(null);
      onAssessmentsUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkTopic = async (assessmentId: string, topicId: string, topicTitle: string) => {
    if (!window.confirm(`Unlink topic "${topicTitle}" from this assessment?`)) return;
    try {
      await unlinkTopicFromAssessment(assessmentId, topicId);
      onAssessmentsUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const getTypeBadgeStyle = (type: Assessment['type']) => {
    switch (type) {
      case 'CAT':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'FAT':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'Quiz':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Assignment':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'Project':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'Lab':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-neutral-800 text-neutral-400 border-neutral-700';
    }
  };

  const getStatusBadgeStyle = (status?: Assessment['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40';
      case 'cancelled':
        return 'bg-rose-950/40 text-rose-400 border-rose-800/40';
      case 'upcoming':
      default:
        return 'bg-blue-950/40 text-blue-400 border-blue-800/40';
    }
  };

  const getSourceBadge = (source?: AssessmentTopicSource) => {
    switch (source) {
      case 'syllabus':
        return 'border-purple-800/40 text-purple-300 bg-purple-950/30';
      case 'question_paper':
        return 'border-amber-800/40 text-amber-300 bg-amber-950/30';
      case 'inferred':
        return 'border-blue-800/40 text-blue-300 bg-blue-950/30';
      case 'user':
      default:
        return 'border-neutral-700 text-neutral-300 bg-neutral-800/40';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-[var(--cf-primary)]">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Course Assessments</h2>
            <p className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
              Factual assessment definitions & linked academic topics
            </p>
          </div>
        </div>

        {!isCreating && !editingAssessment && (
          <button
            onClick={startCreate}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[var(--cf-primary)] hover:opacity-90 text-xs font-medium text-black transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Assessment</span>
          </button>
        )}
      </div>

      {/* Create / Edit Form Modal/Card */}
      {(isCreating || editingAssessment) && (
        <form
          onSubmit={handleSaveAssessment}
          className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[var(--cf-border)]">
            <h3 className="text-xs font-semibold text-white">
              {editingAssessment ? 'Edit Assessment' : 'New Assessment'}
            </h3>
            <button
              type="button"
              onClick={cancelForm}
              className="p-1 rounded text-[var(--cf-text-secondary)] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Continuous Assessment Test 1"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as Assessment['type'])}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
              >
                <option value="CAT">CAT (Continuous Assessment)</option>
                <option value="FAT">FAT (Final Assessment)</option>
                <option value="Quiz">Quiz</option>
                <option value="Assignment">Assignment</option>
                <option value="Project">Project</option>
                <option value="Lab">Lab Exam</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                Date & Time (Optional)
              </label>
              <input
                type="datetime-local"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                Total Marks (Optional)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 50 or 100"
                value={formTotalMarks}
                onChange={(e) => setFormTotalMarks(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                Weightage % (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 30% or 15"
                value={formWeightage}
                onChange={(e) => setFormWeightage(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                Status
              </label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as Assessment['status'])}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
              >
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--cf-border)]">
            <button
              type="button"
              onClick={cancelForm}
              className="px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] text-xs text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[var(--cf-primary)] hover:opacity-90 text-xs font-medium text-black transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : editingAssessment ? 'Update' : 'Create Assessment'}
            </button>
          </div>
        </form>
      )}

      {/* Assessment List */}
      {assessments.length === 0 ? (
        <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center text-xs text-[var(--cf-text-secondary)]">
          <ClipboardList className="w-8 h-8 text-[var(--cf-text-secondary)]/40 mx-auto mb-2" />
          <p className="font-medium text-white mb-1">No assessments recorded yet</p>
          <p className="text-[11px]">
            Add CATs, FATs, Quizzes, or Assignments and link syllabus topics in scope.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((assessment) => {
            const isExpanded = expandedAssessmentId === assessment.id;
            const linkedTopics = assessment.topics || [];
            const isLinkingThis = linkingAssessmentId === assessment.id;

            // Available unlinked topics
            const linkedTopicIdSet = new Set(linkedTopics.map((t) => t.topicId));
            const availableTopics = allTopics.filter((t) => !linkedTopicIdSet.has(t.id));

            return (
              <div
                key={assessment.id}
                className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] overflow-hidden transition-colors"
              >
                {/* Assessment Row Header */}
                <div className="p-4 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setExpandedAssessmentId(isExpanded ? null : assessment.id)}
                    className="flex items-center space-x-3 min-w-0 text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="text-[var(--cf-text-secondary)]">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[var(--cf-primary)]" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${getTypeBadgeStyle(
                            assessment.type,
                          )}`}
                        >
                          {assessment.type}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">
                          {assessment.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize border ${getStatusBadgeStyle(
                            assessment.status,
                          )}`}
                        >
                          {assessment.status || 'upcoming'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[var(--cf-text-secondary)] font-mono mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-[var(--cf-primary)]" />
                          {assessment.date
                            ? new Date(assessment.date).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Date not set'}
                        </span>
                        <span>·</span>
                        <span>
                          {assessment.totalMarks !== null && assessment.totalMarks !== undefined
                            ? `${assessment.totalMarks} Marks`
                            : 'Marks: Not set'}
                        </span>
                        {assessment.weightage && (
                          <>
                            <span>·</span>
                            <span>Weightage: {assessment.weightage}</span>
                          </>
                        )}
                        <span>·</span>
                        <span className="text-[var(--cf-primary)] font-semibold">
                          {linkedTopics.length} {linkedTopics.length === 1 ? 'Topic' : 'Topics'} in
                          scope
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => startEdit(assessment)}
                      className="p-1.5 rounded hover:bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] hover:text-white transition-colors"
                      title="Edit assessment"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteAssessment(assessment.id, assessment.title)}
                      className="p-1.5 rounded hover:bg-rose-950/50 text-[var(--cf-text-secondary)] hover:text-rose-400 transition-colors"
                      title="Delete assessment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details: Topics in Scope */}
                {isExpanded && (
                  <div className="border-t border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/20 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FolderTree className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono">
                          Topics in Scope ({linkedTopics.length})
                        </h4>
                      </div>

                      {!isLinkingThis && (
                        <button
                          onClick={() => {
                            setLinkingAssessmentId(assessment.id);
                            setSelectedTopicId(availableTopics[0]?.id || '');
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] border border-[var(--cf-border)] text-xs text-white transition-colors"
                        >
                          <Plus className="w-3 h-3 text-[var(--cf-primary)]" />
                          <span>Link Topic</span>
                        </button>
                      )}
                    </div>

                    {/* Inline Topic Linker */}
                    {isLinkingThis && (
                      <div className="p-3 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-3">
                        <div className="flex items-center justify-between pb-1 border-b border-[var(--cf-border)]">
                          <span className="text-xs font-semibold text-white">
                            Link Topic from {courseTitle}
                          </span>
                          <button
                            onClick={() => setLinkingAssessmentId(null)}
                            className="p-1 rounded text-[var(--cf-text-secondary)] hover:text-white"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {availableTopics.length === 0 ? (
                          <div className="py-3 text-center text-xs text-[var(--cf-text-secondary)]">
                            All academic map topics are already linked to this assessment, or no
                            topics exist yet in the Academic Map.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                                Academic Topic *
                              </label>
                              <select
                                value={selectedTopicId}
                                onChange={(e) => setSelectedTopicId(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                              >
                                {modules.map((mod) => {
                                  const modTopics = allTopics.filter(
                                    (t) => t.parentId === mod.id && !linkedTopicIdSet.has(t.id),
                                  );
                                  if (modTopics.length === 0) return null;
                                  return (
                                    <optgroup key={mod.id} label={mod.title}>
                                      {modTopics.map((top) => (
                                        <option key={top.id} value={top.id}>
                                          {top.title}
                                        </option>
                                      ))}
                                    </optgroup>
                                  );
                                })}
                              </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                                  Weight / Marks (Leave blank if unknown)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="e.g. 15 (NULL if unknown)"
                                  value={linkWeight}
                                  onChange={(e) => setLinkWeight(e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                                  Source
                                </label>
                                <select
                                  value={linkSource}
                                  onChange={(e) =>
                                    setLinkSource(e.target.value as AssessmentTopicSource)
                                  }
                                  className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                                >
                                  <option value="user">User Explicit</option>
                                  <option value="syllabus">Syllabus Stated</option>
                                  <option value="question_paper">Question Paper</option>
                                  <option value="inferred">Inferred</option>
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                                Notes (Optional)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Covers part A and B questions"
                                value={linkNotes}
                                onChange={(e) => setLinkNotes(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                              />
                            </div>

                            <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--cf-border)]">
                              <button
                                type="button"
                                onClick={() => setLinkingAssessmentId(null)}
                                className="px-3 py-1 rounded bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] text-xs text-white"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLinkTopic(assessment.id)}
                                disabled={isLinking || !selectedTopicId}
                                className="px-3 py-1 rounded bg-[var(--cf-primary)] hover:opacity-90 text-xs font-medium text-black disabled:opacity-50"
                              >
                                {isLinking ? 'Linking...' : 'Add to Scope'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Linked Topics Grouped by Module */}
                    {linkedTopics.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-[var(--cf-border)] text-center text-xs text-[var(--cf-text-secondary)]">
                        No topics linked to this assessment yet. Click &quot;Link Topic&quot; to
                        specify which syllabus topics are in scope.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {modules.map((mod) => {
                          const topicsInModule = linkedTopics.filter(
                            (lt) => lt.parentModuleId === mod.id,
                          );
                          if (topicsInModule.length === 0) return null;

                          return (
                            <div
                              key={mod.id}
                              className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] p-3 space-y-2"
                            >
                              <div className="flex items-center space-x-1.5 text-xs font-medium text-[var(--cf-text-secondary)] font-mono">
                                <Layers className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
                                <span>{mod.title}</span>
                              </div>

                              <div className="divide-y divide-[var(--cf-border)] pl-2">
                                {topicsInModule.map((lt) => {
                                  const topicTitle = lt.topicTitle || 'Unknown Topic';
                                  return (
                                    <div
                                      key={lt.linkId}
                                      className="py-2 flex items-center justify-between gap-3 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <div className="font-medium text-white truncate">
                                          {topicTitle}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--cf-text-secondary)] mt-0.5 flex-wrap">
                                          <span
                                            className={`px-1.5 py-0.2 rounded border uppercase text-[9px] ${getSourceBadge(
                                              lt.source,
                                            )}`}
                                          >
                                            {lt.source}
                                          </span>
                                          <span>·</span>
                                          <span>
                                            {lt.weight !== null && lt.weight !== undefined
                                              ? `Weight: ${lt.weight}`
                                              : 'Unweighted (NULL)'}
                                          </span>
                                          {lt.notes && (
                                            <>
                                              <span>·</span>
                                              <span className="italic text-neutral-400">
                                                {lt.notes}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      <button
                                        onClick={() =>
                                          handleUnlinkTopic(assessment.id, lt.topicId, topicTitle)
                                        }
                                        className="p-1 rounded hover:bg-rose-950/50 text-[var(--cf-text-secondary)] hover:text-rose-400 transition-colors shrink-0"
                                        title="Unlink topic from assessment"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* Any orphaned linked topics where parent module is deleted or unassigned */}
                        {linkedTopics.filter(
                          (lt) => !modules.some((m) => m.id === lt.parentModuleId),
                        ).length > 0 && (
                          <div className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] p-3 space-y-2">
                            <div className="text-xs font-medium text-[var(--cf-text-secondary)] font-mono">
                              Other Topics
                            </div>
                            <div className="divide-y divide-[var(--cf-border)] pl-2">
                              {linkedTopics
                                .filter((lt) => !modules.some((m) => m.id === lt.parentModuleId))
                                .map((lt) => (
                                  <div
                                    key={lt.linkId}
                                    className="py-2 flex items-center justify-between gap-3 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-medium text-white truncate">
                                        {lt.topicTitle || 'Topic'}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleUnlinkTopic(
                                          assessment.id,
                                          lt.topicId,
                                          lt.topicTitle || 'Topic',
                                        )
                                      }
                                      className="p-1 rounded hover:bg-rose-950/50 text-[var(--cf-text-secondary)] hover:text-rose-400 transition-colors shrink-0"
                                      title="Unlink topic"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
