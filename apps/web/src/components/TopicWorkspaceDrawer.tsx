'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, ExternalLink, Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import {
  fetchTopicDiscoveredResources,
  attachTopicResource,
  deleteTopicResource,
  updateTopicStudyState,
  fetchTopicStudyState,
} from '@/lib/api';
import type {
  AcademicNodeWithResources,
  TopicResourceType,
  TopicResourceVerificationStatus,
  StudyStateValue,
} from '@campusflow/types';

interface TopicWorkspaceDrawerProps {
  courseId: string;
  topic: AcademicNodeWithResources | null;
  isOpen: boolean;
  onClose: () => void;
  onTopicUpdated?: () => void;
}

export function TopicWorkspaceDrawer({
  courseId,
  topic,
  isOpen,
  onClose,
  onTopicUpdated,
}: TopicWorkspaceDrawerProps) {
  const [resources, setResources] = useState<
    Array<{
      id?: string;
      title: string;
      provider: string;
      url: string | null;
      type: TopicResourceType;
      verificationStatus: TopicResourceVerificationStatus;
      relevanceNote: string;
    }>
  >([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [studyState, setStudyState] = useState<StudyStateValue>('not_started');
  const [updatingState, setUpdatingState] = useState(false);

  // Add custom resource form
  const [showAddForm, setShowAddForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customProvider, setCustomProvider] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customType, setCustomType] = useState<TopicResourceType>('article');
  const [addingResource, setAddingResource] = useState(false);

  useEffect(() => {
    if (!topic || !isOpen) return;

    const loadTopicData = async () => {
      try {
        setLoadingResources(true);
        const [discRes, stateRes] = await Promise.all([
          fetchTopicDiscoveredResources(courseId, topic.id),
          fetchTopicStudyState(courseId, topic.id),
        ]);
        setResources(discRes);
        if (stateRes) {
          setStudyState(stateRes.state);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingResources(false);
      }
    };

    loadTopicData();
  }, [courseId, topic, isOpen]);

  if (!isOpen || !topic) return null;

  const handleStateChange = async (newState: StudyStateValue) => {
    try {
      setUpdatingState(true);
      await updateTopicStudyState(
        courseId,
        topic.id,
        newState,
        newState === 'reviewed' ? 'reviewed' : 'state_changed',
      );
      setStudyState(newState);
      if (onTopicUpdated) onTopicUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingState(false);
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;

    try {
      setAddingResource(true);
      const created = await attachTopicResource(courseId, topic.id, {
        title: customTitle.trim(),
        provider: customProvider.trim() || 'Student Added',
        url: customUrl.trim() || null,
        type: customType,
        verificationStatus: 'student_uploaded',
        relevanceNote: 'Attached by student',
      });

      setResources((prev) => [
        {
          id: created.id,
          title: created.title,
          provider: created.provider || 'Student Added',
          url: created.url ?? null,
          type: created.type,
          verificationStatus: created.verificationStatus,
          relevanceNote: created.relevanceNote || 'Attached by student',
        },
        ...prev,
      ]);

      setCustomTitle('');
      setCustomProvider('');
      setCustomUrl('');
      setShowAddForm(false);
    } catch (err) {
      console.error(err);
      alert('Failed to attach resource.');
    } finally {
      setAddingResource(false);
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    try {
      await deleteTopicResource(courseId, topic.id, resourceId);
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
    } catch (err) {
      console.error(err);
      alert('Failed to remove resource.');
    }
  };

  const renderBadge = (status: TopicResourceVerificationStatus) => {
    switch (status) {
      case 'syllabus_extracted':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
            Syllabus Prescribed
          </span>
        );
      case 'verified_external':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/60 text-blue-300 border border-blue-800/50">
            Verified Academic
          </span>
        );
      case 'student_uploaded':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/50">
            Student Uploaded
          </span>
        );
      case 'recommended_unverified':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
            Recommended Reference
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl h-full bg-[var(--cf-bg-surface-1)] border-l border-[var(--cf-border)] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/50 flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--cf-primary)] font-bold px-2 py-0.5 rounded bg-[var(--cf-primary)]/10 border border-[var(--cf-primary)]/20">
                Topic
              </span>
              {topic.estimatedMinutes && (
                <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] flex items-center gap-1">
                  <Clock className="w-3 h-3" />~{topic.estimatedMinutes} mins
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-white tracking-tight break-words">
              {topic.title}
            </h2>
            {topic.notes && topic.notes.includes('Source:') && (
              <p className="text-[11px] font-mono text-emerald-400">{topic.notes}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-border)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Study Progress Controls */}
          <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/30 space-y-2.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--cf-text-secondary)] block">
              Study Mastery State
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'not_started', label: 'Not Started' },
                  { id: 'learning', label: 'Learning' },
                  { id: 'needs_review', label: 'Needs Review' },
                  { id: 'reviewed', label: 'Reviewed' },
                ] as const
              ).map((state) => (
                <button
                  key={state.id}
                  disabled={updatingState}
                  onClick={() => handleStateChange(state.id)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-all text-center ${
                    studyState === state.id
                      ? 'bg-[var(--cf-primary)] text-white border-[var(--cf-primary)] shadow-sm'
                      : 'border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-[var(--cf-text-secondary)] hover:text-white hover:border-zinc-600'
                  }`}
                >
                  {state.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description / Subtopics */}
          {topic.description && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--cf-text-secondary)]">
                Core Concepts
              </span>
              <p className="text-xs text-white/90 leading-relaxed p-3.5 rounded-xl bg-[var(--cf-bg-surface-2)]/30 border border-[var(--cf-border)]">
                {topic.description}
              </p>
            </div>
          )}

          {/* Prerequisites */}
          {topic.prerequisites && topic.prerequisites.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--cf-text-secondary)]">
                Prerequisites
              </span>
              <div className="flex flex-wrap gap-1.5">
                {topic.prerequisites.map((p, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg text-xs bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-white/90 font-mono"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resource Discovery Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono">
                  Learning Resources ({resources.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center space-x-1 text-xs text-[var(--cf-primary)] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddForm ? 'Cancel' : 'Add Resource'}</span>
              </button>
            </div>

            {/* Add Resource Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddResource}
                className="p-4 rounded-xl border border-[var(--cf-primary)]/30 bg-[var(--cf-bg-surface-2)] space-y-3"
              >
                <div>
                  <label className="text-[10px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                    Resource Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Chapter 4: Relational Algebra Notes"
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                      Provider / Author
                    </label>
                    <input
                      type="text"
                      value={customProvider}
                      onChange={(e) => setCustomProvider(e.target.value)}
                      placeholder="e.g. MIT OCW / Silberschatz"
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                      Resource Type
                    </label>
                    <select
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value as TopicResourceType)}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] text-xs text-white focus:outline-none"
                    >
                      <option value="textbook">Textbook</option>
                      <option value="lecture">Lecture</option>
                      <option value="article">Article / Notes</option>
                      <option value="practice">Practice Problems</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                    URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingResource}
                  className="w-full py-2 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {addingResource ? 'Saving...' : 'Attach to Topic'}
                </button>
              </form>
            )}

            {/* Resources List */}
            {loadingResources ? (
              <div className="py-8 text-center text-xs text-[var(--cf-text-secondary)] font-mono flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Searching verified repositories...</span>
              </div>
            ) : resources.length === 0 ? (
              <div className="p-6 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/20 text-center text-xs text-[var(--cf-text-secondary)]">
                No resources discovered for this topic yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {resources.map((res, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/40 hover:bg-[var(--cf-bg-surface-2)]/80 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {renderBadge(res.verificationStatus)}
                          <span className="text-[10px] font-mono text-[var(--cf-text-secondary)] uppercase">
                            {res.provider}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-white leading-snug">
                          {res.title}
                        </h4>
                      </div>

                      {res.id && (
                        <button
                          onClick={() => handleDeleteResource(res.id!)}
                          className="text-[var(--cf-text-secondary)] hover:text-rose-400 p-1 transition-colors"
                          title="Remove resource"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-[var(--cf-text-secondary)] leading-relaxed">
                      {res.relevanceNote}
                    </p>

                    {res.url && (
                      <div className="pt-1">
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1.5 text-xs text-[var(--cf-primary)] hover:underline font-mono"
                        >
                          <span>Open verified resource</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/60 flex items-center justify-between">
          <span className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
            Changes persist automatically
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
