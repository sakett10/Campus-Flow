'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search as SearchIcon, FileText, ExternalLink, ShieldCheck, Filter } from 'lucide-react';
import { searchContent, fetchCourses } from '@/lib/api';
import type { SearchResultItem, Course } from '@campusflow/types';

function SearchComponent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get('q') || '';
  const initialCourseId = searchParams.get('courseId') || '';

  const [query, setQuery] = useState(initialQuery);
  const [courseId, setCourseId] = useState(initialCourseId);
  const [courses, setCourses] = useState<Course[]>([]);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    fetchCourses().then(setCourses).catch(console.error);
  }, []);

  useEffect(() => {
    if (initialQuery.trim()) {
      handleSearch(initialQuery, initialCourseId);
    }
  }, [initialQuery, initialCourseId]);

  const handleSearch = async (q: string, cId?: string) => {
    if (!q.trim()) return;
    try {
      setLoading(true);
      setSearched(true);
      const data = await searchContent(q.trim(), cId || undefined);
      setResults(data.results);
      setTotalResults(data.totalResults);
    } catch (err) {
      console.error('Search error', err);
      setResults([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (courseId) params.set('courseId', courseId);
    router.push(`/search?${params.toString()}`);
    handleSearch(query, courseId);
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)] p-6 sm:p-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--cf-bg-surface-2)] text-xs text-[var(--cf-text-secondary)] font-mono mb-4 border border-[var(--cf-border)]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>PostgreSQL Full Text Search · Strict Source Grounding</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-white mb-2">
            Grounded Academic Search
          </h1>
          <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed mb-6">
            Search across your indexed syllabi, textbooks, and lecture notes. Every result is
            directly cited from verified documents with exact page numbers.
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="relative flex items-center">
              <SearchIcon className="w-4 h-4 absolute left-3.5 text-[var(--cf-text-secondary)] pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter concepts, theorems, or keywords (e.g. 'Coulomb', 'Maxwell', 'relational algebra')..."
                className="w-full bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] rounded-lg pl-10 pr-24 py-2.5 text-xs text-white placeholder-[var(--cf-text-secondary)] focus:outline-none focus:border-[var(--cf-primary)] transition-colors"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-1.5 px-3.5 py-1.5 bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Course Filter */}
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--cf-text-secondary)]">
              <Filter className="w-3.5 h-3.5" />
              <span>Scope:</span>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
              >
                <option value="">All Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </select>
            </div>
          </form>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-16 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
            Scanning tsvector index and ranking matching chunks...
          </div>
        ) : searched && results.length === 0 ? (
          <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center text-xs text-[var(--cf-text-secondary)]">
            No matching source passages found for &quot;{query}&quot;. Try broader terms or check
            that your documents have completed processing.
          </div>
        ) : (
          <div>
            {searched && (
              <div className="flex items-center justify-between text-xs font-mono text-[var(--cf-text-secondary)] mb-4">
                <span>
                  Found <strong className="text-white">{totalResults}</strong> source-grounded match
                  {totalResults === 1 ? '' : 'es'}
                </span>
                <span>Ranked by PostgreSQL ts_rank</span>
              </div>
            )}

            <div className="space-y-4">
              {results.map((item, idx) => (
                <div
                  key={item.chunkId}
                  className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:border-[var(--cf-primary)]/40 transition-colors space-y-3"
                >
                  {/* Result Provenance Chip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono border-b border-[var(--cf-border)] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-primary)] font-semibold border border-[var(--cf-border)]">
                        #{idx + 1}
                      </span>
                      <span className="text-white font-medium flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-sky-400" />
                        {item.resourceTitle}
                      </span>
                      <span className="text-[var(--cf-text-secondary)]">·</span>
                      <span className="text-emerald-400 font-semibold">
                        {item.pageStart === item.pageEnd
                          ? `Page ${item.pageStart}`
                          : `Pages ${item.pageStart}-${item.pageEnd}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-[var(--cf-text-secondary)]">
                        Rank: {item.rank.toFixed(3)}
                      </span>
                      <Link
                        href={`/resources/${item.resourceId}`}
                        className="inline-flex items-center space-x-1 text-xs text-[var(--cf-primary)] hover:underline"
                      >
                        <span>View Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>

                  {/* Extracted snippet */}
                  <div className="text-xs text-[var(--cf-text-primary)] leading-relaxed bg-[var(--cf-bg-surface-2)]/40 p-3.5 rounded-lg border border-[var(--cf-border)] font-sans whitespace-pre-wrap">
                    {item.matchedText}
                  </div>

                  {/* Grounding guarantee footer */}
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--cf-text-secondary)] font-mono">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>
                      Direct text extraction from verified student document · Chunk #
                      {item.chunkId.slice(0, 8)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
          Loading search workspace...
        </div>
      }
    >
      <SearchComponent />
    </Suspense>
  );
}
