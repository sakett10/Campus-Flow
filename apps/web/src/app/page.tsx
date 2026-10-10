'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Check,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Target,
  GraduationCap,
  Layers,
  BookMarked,
} from 'lucide-react';
import { fetchTodayOverview, updateTopicStudyState } from '@/lib/api';
import type { TodayOverviewResponse, TodayAssessmentItem } from '@campusflow/types';

interface FocusItem {
  id: string;
  title: string;
  course: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  category: 'overdue' | 'due_today' | 'needs_review' | 'upcoming' | 'continue_studying';
  link: string;
  dateStr?: string | null;
}

export default function TodayPage() {
  const [data, setData] = useState<TodayOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutatingTopicId, setMutatingTopicId] = useState<string | null>(null);
  const [assessmentFilter, setAssessmentFilter] = useState<
    'all' | 'pending' | 'overdue' | 'unscheduled' | 'completed'
  >('pending');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTodayOverview();
      if (!res) {
        setError('Unable to load academic dashboard. Verify network and authentication.');
      } else {
        setData(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMarkReviewed = async (courseId: string, topicId: string) => {
    setMutatingTopicId(topicId);
    setActionError(null);
    try {
      await updateTopicStudyState(courseId, topicId, 'reviewed', 'reviewed');
      const updated = await fetchTodayOverview();
      if (updated) {
        setData(updated);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update study state');
    } finally {
      setMutatingTopicId(null);
    }
  };

  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return 'No date set';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Invalid date';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatRelativeTime = (date: string | Date | null | undefined): string => {
    if (!date) return 'Never';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Never';
    const now = Date.now();
    const diffSec = Math.floor((now - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Deterministic, transparent priorities derived from real persisted data
  const focusItems = useMemo<FocusItem[]>(() => {
    if (!data) return [];
    const items: FocusItem[] = [];

    // 1. Overdue incomplete assessments (highest priority)
    for (const a of data.assessments.overdue) {
      items.push({
        id: `overdue-${a.id}`,
        title: a.title,
        course: a.courseCode || a.courseTitle || 'Assessment',
        reason: `Overdue (was due ${formatDate(a.date)}) · Incomplete`,
        priority: 'high',
        category: 'overdue',
        link: `/courses/${a.courseId}`,
        dateStr: a.date ? String(a.date) : null,
      });
    }

    // 2. Assessments due today
    for (const a of data.assessments.dueToday) {
      items.push({
        id: `today-${a.id}`,
        title: a.title,
        course: a.courseCode || a.courseTitle || 'Assessment',
        reason: 'Due today · Urgent deadline',
        priority: 'high',
        category: 'due_today',
        link: `/courses/${a.courseId}`,
        dateStr: a.date ? String(a.date) : null,
      });
    }

    // 3. Topics marked needs_review
    for (const t of data.needsReview) {
      items.push({
        id: `review-${t.topicId}`,
        title: t.topicTitle,
        course: t.courseCode,
        reason: `Flagged for review · Retention check recommended`,
        priority: 'medium',
        category: 'needs_review',
        link: `/courses/${t.courseId}?topic=${t.topicId}`,
      });
    }

    // 4. Upcoming assessments within 7 days
    const nowMs = Date.now();
    for (const a of data.assessments.upcoming) {
      if (!a.date) continue;
      const diffMs = new Date(a.date).getTime() - nowMs;
      const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
      if (diffDays >= 0 && diffDays <= 7) {
        items.push({
          id: `upcoming-${a.id}`,
          title: a.title,
          course: a.courseCode || a.courseTitle || 'Assessment',
          reason: `Upcoming in ${diffDays} day${diffDays === 1 ? '' : 's'} (${formatDate(a.date)})`,
          priority: 'medium',
          category: 'upcoming',
          link: `/courses/${a.courseId}`,
          dateStr: String(a.date),
        });
      }
    }

    // 5. Active learning topics
    for (const t of data.continueStudying) {
      items.push({
        id: `learning-${t.topicId}`,
        title: t.topicTitle,
        course: t.courseCode,
        reason: `Active learning · Last studied ${formatRelativeTime(t.lastStudiedAt)}`,
        priority: 'low',
        category: 'continue_studying',
        link: `/courses/${t.courseId}?topic=${t.topicId}`,
      });
    }

    return items.slice(0, 4);
  }, [data]);

  // Filtered assessment list
  const filteredAssessments = useMemo<TodayAssessmentItem[]>(() => {
    if (!data) return [];
    const { dueToday, overdue, upcoming, unscheduled, completed } = data.assessments;

    switch (assessmentFilter) {
      case 'overdue':
        return overdue;
      case 'unscheduled':
        return unscheduled;
      case 'completed':
        return completed;
      case 'pending':
        return [...dueToday, ...overdue, ...upcoming];
      case 'all':
      default:
        return [...dueToday, ...overdue, ...upcoming, ...unscheduled, ...completed];
    }
  }, [data, assessmentFilter]);

  const todayDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  return (
    <main className="space-y-8 pb-12 max-w-7xl mx-auto px-4 sm:px-6">
      {/* Top Header & Context Bar */}
      <header className="border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)] p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--cf-bg-surface-2)] text-xs text-[var(--cf-text-secondary)] font-mono mb-3 border border-[var(--cf-border)]">
              <Calendar className="w-3.5 h-3.5 text-[var(--cf-accent-primary)]" />
              <span>{todayDateFormatted}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">
              Today
            </h1>
            <p className="text-sm text-[var(--cf-text-secondary)] leading-relaxed max-w-2xl">
              Academic command center. Actionable priorities, chronological deadlines, and active
              learning paths grounded strictly in verified coursework.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={loadData}
              disabled={loading}
              aria-label="Refresh dashboard data"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-hover)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Real-Data Academic Metrics Bar */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-[var(--cf-border)]">
            <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/60 border border-[var(--cf-border)]">
              <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
                Courses
              </span>
              <span className="text-lg font-semibold text-white font-mono">
                {data.summary.totalCourses}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/60 border border-[var(--cf-border)]">
              <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
                Upcoming
              </span>
              <span className="text-lg font-semibold text-sky-400 font-mono">
                {data.summary.upcomingAssessmentCount}
              </span>
            </div>
            <div
              className={`p-3 rounded-lg border ${
                data.summary.overdueAssessmentCount > 0
                  ? 'bg-rose-950/20 border-rose-500/40 text-rose-300'
                  : 'bg-[var(--cf-bg-surface-2)]/60 border-[var(--cf-border)]'
              }`}
            >
              <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
                Overdue
              </span>
              <span
                className={`text-lg font-semibold font-mono ${
                  data.summary.overdueAssessmentCount > 0 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {data.summary.overdueAssessmentCount}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/60 border border-[var(--cf-border)]">
              <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
                Learning
              </span>
              <span className="text-lg font-semibold text-emerald-400 font-mono">
                {data.summary.activeTopicsCount}
              </span>
            </div>
            <div
              className={`p-3 rounded-lg border col-span-2 sm:col-span-1 ${
                data.summary.needsReviewCount > 0
                  ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
                  : 'bg-[var(--cf-bg-surface-2)]/60 border-[var(--cf-border)]'
              }`}
            >
              <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
                Needs Review
              </span>
              <span
                className={`text-lg font-semibold font-mono ${
                  data.summary.needsReviewCount > 0 ? 'text-amber-400' : 'text-white'
                }`}
              >
                {data.summary.needsReviewCount}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Global Action Error Banner */}
      {actionError && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-xs text-rose-300 hover:text-white underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Global Error State */}
      {error && !loading && (
        <div
          role="alert"
          className="p-8 rounded-xl border border-rose-500/30 bg-rose-950/20 text-center space-y-4"
        >
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <h2 className="text-base font-semibold text-white">Dashboard Unavailable</h2>
          <p className="text-xs text-[var(--cf-text-secondary)] max-w-md mx-auto">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-[var(--cf-accent-primary)] hover:bg-[var(--cf-accent-hover)] text-white text-xs font-medium rounded-lg transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
          <div className="h-40 bg-[var(--cf-bg-surface-1)] rounded-xl border border-[var(--cf-border)]" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-96 bg-[var(--cf-bg-surface-1)] rounded-xl border border-[var(--cf-border)]" />
            <div className="h-96 bg-[var(--cf-bg-surface-1)] rounded-xl border border-[var(--cf-border)]" />
          </div>
        </div>
      )}

      {/* Populated Dashboard */}
      {!loading && !error && data && (
        <div className="space-y-8">
          {/* SECTION A: TODAY'S FOCUS */}
          <section aria-labelledby="todays-focus-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[var(--cf-accent-primary)]" />
                <h2
                  id="todays-focus-heading"
                  className="text-sm font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono"
                >
                  Today&apos;s Focus
                </h2>
              </div>
              <span className="text-[11px] text-[var(--cf-text-muted)] font-mono">
                Deterministic Prioritization
              </span>
            </div>

            {focusItems.length === 0 ? (
              <div className="p-6 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <h3 className="text-sm font-medium text-white">All Caught Up</h3>
                <p className="text-xs text-[var(--cf-text-secondary)] max-w-md mx-auto">
                  No overdue deadlines, urgent assessments, or topics flagged for review. You can
                  explore courses or begin studying upcoming topics.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {focusItems.map((item) => {
                  const isHigh = item.priority === 'high';
                  const isMed = item.priority === 'medium';
                  const borderColor = isHigh
                    ? 'border-rose-500/40 hover:border-rose-500/80'
                    : isMed
                      ? 'border-amber-500/40 hover:border-amber-500/80'
                      : 'border-[var(--cf-border)] hover:border-[var(--cf-accent-primary)]/50';

                  return (
                    <Link
                      key={item.id}
                      href={item.link}
                      className={`group block p-4 rounded-xl border ${borderColor} bg-[var(--cf-bg-surface-1)] hover:bg-[var(--cf-bg-surface-hover)]/40 transition-all`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]">
                          {item.course}
                        </span>
                        <span
                          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                            isHigh
                              ? 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                              : isMed
                                ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-950/60 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          {item.category.replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="text-xs font-semibold text-white group-hover:text-[var(--cf-accent-primary)] transition-colors line-clamp-1 mb-1.5">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-[var(--cf-text-secondary)] line-clamp-2 leading-relaxed">
                        {item.reason}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Main 2-Column Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column (2 Cols): Assessments & Courses */}
            <div className="lg:col-span-2 space-y-8">
              {/* SECTION B: UPCOMING ASSESSMENTS */}
              <section aria-labelledby="assessments-heading" className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-400" />
                    <h2
                      id="assessments-heading"
                      className="text-sm font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono"
                    >
                      Assessments & Deadlines
                    </h2>
                  </div>

                  {/* Filter Tabs */}
                  <div className="inline-flex rounded-lg p-0.5 bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs font-mono">
                    {(
                      [
                        { id: 'pending', label: 'Active' },
                        { id: 'overdue', label: 'Overdue' },
                        { id: 'unscheduled', label: 'No Date' },
                        { id: 'completed', label: 'Completed' },
                        { id: 'all', label: 'All' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setAssessmentFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                          assessmentFilter === tab.id
                            ? 'bg-[var(--cf-accent-primary)] text-white font-medium shadow-sm'
                            : 'text-[var(--cf-text-secondary)] hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredAssessments.length === 0 ? (
                  <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center space-y-2">
                    <Clock className="w-5 h-5 text-[var(--cf-text-muted)] mx-auto" />
                    <p className="text-xs text-[var(--cf-text-secondary)]">
                      No assessments found in this view.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] divide-y divide-[var(--cf-border)] overflow-hidden">
                    {filteredAssessments.map((a) => {
                      const isOverdue = a.timeframe === 'overdue';
                      const isDueToday = a.timeframe === 'today';
                      const isUnscheduled = a.timeframe === 'unscheduled';
                      const isCompleted = a.timeframe === 'completed' || a.status === 'completed';

                      return (
                        <div
                          key={a.id}
                          className="p-4 hover:bg-[var(--cf-bg-surface-2)]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {a.courseCode && (
                                <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]">
                                  {a.courseCode}
                                </span>
                              )}
                              <span className="text-xs font-semibold text-white truncate">
                                {a.title}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-muted)] border border-[var(--cf-border)]">
                                {a.type}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 text-[11px] text-[var(--cf-text-secondary)] font-mono flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[var(--cf-text-muted)]" />
                                {formatDate(a.date)}
                              </span>
                              {a.weightage && <span>Weight: {a.weightage}</span>}
                              {a.totalMarks != null && <span>Total: {a.totalMarks} pts</span>}
                              {a.topicCount != null && a.topicCount > 0 && (
                                <span className="text-sky-400">
                                  {a.topicCount} linked topic{a.topicCount === 1 ? '' : 's'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">
                                <Check className="w-3 h-3" /> Completed
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-950/40 text-rose-300 border border-rose-500/30 text-[10px] font-mono">
                                <AlertTriangle className="w-3 h-3" /> Overdue
                              </span>
                            ) : isDueToday ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30 text-[10px] font-mono">
                                <Clock className="w-3 h-3" /> Due Today
                              </span>
                            ) : isUnscheduled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 text-slate-300 border border-slate-700 text-[10px] font-mono">
                                <HelpCircle className="w-3 h-3" /> Unscheduled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-950/40 text-sky-300 border border-sky-500/30 text-[10px] font-mono">
                                <Calendar className="w-3 h-3" /> Upcoming
                              </span>
                            )}

                            <Link
                              href={`/courses/${a.courseId}`}
                              className="text-xs text-[var(--cf-accent-primary)] hover:underline flex items-center font-mono"
                            >
                              <span>View</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* SECTION E: MY COURSES */}
              <section aria-labelledby="my-courses-heading" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    <h2
                      id="my-courses-heading"
                      className="text-sm font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono"
                    >
                      Enrolled Courses
                    </h2>
                  </div>
                  <Link
                    href="/courses"
                    className="text-xs text-[var(--cf-accent-primary)] hover:underline flex items-center gap-1 font-mono"
                  >
                    <span>All Courses</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {data.courses.length === 0 ? (
                  <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center space-y-3">
                    <GraduationCap className="w-6 h-6 text-[var(--cf-text-muted)] mx-auto" />
                    <p className="text-xs text-[var(--cf-text-secondary)]">
                      No active courses registered yet.
                    </p>
                    <Link
                      href="/courses"
                      className="inline-flex items-center px-3 py-1.5 bg-[var(--cf-accent-primary)] hover:bg-[var(--cf-accent-hover)] text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Add Course
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data.courses.map((course) => (
                      <Link
                        key={course.id}
                        href={`/courses/${course.id}`}
                        className="group block p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:border-[var(--cf-accent-primary)]/50 hover:bg-[var(--cf-bg-surface-hover)]/30 transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-accent-primary)] border border-[var(--cf-border)]">
                            {course.code}
                          </span>
                          <span className="text-[11px] text-[var(--cf-text-muted)] font-mono">
                            {course.term || 'Current'}
                          </span>
                        </div>
                        <h3 className="text-sm font-medium text-white group-hover:text-[var(--cf-accent-primary)] transition-colors mb-2 line-clamp-1">
                          {course.title}
                        </h3>
                        <div className="flex items-center justify-between text-[11px] text-[var(--cf-text-secondary)] font-mono border-t border-[var(--cf-border)] pt-2 mt-2">
                          <span className="capitalize">
                            Syllabus: {course.syllabusStatus.replace('_', ' ')}
                          </span>
                          <span className="text-[var(--cf-accent-primary)] flex items-center group-hover:translate-x-0.5 transition-transform">
                            Open <ArrowRight className="w-3 h-3 ml-1" />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Right Column (1 Col): Study States (Learning & Needs Review) */}
            <div className="space-y-8">
              {/* SECTION C: CONTINUE STUDYING */}
              <section aria-labelledby="continue-studying-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-emerald-400" />
                    <h2
                      id="continue-studying-heading"
                      className="text-sm font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono"
                    >
                      Continue Studying
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                    Learning
                  </span>
                </div>

                {data.continueStudying.length === 0 ? (
                  <div className="p-6 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center space-y-2">
                    <Layers className="w-5 h-5 text-[var(--cf-text-muted)] mx-auto" />
                    <p className="text-xs text-[var(--cf-text-secondary)]">
                      No topics currently marked as learning.
                    </p>
                    <p className="text-[11px] text-[var(--cf-text-muted)]">
                      Select a topic in your course map and mark it as &ldquo;Learning&rdquo; to
                      track active sessions.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] divide-y divide-[var(--cf-border)] overflow-hidden">
                    {data.continueStudying.map((topic) => (
                      <Link
                        key={topic.topicId}
                        href={`/courses/${topic.courseId}?topic=${topic.topicId}`}
                        className="block p-3.5 hover:bg-[var(--cf-bg-surface-2)]/50 transition-colors group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] font-semibold text-[var(--cf-text-secondary)]">
                            {topic.courseCode}
                          </span>
                          <span className="text-[10px] text-[var(--cf-text-muted)] font-mono">
                            {formatRelativeTime(topic.lastStudiedAt)}
                          </span>
                        </div>
                        <h3 className="text-xs font-semibold text-white group-hover:text-[var(--cf-accent-primary)] transition-colors line-clamp-1 mb-1">
                          {topic.topicTitle}
                        </h3>
                        {topic.moduleTitle && (
                          <p className="text-[11px] text-[var(--cf-text-secondary)] line-clamp-1">
                            Module: {topic.moduleTitle}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* SECTION D: NEEDS REVIEW */}
              <section aria-labelledby="needs-review-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h2
                      id="needs-review-heading"
                      className="text-sm font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono"
                    >
                      Needs Review
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30">
                    Retention Check
                  </span>
                </div>

                {data.needsReview.length === 0 ? (
                  <div className="p-6 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center space-y-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto" />
                    <p className="text-xs text-[var(--cf-text-secondary)]">
                      No topics flagged for review.
                    </p>
                    <p className="text-[11px] text-[var(--cf-text-muted)]">
                      Topics will appear here when you flag them for review before assessments.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] divide-y divide-[var(--cf-border)] overflow-hidden">
                    {data.needsReview.map((topic) => {
                      const isMutating = mutatingTopicId === topic.topicId;

                      return (
                        <div
                          key={topic.topicId}
                          className="p-3.5 hover:bg-[var(--cf-bg-surface-2)]/30 transition-colors space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] font-semibold text-[var(--cf-text-secondary)]">
                              {topic.courseCode}
                            </span>
                            <span className="text-[10px] text-[var(--cf-text-muted)] font-mono">
                              {formatRelativeTime(topic.lastReviewedAt)}
                            </span>
                          </div>

                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link
                                href={`/courses/${topic.courseId}?topic=${topic.topicId}`}
                                className="text-xs font-semibold text-white hover:text-[var(--cf-accent-primary)] transition-colors line-clamp-1 block"
                              >
                                {topic.topicTitle}
                              </Link>
                              {topic.moduleTitle && (
                                <p className="text-[11px] text-[var(--cf-text-secondary)] line-clamp-1">
                                  {topic.moduleTitle}
                                </p>
                              )}
                            </div>

                            <button
                              onClick={() => handleMarkReviewed(topic.courseId, topic.topicId)}
                              disabled={isMutating}
                              aria-label={`Mark topic ${topic.topicTitle} as reviewed`}
                              className="shrink-0 px-2.5 py-1 text-[11px] font-mono rounded bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              {isMutating ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              <span>Reviewed</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
