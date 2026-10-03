'use client';

import React, { useState } from 'react';
import type { AcademicNode } from '@campusflow/types';
import { updateAcademicNode } from '../lib/api';
import { FolderTree, Edit2, Check, X, AlertTriangle, Sparkles, UserCheck } from 'lucide-react';

interface AcademicMapTreeProps {
  courseId: string;
  courseTitle: string;
  nodes: AcademicNode[];
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

  // Group root modules vs child topics
  const rootModules = nodes.filter((n) => !n.parentId);
  const getTopics = (moduleId: string) => nodes.filter((n) => n.parentId === moduleId);

  const startEdit = (node: AcademicNode) => {
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
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full bg-surface-1 border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">Academic Knowledge Map</h3>
        </div>
        <span className="text-xs text-text-muted font-mono">{nodes.length} nodes indexed</span>
      </div>

      <div className="space-y-3 font-mono text-xs">
        {/* Course Root */}
        <div className="flex items-center gap-2 text-text-primary font-medium">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span>{courseTitle}</span>
        </div>

        {/* Tree Nodes */}
        {rootModules.length === 0 ? (
          <div className="p-4 rounded-md bg-surface-2/40 border border-dashed border-border text-center text-text-muted">
            No syllabus modules extracted yet. Upload a syllabus or lecture note to build the map.
          </div>
        ) : (
          <div className="pl-4 border-l border-white/10 space-y-3">
            {rootModules.map((mod) => {
              const topics = getTopics(mod.id);
              const isEditing = editingNodeId === mod.id;

              return (
                <div key={mod.id} className="space-y-2">
                  {/* Module Header */}
                  <div className="flex items-center justify-between group p-2 rounded bg-surface-2/40 hover:bg-surface-2 border border-white/5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-accent">├──</span>
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="bg-surface-1 border border-accent rounded px-2 py-0.5 text-xs text-text-primary outline-none flex-1"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEdit(mod.id)}
                            disabled={isSaving}
                            className="p-1 hover:text-success"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={cancelEdit} className="p-1 hover:text-danger">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-semibold text-text-primary truncate">
                          {mod.title}
                        </span>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-2 shrink-0">
                        {mod.needsReview === 'yes' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-warning/20 text-warning border border-warning/30">
                            <AlertTriangle className="w-3 h-3" /> Needs Review
                          </span>
                        ) : null}

                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
                            mod.origin === 'user'
                              ? 'bg-blue-950/40 border-blue-800/40 text-blue-300'
                              : 'bg-surface-1 border-white/5 text-text-muted'
                          }`}
                        >
                          {mod.origin === 'user' ? (
                            <>
                              <UserCheck className="w-2.5 h-2.5" /> User Edited
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-2.5 h-2.5 text-accent" /> Inferred [
                              {Math.round((Number(mod.confidence) || 0.8) * 100)}%]
                            </>
                          )}
                        </span>

                        <button
                          onClick={() => startEdit(mod)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition-opacity"
                          title="Edit module title"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Topics List */}
                  {topics.length > 0 ? (
                    <div className="pl-6 border-l border-white/5 space-y-1">
                      {topics.map((top) => {
                        const isTopEditing = editingNodeId === top.id;
                        return (
                          <div
                            key={top.id}
                            className="flex items-center justify-between group p-1.5 rounded hover:bg-surface-2/40 text-text-secondary"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-text-muted/60">└──</span>
                              {isTopEditing ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="bg-surface-1 border border-accent rounded px-2 py-0.5 text-xs text-text-primary outline-none flex-1"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => saveEdit(top.id)}
                                    disabled={isSaving}
                                    className="p-1 hover:text-success"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={cancelEdit} className="p-1 hover:text-danger">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="truncate">{top.title}</span>
                              )}
                            </div>

                            {!isTopEditing && (
                              <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => startEdit(top)}
                                  className="p-1 text-text-muted hover:text-text-primary"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
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
