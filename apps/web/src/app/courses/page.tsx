'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Plus, ArrowRight, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchCourses, createCourse } from '@/lib/api';
import type { Course } from '@campusflow/types';

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('Fall 2026');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchCourses();
      setCourses(data);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load courses';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;

    try {
      setCreating(true);
      setError(null);
      await createCourse({
        code: code.trim().toUpperCase(),
        title: title.trim(),
        term: term.trim() || undefined,
      });
      setCode('');
      setTitle('');
      setShowModal(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create course';
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--cf-border)]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[var(--cf-primary)]" />
            Courses
          </h1>
          <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
            Registered courses and curriculum structures in your Second Brain.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-medium transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Course</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Courses Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
          Loading courses...
        </div>
      ) : courses.length === 0 ? (
        <div className="p-12 rounded-xl border border-dashed border-[var(--cf-border)] text-center bg-[var(--cf-bg-surface-1)]">
          <Layers className="w-8 h-8 text-[var(--cf-text-secondary)] mx-auto mb-3" />
          <h3 className="text-sm font-medium text-white mb-1">No courses found</h3>
          <p className="text-xs text-[var(--cf-text-secondary)] mb-4">
            Add your university course to begin uploading syllabi and notes.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="px-3.5 py-2 rounded-lg bg-[var(--cf-primary)] text-white text-xs font-medium"
          >
            Create First Course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="group p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:border-[var(--cf-primary)]/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-primary)] border border-[var(--cf-border)]">
                    {course.code}
                  </span>
                  <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
                    {course.term || 'Term Active'}
                  </span>
                </div>
                <h2 className="text-base font-medium text-white group-hover:text-[var(--cf-primary)] transition-colors mb-2">
                  {course.title}
                </h2>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--cf-border)] flex items-center justify-between text-xs text-[var(--cf-text-secondary)] font-mono">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Syllabus: {course.syllabusStatus}
                </span>
                <span className="text-[var(--cf-primary)] flex items-center group-hover:translate-x-1 transition-transform">
                  View <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add Course Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] p-6 shadow-xl">
            <h2 className="text-base font-semibold text-white mb-1">Add Course</h2>
            <p className="text-xs text-[var(--cf-text-secondary)] mb-4">
              Enter the course identifier and title from your academic curriculum.
            </p>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--cf-text-secondary)] mb-1">
                  Course Code <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PHY2001, CSE3001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--cf-primary)] uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--cf-text-secondary)] mb-1">
                  Course Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electromagnetic Field Theory"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--cf-text-secondary)] mb-1">
                  Academic Term
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fall 2026"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="w-full bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-md border border-[var(--cf-border)] text-xs text-[var(--cf-text-secondary)] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-md bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
