'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Search,
  Trash2,
  ExternalLink,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  fetchCourse,
  fetchResources,
  fetchAcademicMap,
  fetchAssessments,
  deleteResource,
} from '@/lib/api';
import { UploadDropzone } from '@/components/UploadDropzone';
import { AcademicMapTree } from '@/components/AcademicMapTree';
import { AssessmentManager } from '@/components/AssessmentManager';
import { StatusBadge } from '@/components/StatusBadge';
import type {
  Course,
  Resource,
  AcademicNodeWithResources,
  AssessmentWithTopics,
} from '@campusflow/types';

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const courseId = resolvedParams.id;

  const [course, setCourse] = useState<Course | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [academicNodes, setAcademicNodes] = useState<AcademicNodeWithResources[]>([]);
  const [assessments, setAssessments] = useState<AssessmentWithTopics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [c, r, m, a] = await Promise.all([
        fetchCourse(courseId),
        fetchResources(courseId),
        fetchAcademicMap(courseId),
        fetchAssessments(courseId),
      ]);
      setCourse(c);
      setResources(r);
      setAcademicNodes(m);
      setAssessments(a);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load course details';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

  const handleDeleteResource = async (resourceId: string, title: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${title}"? This will clean up all extracted chunks and object storage.`,
      )
    ) {
      return;
    }

    try {
      setDeletingId(resourceId);
      await deleteResource(resourceId);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      alert(`Deletion failed: ${msg}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && !course) {
    return (
      <div className="py-20 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
        Loading course workspace...
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
        <h2 className="text-sm font-semibold text-white mb-1">Course Not Found</h2>
        <p className="text-xs text-[var(--cf-text-secondary)] mb-4">
          The requested course record does not exist or has been removed.
        </p>
        <Link
          href="/courses"
          className="inline-flex items-center space-x-1.5 text-xs text-[var(--cf-primary)] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to courses</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back button & Course Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--cf-border)]">
        <div>
          <Link
            href="/courses"
            className="inline-flex items-center space-x-1 text-xs text-[var(--cf-text-secondary)] hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Courses</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-primary)] border border-[var(--cf-border)]">
              {course.code}
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{course.title}</h1>
          </div>
          <p className="text-xs text-[var(--cf-text-secondary)] mt-1 font-mono">
            {course.term || 'Fall 2026'} · Syllabus Status: {course.syllabusStatus}
          </p>
        </div>

        {/* Action button: Search in Course */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            className="p-2 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] hover:text-white transition-colors"
            title="Refresh course data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href={`/search?courseId=${course.id}`}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] border border-[var(--cf-border)] text-xs text-white transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
            <span>Search in {course.code}</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Two Column Layout: Left (Upload & Resources) | Right (Academic Map) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Resources and Upload Dropzone */}
        <div className="lg:col-span-6 space-y-6">
          {/* Upload Dropzone */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono mb-3 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
              Ingest Document (PDF, TXT, MD)
            </h2>
            <UploadDropzone courseId={course.id} onUploadSuccess={loadData} />
          </div>

          {/* Resources List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono">
                Course Resources ({resources.length})
              </h2>
            </div>

            {resources.length === 0 ? (
              <div className="p-6 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center text-xs text-[var(--cf-text-secondary)]">
                No documents uploaded yet. Drop a PDF syllabus or lecture note above.
              </div>
            ) : (
              <div className="divide-y divide-[var(--cf-border)] rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] overflow-hidden">
                {resources.map((res) => (
                  <div
                    key={res.id}
                    className="p-4 flex items-center justify-between hover:bg-[var(--cf-bg-surface-2)]/40 transition-colors"
                  >
                    <div className="flex items-start space-x-3 min-w-0 pr-4">
                      <div className="p-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-[var(--cf-primary)] shrink-0 mt-0.5">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/resources/${res.id}`}
                          className="text-xs font-medium text-white hover:text-[var(--cf-primary)] transition-colors truncate block"
                        >
                          {res.title}
                        </Link>
                        <div className="flex items-center gap-3 text-[11px] text-[var(--cf-text-secondary)] font-mono mt-1">
                          <span className="uppercase">{res.type}</span>
                          <span>·</span>
                          <span>{res.pageCount ? `${res.pageCount} pgs` : 'Pending'}</span>
                          <span>·</span>
                          <span>
                            {res.sizeBytes ? `${(res.sizeBytes / 1024).toFixed(1)} KB` : '0 KB'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      <StatusBadge status={res.processingStatus} />

                      <Link
                        href={`/resources/${res.id}`}
                        className="p-1.5 rounded hover:bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] hover:text-white transition-colors"
                        title="View Resource details & chunks"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>

                      <button
                        onClick={() => handleDeleteResource(res.id, res.title)}
                        disabled={deletingId === res.id}
                        className="p-1.5 rounded hover:bg-rose-950/50 text-[var(--cf-text-secondary)] hover:text-rose-400 transition-colors disabled:opacity-50"
                        title="Delete resource"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Academic Map Tree */}
        <div className="lg:col-span-6 space-y-3">
          <AcademicMapTree
            courseId={course.id}
            courseTitle={course.title}
            nodes={academicNodes}
            onNodeUpdated={loadData}
          />
        </div>
      </div>

      {/* Full Width Section: Assessment & Academic Topics Linkage */}
      <div className="pt-6 border-t border-[var(--cf-border)]">
        <AssessmentManager
          courseId={course.id}
          courseTitle={course.title}
          assessments={assessments}
          academicNodes={academicNodes}
          onAssessmentsUpdated={loadData}
        />
      </div>
    </div>
  );
}
