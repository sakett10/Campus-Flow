'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { AcademicNodeWithResources, StudyStateValue } from '@campusflow/types';
import {
  updateAcademicNode,
  deleteAcademicNode,
  createAcademicNodes,
  updateTopicStudyState,
} from '../lib/api';
import { FolderTree, Edit2, Check, X, AlertTriangle, FileText, Plus, Trash2 } from 'lucide-react';

interface AcademicMapTreeProps {
  courseId: string;
  courseTitle: string;
  nodes: AcademicNodeWithResources[];
  onNodeUpdated?: () => void;
}

export function AcademicMapTree({
  courseId,
  courseTitle,
  nodes,
  onNodeUpdated,
}: AcademicMapTreeProps) {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [addingTopicModuleId, setAddingTopicModuleId] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState('');

  // Group root modules vs child topics
  const rootModules = nodes.filter((n) => !n.parentId);
  const getTopics = (moduleId: string) => nodes.filter((n) => n.parentId === moduleId);

  const startEdit = (node: AcademicNodeWithResources) => {
    setEditingNodeId(node.id);
    setEditTitle(node.title);
  };

  const cancelEdit = () => {
    setEditingNodeId(null);
    setEditTitle('');
  };

  const saveEdit = async (nodeId: string) => {
    if (!editTitle.trim()) return;
    try {
      setIsSaving(true);
      await updateAcademicNode(courseId, nodeId, {
        title: editTitle.trim(),
        needsReview: 'no',
      });
      setEditingNodeId(null);
      if (onNodeUpdated) onNodeUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (nodeId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      setIsSaving(true);
      await deleteAcademicNode(courseId, nodeId);
      if (onNodeUpdated) onNodeUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTopic = async (moduleId: string) => {
    if (!newTopicTitle.trim()) return;
    try {
      setIsSaving(true);
      const siblingTopics = getTopics(moduleId);
      await createAcademicNodes(courseId, [
        {
          parentId: moduleId,
          type: 'topic',
          title: newTopicTitle.trim(),
          orderIndex: siblingTopics.length,
          origin: 'user',
          needsReview: 'no',
        },
      ]);
      setAddingTopicModuleId(null);
      setNewTopicTitle('');
      if (onNodeUpdated) onNodeUpdated();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--cf-border)] pb-3">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-[var(--cf-text-primary)]">Academic Map</h3>
        </div>
        <span className="text-xs text-[var(--cf-text-secondary)] font-mono">
          {nodes.length} nodes indexed
        </span>
      </div>

      <div className="space-y-3 font-mono text-xs">
        {/* Course Root */}
        <div className="flex items-center gap-2 text-[var(--cf-text-primary)] font-medium">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span>{courseTitle}</span>
        </div>

        {/* Tree Nodes */}
        {rootModules.length === 0 ? (
          <div className="p-6 rounded-lg bg-[var(--cf-bg-surface-2)]/40 border border-dashed border-[var(--cf-border)] text-center text-[var(--cf-text-secondary)]">
            No syllabus modules extracted yet. Upload a syllabus or lecture note to build the map.
          </div>
        ) : (
          <div className="pl-4 border-l border-[var(--cf-border)] space-y-3">
            {rootModules.map((mod) => {
              const topics = getTopics(mod.id);
              const isEditing = editingNodeId === mod.id;
              const isAddingTopic = addingTopicModuleId === mod.id;

              return (
                <div key={mod.id} className="space-y-2">
                  {/* Module Header */}
                  <div className="flex items-center justify-between group p-2.5 rounded-lg bg-[var(--cf-bg-surface-2)]/60 hover:bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)]">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-blue-400">├──</span>
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="bg-[var(--cf-bg-surface-1)] border border-blue-500 rounded px-2 py-0.5 text-xs text-[var(--cf-text-primary)] outline-none flex-1"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEdit(mod.id)}
                            disabled={isSaving}
                            className="p-1 hover:text-emerald-400"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={cancelEdit} className="p-1 hover:text-rose-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-[var(--cf-text-primary)] truncate">
                            {mod.title}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-2 shrink-0">
                        {mod.needsReview === 'yes' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-950/40 text-amber-400 border border-amber-800/40">
                            <AlertTriangle className="w-2.5 h-2.5" /> Review
                          </span>
                        ) : null}

                        <button
                          onClick={() => setAddingTopicModuleId(mod.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--cf-text-secondary)] hover:text-white transition-opacity"
                          title="Add topic under this module"
                        >
                          <Plus className="w-3 h-3" />
                        </button>

                        <button
                          onClick={() => startEdit(mod)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--cf-text-secondary)] hover:text-white transition-opacity"
                          title="Rename module"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>

                        <button
                          onClick={() => handleDelete(mod.id, mod.title)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--cf-text-secondary)] hover:text-rose-400 transition-opacity"
                          title="Delete module"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Add Topic Input */}
                  {isAddingTopic && (
                    <div className="pl-6 flex items-center gap-2">
                      <span className="text-[var(--cf-text-secondary)]">└──</span>
                      <input
                        type="text"
                        placeholder="New topic title..."
                        value={newTopicTitle}
                        onChange={(e) => setNewTopicTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTopic(mod.id);
                          if (e.key === 'Escape') setAddingTopicModuleId(null);
                        }}
                        className="bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] rounded px-2 py-1 text-xs text-[var(--cf-text-primary)] outline-none flex-1 font-mono"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddTopic(mod.id)}
                        disabled={isSaving}
                        className="p-1 hover:text-emerald-400 text-xs px-2 py-1 rounded bg-[var(--cf-bg-surface-2)]"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddingTopicModuleId(null)}
                        className="p-1 hover:text-rose-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Topics List */}
                  {topics.length > 0 ? (
                    <div className="pl-6 border-l border-[var(--cf-border)] space-y-1.5">
                      {topics.map((top) => {
                        const isTopEditing = editingNodeId === top.id;
                        const linkedRes = top.resources || [];

                        return (
                          <div
                            key={top.id}
                            className="group p-2 rounded-lg hover:bg-[var(--cf-bg-surface-2)]/50 text-[var(--cf-text-secondary)] border border-transparent hover:border-[var(--cf-border)] transition-colors space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-[var(--cf-text-muted)]">└──</span>
                                {isTopEditing ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      type="text"
                                      value={editTitle}
                                      onChange={(e) => setEditTitle(e.target.value)}
                                      className="bg-[var(--cf-bg-surface-1)] border border-blue-500 rounded px-2 py-0.5 text-xs text-[var(--cf-text-primary)] outline-none flex-1"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => saveEdit(top.id)}
                                      disabled={isSaving}
                                      className="p-1 hover:text-emerald-400"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="p-1 hover:text-rose-400"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="truncate text-[var(--cf-text-primary)] font-medium">
                                    {top.title}
                                  </span>
                                )}
                              </div>

                              {!isTopEditing && (
                                <div className="flex items-center gap-2 shrink-0">
                                  {/* Study State Selector */}
                                  <select
                                    value={top.studyState?.state || 'not_started'}
                                    onChange={async (e) => {
                                      const newState = e.target.value as StudyStateValue;
                                      try {
                                        await updateTopicStudyState(courseId, top.id, newState);
                                        if (onNodeUpdated) onNodeUpdated();
                                      } catch (err) {
                                        alert((err as Error).message);
                                      }
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border cursor-pointer focus:outline-none ${
                                      (top.studyState?.state || 'not_started') === 'reviewed'
                                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                                        : (top.studyState?.state || 'not_started') ===
                                            'needs_review'
                                          ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                                          : (top.studyState?.state || 'not_started') === 'learning'
                                            ? 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                                            : 'bg-neutral-800/80 text-neutral-400 border-neutral-700'
                                    }`}
                                  >
                                    <option value="not_started">Not Started</option>
                                    <option value="learning">Learning</option>
                                    <option value="needs_review">Needs Review</option>
                                    <option value="reviewed">Reviewed</option>
                                  </select>

                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => startEdit(top)}
                                      className="p-1 text-[var(--cf-text-secondary)] hover:text-white"
                                      title="Rename topic"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(top.id, top.title)}
                                      className="p-1 text-[var(--cf-text-secondary)] hover:text-rose-400"
                                      title="Delete topic"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Study State Activity Timestamps */}
                            {(top.studyState?.lastStudiedAt || top.studyState?.lastReviewedAt) && (
                              <div className="pl-6 flex items-center gap-3 text-[10px] font-mono text-[var(--cf-text-muted)]">
                                {top.studyState.lastStudiedAt && (
                                  <span>
                                    Studied:{' '}
                                    {new Date(top.studyState.lastStudiedAt).toLocaleDateString(
                                      undefined,
                                      {
                                        month: 'short',
                                        day: 'numeric',
                                      },
                                    )}
                                  </span>
                                )}
                                {top.studyState.lastReviewedAt && (
                                  <>
                                    <span>·</span>
                                    <span>
                                      Reviewed:{' '}
                                      {new Date(top.studyState.lastReviewedAt).toLocaleDateString(
                                        undefined,
                                        {
                                          month: 'short',
                                          day: 'numeric',
                                        },
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Linked Resources Badges */}
                            {linkedRes.length > 0 && (
                              <div className="pl-6 flex flex-wrap gap-1.5 pt-0.5">
                                {linkedRes.map((r) => (
                                  <Link
                                    key={r.linkId}
                                    href={`/resources/${r.resourceId}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-bg-surface-hover)] border border-[var(--cf-border)] text-[var(--cf-text-secondary)] hover:text-white transition-colors"
                                    title={`View ${r.resourceTitle}`}
                                  >
                                    <FileText className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                                    <span className="truncate max-w-[140px]">
                                      {r.resourceTitle}
                                    </span>
                                    {r.pageStart !== null && r.pageStart !== undefined && (
                                      <span className="text-[var(--cf-text-muted)] font-mono">
                                        p.{r.pageStart}
                                        {r.pageEnd && r.pageEnd !== r.pageStart
                                          ? `-${r.pageEnd}`
                                          : ''}
                                      </span>
                                    )}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
