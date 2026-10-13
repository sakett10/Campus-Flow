'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  AlertCircle,
  Loader2,
  CheckCircle2,
  X,
  FileText,
  Lock,
  RefreshCw,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import type { ResourceType, BatchUploadItemResult } from '@campusflow/types';
import { uploadBatchResources, fetchResource } from '@/lib/api';

interface UploadDropzoneProps {
  courseId?: string;
  onUploadSuccess?: () => void;
}

export type FileUploadState =
  'waiting' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed' | 'duplicate';

export interface StagedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  format: string;
  isValid: boolean;
  validationError?: string;
  status: FileUploadState;
  resourceId?: string;
  errorMessage?: string;
}

const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.markdown'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_BATCH_FILES = 10;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileFormat(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (ext === '.pdf') return 'PDF';
  if (ext === '.txt') return 'TXT';
  if (ext === '.md' || ext === '.markdown') return 'MD';
  return ext.replace('.', '').toUpperCase() || 'UNKNOWN';
}

function validateStagedFile(file: File): { isValid: boolean; error?: string } {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      error: `Unsupported format (${ext || 'unknown'}). Supported: PDF, TXT, MD.`,
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size (${formatBytes(file.size)}) exceeds 50 MB limit.`,
    };
  }
  if (file.size === 0) {
    return {
      isValid: false,
      error: 'File is empty (0 bytes).',
    };
  }
  return { isValid: true };
}

export function UploadDropzone({ courseId, onUploadSuccess }: UploadDropzoneProps) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ResourceType>('lecture_notes');
  const [duplicateAction, setDuplicateAction] = useState<'reject' | 'replace' | 'keep_both'>(
    'reject',
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFilesToStaging = (newFiles: File[]) => {
    setGlobalError(null);

    setStagedFiles((prev) => {
      const remainingSlots = MAX_BATCH_FILES - prev.length;
      if (remainingSlots <= 0) {
        setGlobalError(`Maximum batch limit reached (${MAX_BATCH_FILES} files).`);
        return prev;
      }

      const filesToAdd = newFiles.slice(0, remainingSlots);
      if (newFiles.length > remainingSlots) {
        setGlobalError(
          `Only ${remainingSlots} files added. Max batch limit is ${MAX_BATCH_FILES} files.`,
        );
      }

      const mapped: StagedFileItem[] = filesToAdd.map((file) => {
        const val = validateStagedFile(file);
        return {
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          size: file.size,
          format: getFileFormat(file.name),
          isValid: val.isValid,
          validationError: val.error,
          status: 'waiting',
        };
      });

      return [...prev, ...mapped];
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToStaging(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToStaging(Array.from(e.target.files));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeStagedFile = (id: string) => {
    if (isUploading) return;
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAllStagedFiles = () => {
    if (isUploading) return;
    setStagedFiles([]);
    setGlobalError(null);
    setUploadStatus(null);
  };

  const startBatchUpload = async () => {
    if (isUploading) return;
    setGlobalError(null);

    const validItems = stagedFiles.filter((item) => item.isValid && item.status !== 'completed');
    if (validItems.length === 0) {
      setGlobalError('Please select at least one valid document to upload.');
      return;
    }

    // 1. Session verification
    if (!isLoaded) {
      setGlobalError('Authentication service is initializing. Please wait a moment.');
      return;
    }
    if (!isSignedIn) {
      setGlobalError('Authentication token required. Please sign in to upload course documents.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadStatus(`Acquiring secure session and uploading ${validItems.length} documents...`);

      // Mark valid items as uploading
      setStagedFiles((prev) =>
        prev.map((item) =>
          validItems.some((v) => v.id === item.id) ? { ...item, status: 'uploading' } : item,
        ),
      );

      // Force fresh token to prevent stale session expiration during upload
      const token = await getToken({ skipCache: true }).catch(() => null);
      if (!token) {
        throw new Error('Authentication token required. Please sign in again.');
      }

      // Execute batch upload
      const batchResponse = await uploadBatchResources(
        validItems.map((item) => item.file),
        {
          courseId: courseId || null,
          type: selectedType,
          duplicateAction,
          token,
        },
      );

      // Map batch results back to staged files
      const updatedUploadedItems: Array<{ id: string; resourceId?: string }> = [];

      setStagedFiles((prev) =>
        prev.map((item) => {
          const match = batchResponse.results.find(
            (r: BatchUploadItemResult) => r.originalName === item.name || r.fileName === item.name,
          );
          if (!match) return item;

          if (match.status === 'uploaded') {
            if (match.resourceId) {
              updatedUploadedItems.push({ id: item.id, resourceId: match.resourceId });
            }
            return {
              ...item,
              status: 'uploaded',
              resourceId: match.resourceId,
              errorMessage: undefined,
            };
          }
          if (match.status === 'conflict') {
            return {
              ...item,
              status: 'duplicate',
              errorMessage: match.error || 'Duplicate document detected.',
            };
          }
          return {
            ...item,
            status: 'failed',
            errorMessage: match.error || 'Validation or storage rejected file.',
          };
        }),
      );

      setUploadStatus(`Upload accepted. Ingestion queued for background processing.`);

      // Poll background status for queued resources
      if (updatedUploadedItems.length > 0) {
        pollProcessingStatus(updatedUploadedItems, token);
      } else {
        setIsUploading(false);
      }

      if (onUploadSuccess && batchResponse.summary.succeeded > 0) {
        onUploadSuccess();
      }
    } catch (err: unknown) {
      setIsUploading(false);
      setUploadStatus(null);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setGlobalError(msg);
      // Mark active uploading items as failed
      setStagedFiles((prev) =>
        prev.map((item) =>
          item.status === 'uploading' ? { ...item, status: 'failed', errorMessage: msg } : item,
        ),
      );
    }
  };

  const pollProcessingStatus = async (
    items: Array<{ id: string; resourceId?: string }>,
    token: string,
  ) => {
    let attempts = 0;
    const maxAttempts = 5;

    const checkStatus = async () => {
      attempts++;
      let anyPending = false;

      for (const item of items) {
        if (!item.resourceId) continue;
        try {
          const res = await fetchResource(item.resourceId, token);
          if (!res) {
            anyPending = true;
            continue;
          }
          if (res.processingStatus === 'ready') {
            setStagedFiles((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, status: 'completed' } : p)),
            );
          } else if (res.processingStatus === 'failed') {
            setStagedFiles((prev) =>
              prev.map((p) =>
                p.id === item.id
                  ? {
                      ...p,
                      status: 'failed',
                      errorMessage: res.errorMessage || 'Ingestion failed.',
                    }
                  : p,
              ),
            );
          } else {
            // queued or processing
            anyPending = true;
            setStagedFiles((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, status: 'processing' } : p)),
            );
          }
        } catch {
          // Keep current state
        }
      }

      if (anyPending && attempts < maxAttempts) {
        setTimeout(checkStatus, 2000);
      } else {
        setIsUploading(false);
        setUploadStatus(null);
        if (onUploadSuccess) onUploadSuccess();
      }
    };

    setTimeout(checkStatus, 1500);
  };

  // Signed out state protection
  if (isLoaded && !isSignedIn) {
    return (
      <div className="p-6 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Authentication Required</h3>
          <p className="text-xs text-[var(--cf-text-secondary)] mt-1 max-w-sm mx-auto">
            You must be signed in with an active university account to upload and organize documents
            for this course.
          </p>
        </div>
        <div className="pt-2">
          <a
            href="/sign-in"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--cf-primary)] text-white hover:opacity-90 transition-opacity"
          >
            Sign In to Upload
          </a>
        </div>
      </div>
    );
  }

  const validCount = stagedFiles.filter((f) => f.isValid).length;
  const invalidCount = stagedFiles.filter((f) => !f.isValid).length;
  const completedCount = stagedFiles.filter(
    (f) => f.status === 'completed' || f.status === 'uploaded',
  ).length;
  const failedCount = stagedFiles.filter(
    (f) => f.status === 'failed' || f.status === 'duplicate',
  ).length;

  return (
    <div className="w-full space-y-4">
      {/* Dropzone Interactive Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!isUploading) fileInputRef.current?.click();
        }}
        className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          isDragging
            ? 'border-[var(--cf-primary)] bg-[var(--cf-primary)]/10 scale-[0.99]'
            : 'border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:border-[var(--cf-border-hover)] hover:bg-[var(--cf-bg-surface-2)]/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={isUploading}
        />

        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] flex items-center justify-center text-[var(--cf-primary)]">
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-white">
              {isUploading ? uploadStatus : 'Drag & drop multiple files, or click to browse'}
            </p>
            <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
              Supports PDF, Plain Text (.txt), and Markdown (.md) up to 50 MB each (Max{' '}
              {MAX_BATCH_FILES} files per batch)
            </p>
          </div>
        </div>
      </div>

      {/* Staged Files List */}
      {stagedFiles.length > 0 && (
        <div className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] overflow-hidden divide-y divide-[var(--cf-border)]">
          <div className="p-3 bg-[var(--cf-bg-surface-2)]/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--cf-primary)]" />
              <span className="text-xs font-semibold text-white font-mono">
                Selected Documents ({stagedFiles.length}/{MAX_BATCH_FILES})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearAllStagedFiles}
                disabled={isUploading}
                className="text-[11px] text-[var(--cf-text-secondary)] hover:text-rose-400 font-mono transition-colors disabled:opacity-50"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--cf-border)]">
            {stagedFiles.map((item) => (
              <div
                key={item.id}
                className="p-3 flex items-center justify-between hover:bg-[var(--cf-bg-surface-2)]/30 transition-colors text-xs"
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <div className="p-1.5 rounded bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] font-mono text-[10px] uppercase font-bold text-[var(--cf-primary)] shrink-0">
                    {item.format}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--cf-text-secondary)] font-mono mt-0.5">
                      <span>{formatBytes(item.size)}</span>
                      {item.isValid ? (
                        <span className="text-emerald-400">Ready</span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {item.validationError}
                        </span>
                      )}
                      {item.status === 'uploading' && (
                        <span className="text-sky-400 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                        </span>
                      )}
                      {item.status === 'uploaded' && (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Stored (Ingestion Queued)
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="text-amber-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Ingesting Chunks...
                        </span>
                      )}
                      {item.status === 'completed' && (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </span>
                      )}
                      {item.status === 'duplicate' && (
                        <span className="text-amber-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Duplicate (Skipped)
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {item.errorMessage || 'Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => removeStagedFile(item.id)}
                    className="p-1 rounded text-[var(--cf-text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Options & Upload Action Bar */}
          <div className="p-3 bg-[var(--cf-bg-surface-2)]/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <label className="text-[var(--cf-text-secondary)] font-mono text-[11px]">
                  Type:
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as ResourceType)}
                  disabled={isUploading}
                  className="bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] rounded px-2 py-1 text-xs text-white outline-none focus:border-[var(--cf-primary)] disabled:opacity-50"
                >
                  <option value="lecture_notes">Lecture Notes</option>
                  <option value="syllabus">Syllabus</option>
                  <option value="question_bank">Question Bank</option>
                  <option value="reference_material">Reference Material</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-[var(--cf-text-secondary)] font-mono text-[11px]">
                  Duplicates:
                </label>
                <select
                  value={duplicateAction}
                  onChange={(e) =>
                    setDuplicateAction(e.target.value as 'reject' | 'replace' | 'keep_both')
                  }
                  disabled={isUploading}
                  className="bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] rounded px-2 py-1 text-xs text-white outline-none focus:border-[var(--cf-primary)] disabled:opacity-50"
                >
                  <option value="reject">Reject Duplicates</option>
                  <option value="replace">Replace Existing</option>
                  <option value="keep_both">Keep Both</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={startBatchUpload}
              disabled={isUploading || validCount === 0}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--cf-primary)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-opacity"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading Batch...
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5" />
                  Upload {validCount} Document{validCount === 1 ? '' : 's'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Batch Summary Progress Bar */}
      {stagedFiles.length > 0 && (
        <div className="p-3 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] flex items-center justify-between text-xs font-mono text-[var(--cf-text-secondary)]">
          <div className="flex items-center gap-4">
            <span>
              Selected: <strong className="text-white">{stagedFiles.length}</strong>
            </span>
            <span>
              Valid: <strong className="text-emerald-400">{validCount}</strong>
            </span>
            {invalidCount > 0 && (
              <span>
                Invalid: <strong className="text-rose-400">{invalidCount}</strong>
              </span>
            )}
            {completedCount > 0 && (
              <span>
                Stored: <strong className="text-emerald-400">{completedCount}</strong>
              </span>
            )}
            {failedCount > 0 && (
              <span>
                Failed/Skipped: <strong className="text-rose-400">{failedCount}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Global Error Notice */}
      {globalError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}
    </div>
  );
}
