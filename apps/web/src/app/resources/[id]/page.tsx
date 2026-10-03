'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Layers,
  Hash,
  Database,
  Trash2,
  RefreshCw,
  AlertCircle,
  Clock,
  Search,
} from 'lucide-react';
import {
  fetchResource,
  fetchResourceChunks,
  fetchCourse,
  deleteResource,
  retryResource,
} from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { ProcessingStepper } from '@/components/ProcessingStepper';
import type { Resource, ResourceChunk, Course } from '@campusflow/types';

export default function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const resourceId = resolvedParams.id;
  const router = useRouter();

  const [resource, setResource] = useState<Resource | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [chunks, setChunks] = useState<ResourceChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchResource(resourceId);
      if (!res) {
        setResource(null);
        return;
      }
      setResource(res);

      const [c, ch] = await Promise.all([
        res.courseId ? fetchCourse(res.courseId) : Promise.resolve(null),
        fetchResourceChunks(resourceId),
      ]);
      setCourse(c);
      setChunks(ch);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load resource details';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [resourceId]);

  const handleRetry = async () => {
    try {
      setRetrying(true);
      await retryResource(resourceId);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      alert(`Retry failed: ${msg}`);
    } finally {
      setRetrying(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete this resource? All extracted text chunks, search vectors, and the object storage file will be permanently purged.',
      )
    ) {
      return;
    }

    try {
      setDeleting(true);
      await deleteResource(resourceId);
      if (resource?.courseId) {
        router.push(`/courses/${resource.courseId}`);
      } else {
        router.push('/courses');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      alert(`Delete failed: ${msg}`);
      setDeleting(false);
    }
  };

  if (loading && !resource) {
    return (
      <div className="py-20 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
        Loading resource provenance...
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
        <h2 className="text-sm font-semibold text-white mb-1">Resource Not Found</h2>
        <p className="text-xs text-[var(--cf-text-secondary)] mb-4">
          The requested document does not exist or has been removed.
        </p>
        <Link
          href="/courses"
          className="inline-flex items-center space-x-1.5 text-xs text-[var(--cf-primary)] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to courses</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--cf-border)]">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {course ? (
              <Link
                href={`/courses/${course.id}`}
                className="inline-flex items-center space-x-1 text-xs text-[var(--cf-text-secondary)] hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{course.code} Course Workspace</span>
              </Link>
            ) : (
              <Link
                href="/courses"
                className="inline-flex items-center space-x-1 text-xs text-[var(--cf-text-secondary)] hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Courses</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white">{resource.title}</h1>
            <StatusBadge status={resource.processingStatus} />
          </div>
          <p className="text-xs text-[var(--cf-text-secondary)] mt-1 font-mono">
            Type: {resource.type} · Size:{' '}
            {resource.sizeBytes ? `${(resource.sizeBytes / 1024).toFixed(1)} KB` : '0 KB'} · Content
            Hash: {resource.contentHash ? `${resource.contentHash.slice(0, 12)}...` : 'N/A'}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {resource.processingStatus === 'failed' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-xs text-white font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
              <span>Retry Extraction</span>
            </button>
          )}

          {resource.courseId && (
            <Link
              href={`/search?courseId=${resource.courseId}`}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:bg-[var(--cf-bg-surface-2)] text-xs text-white transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
              <span>Search in Course</span>
            </Link>
          )}

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/40 text-xs text-rose-300 font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Honest Milestone Stepper */}
      <ProcessingStepper
        status={resource.processingStatus}
        pageCount={resource.pageCount}
        errorMessage={resource.errorMessage}
      />

      {/* Metadata Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
          <div className="text-[11px] font-mono text-[var(--cf-text-secondary)] mb-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
            Pages Extracted
          </div>
          <div className="text-xl font-semibold text-white">
            {resource.pageCount !== null && resource.pageCount !== undefined
              ? resource.pageCount
              : 'Pending'}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
          <div className="text-[11px] font-mono text-[var(--cf-text-secondary)] mb-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            FTS Searchable Chunks
          </div>
          <div className="text-xl font-semibold text-white">{chunks.length}</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
          <div className="text-[11px] font-mono text-[var(--cf-text-secondary)] mb-1 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-sky-400" />
            Extraction Version
          </div>
          <div className="text-xl font-semibold text-white font-mono">
            {resource.extractionVersion || 'v1.0'}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
          <div className="text-[11px] font-mono text-[var(--cf-text-secondary)] mb-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Uploaded At
          </div>
          <div className="text-xs font-mono text-white mt-1">
            {new Date(resource.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Extracted Chunks & Provenance Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono">
              Extracted Chunks &amp; Page Provenance ({chunks.length})
            </h2>
            <p className="text-[11px] text-[var(--cf-text-secondary)] mt-0.5">
              Normalized text indexed in PostgreSQL FTS for grounded retrieval.
            </p>
          </div>
        </div>

        {chunks.length === 0 ? (
          <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center text-xs text-[var(--cf-text-secondary)]">
            {resource.processingStatus === 'ready'
              ? 'No chunks generated for this resource.'
              : 'Chunks will appear here once background worker completes extraction and normalization.'}
          </div>
        ) : (
          <div className="space-y-3">
            {chunks.map((chunk) => (
              <div
                key={chunk.id}
                className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-2 hover:border-[var(--cf-primary)]/30 transition-colors"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--cf-text-secondary)] border-b border-[var(--cf-border)] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-white">
                      Chunk #{chunk.sequence + 1}
                    </span>
                    <span className="text-[var(--cf-primary)]">
                      {chunk.pageStart === chunk.pageEnd
                        ? `Page ${chunk.pageStart}`
                        : `Pages ${chunk.pageStart}-${chunk.pageEnd}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>{chunk.charCount} chars</span>
                    <span>~{chunk.tokenCount} tokens</span>
                  </div>
                </div>

                <p className="text-xs text-[var(--cf-text-primary)] leading-relaxed whitespace-pre-wrap font-sans">
                  {chunk.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
