'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, BookOpen, FileText, ArrowRight, ShieldCheck, Database } from 'lucide-react';
import { fetchCourses, fetchResources } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import type { Course, Resource } from '@campusflow/types';

export default function TodayPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [c, r] = await Promise.all([fetchCourses(), fetchResources()]);
        setCourses(c);
        setResources(r.slice(0, 5));
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header & Search Shell */}
      <div className="border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)] p-6 sm:p-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--cf-bg-surface-2)] text-xs text-[var(--cf-text-secondary)] font-mono mb-4 border border-[var(--cf-border)]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Second Brain · Verified Grounding Active</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">
            Today
          </h1>
          <p className="text-sm text-[var(--cf-text-secondary)] leading-relaxed mb-6">
            CampusFlow academic intelligence center. Ingest syllabi, lecture notes, and textbooks to
            construct your verified academic knowledge graph with zero hallucinations.
          </p>

          {/* Quick Search Input */}
          <form onSubmit={handleSearch} className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-[var(--cf-text-secondary)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search extracted concepts, equations, and lecture topics across courses..."
              className="w-full bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] rounded-lg pl-10 pr-24 py-2.5 text-xs text-white placeholder-[var(--cf-text-secondary)] focus:outline-none focus:border-[var(--cf-primary)] transition-colors"
            />
            <button
              type="submit"
              className="absolute right-1.5 px-3 py-1.5 bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white rounded text-xs font-medium transition-colors"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Grid: Courses & Recent Ingested Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Courses */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-[var(--cf-primary)]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono">
                Enrolled Courses
              </h2>
            </div>
            <Link
              href="/courses"
              className="text-xs text-[var(--cf-primary)] hover:underline flex items-center space-x-1"
            >
              <span>Manage Courses</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-2 py-8 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
                Loading courses...
              </div>
            ) : courses.length === 0 ? (
              <div className="col-span-2 p-6 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center">
                <p className="text-xs text-[var(--cf-text-secondary)] mb-3">
                  No courses registered yet.
                </p>
                <Link
                  href="/courses"
                  className="inline-flex items-center px-3 py-1.5 bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] border border-[var(--cf-border)] rounded text-xs text-white transition-colors"
                >
                  Create your first course
                </Link>
              </div>
            ) : (
              courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group block p-4 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:border-[var(--cf-primary)]/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-primary)] border border-[var(--cf-border)]">
                      {course.code}
                    </span>
                    <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
                      {course.term || 'Current'}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-white group-hover:text-[var(--cf-primary)] transition-colors mb-3 line-clamp-1">
                    {course.title}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-[var(--cf-text-secondary)] font-mono border-t border-[var(--cf-border)] pt-2 mt-2">
                    <span>Syllabus: {course.syllabusStatus}</span>
                    <span className="text-[var(--cf-primary)] flex items-center group-hover:translate-x-0.5 transition-transform">
                      Open <ArrowRight className="w-3 h-3 ml-1" />
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Ingestion Activity */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono">
              Recent Resources
            </h2>
          </div>

          <div className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] divide-y divide-[var(--cf-border)]">
            {loading ? (
              <div className="p-6 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
                Loading activity...
              </div>
            ) : resources.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--cf-text-secondary)]">
                No resources uploaded yet. Upload a syllabus or lecture note in a course.
              </div>
            ) : (
              resources.map((res) => (
                <Link
                  key={res.id}
                  href={`/resources/${res.id}`}
                  className="block p-3.5 hover:bg-[var(--cf-bg-surface-2)]/50 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-white group-hover:text-[var(--cf-primary)] truncate max-w-[180px]">
                      {res.title}
                    </span>
                    <StatusBadge status={res.processingStatus} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[var(--cf-text-secondary)] font-mono">
                    <span className="uppercase">{res.type}</span>
                    <span>{res.pageCount ? `${res.pageCount} pgs` : 'Pending'}</span>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Architecture verification note */}
          <div className="p-3.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-[11px] text-[var(--cf-text-secondary)] space-y-2">
            <div className="flex items-center gap-1.5 text-white font-medium">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>PostgreSQL FTS + GIN</span>
            </div>
            <p>
              Grounded queries use database-native Full Text Search over extracted document chunks.
              Deterministic citations with exact page provenance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
