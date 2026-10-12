'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Filter,
  CalendarCheck,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import {
  fetchPlannerOverview,
  updatePlanSession,
  recoverCourseStudyPlan,
  fetchCourses,
} from '@/lib/api';
import type { StudyPlan, StudySession, Course } from '@campusflow/types';

export default function GlobalPlannerPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'completed' | 'missed'>(
    'all',
  );
  const [recoveringCourseId, setRecoveringCourseId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [plannerRes, courseList] = await Promise.all([
        fetchPlannerOverview(),
        fetchCourses().catch(() => []),
      ]);
      setPlans(plannerRes.plans || []);
      setSessions(plannerRes.sessions || []);
      setCourses(courseList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load planner data');
    } finally {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Map course metadata for quick lookup
  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    for (const c of courses) {
      map.set(c.id, c);
    }
    return map;
  }, [courses]);

  // Workload warnings across all plans
  const activeWarnings = useMemo(() => {
    return plans.filter((p) => p.workloadWarning?.hasWarning);
  }, [plans]);

  // Count missed sessions
  const missedSessions = useMemo(() => {
    return sessions.filter((s) => s.status === 'missed');
  }, [sessions]);

  // Group filtered sessions chronologically by date
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedCourseId !== 'all' && s.courseId !== selectedCourseId) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [sessions, selectedCourseId, statusFilter]);

  const sessionsByDate = useMemo(() => {
    const groups: Record<string, StudySession[]> = {};
    for (const s of filteredSessions) {
      const dateKey =
        typeof s.scheduledDate === 'string'
          ? (s.scheduledDate as string).split('T')[0]!
          : new Date(s.scheduledDate).toISOString().split('T')[0]!;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(s);
    }

    // Sort dates chronologically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSessions]);

  const handleToggleStatus = async (session: StudySession) => {
    const nextStatus = session.status === 'completed' ? 'scheduled' : 'completed';
    try {
      const updated = await updatePlanSession(session.courseId, session.id, {
        status: nextStatus,
      });
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setActionSuccess(`Session marked as ${nextStatus}`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session');
    }
  };

  const handleRecoverPlan = async (courseId: string) => {
    if (!courseId) return;
    setRecoveringCourseId(courseId);
    setError(null);
    try {
      const result = await recoverCourseStudyPlan(courseId);
      setActionSuccess(`Recovered ${result.recoveredCount} missed session(s)`);
      await loadData();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recover missed sessions');
    } finally {
      setRecoveringCourseId(null);
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-[var(--cf-bg-surface-1)] rounded-xl border border-[var(--cf-border)]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-[var(--cf-bg-surface-1)] rounded-xl border border-[var(--cf-border)]" />
          <div className="h-64 bg-[var(--cf-bg-surface-1)] rounded-xl border border-[var(--cf-border)]" />
          <div className="h-64 bg-[var(--cf-bg-surface-1)] rounded-xl border border-[var(--cf-border)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)] p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--cf-bg-surface-2)] text-xs text-[var(--cf-accent-primary)] font-mono mb-3 border border-[var(--cf-border)]">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Multi-Course Schedule Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">
              Personalized Study Planner
            </h1>
            <p className="text-sm text-[var(--cf-text-secondary)] leading-relaxed max-w-2xl">
              Deterministic, workload-aware scheduling across all enrolled courses. Connects topic
              hierarchies to daily study goals with spaced reviews and missed-session recovery.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[var(--cf-border)]">
          <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/60 border border-[var(--cf-border)]">
            <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
              Active Plans
            </span>
            <span className="text-lg font-semibold text-white font-mono">{plans.length}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/60 border border-[var(--cf-border)]">
            <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
              Scheduled Sessions
            </span>
            <span className="text-lg font-semibold text-sky-400 font-mono">
              {sessions.filter((s) => s.status === 'scheduled').length}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/60 border border-[var(--cf-border)]">
            <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
              Completed
            </span>
            <span className="text-lg font-semibold text-emerald-400 font-mono">
              {sessions.filter((s) => s.status === 'completed').length}
            </span>
          </div>
          <div
            className={`p-3 rounded-lg border ${
              missedSessions.length > 0
                ? 'bg-rose-950/20 border-rose-500/40 text-rose-300'
                : 'bg-[var(--cf-bg-surface-2)]/60 border-[var(--cf-border)]'
            }`}
          >
            <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block uppercase">
              Missed Sessions
            </span>
            <span
              className={`text-lg font-semibold font-mono ${
                missedSessions.length > 0 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {missedSessions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div
          role="status"
          className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between"
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Active Workload Warnings */}
      {activeWarnings.map((p) => {
        const c = p.courseId ? courseMap.get(p.courseId) : undefined;
        return (
          <div
            key={p.id}
            className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">
                  Workload Deficit Warning: {c ? `${c.code} (${c.title})` : 'Course Plan'}
                </span>
                <p className="text-amber-200/80 mt-0.5">
                  Target syllabus requires{' '}
                  {Math.round((p.workloadWarning?.totalRequiredMinutes || 0) / 60)} hrs, but
                  available capacity before exam date is{' '}
                  {Math.round((p.workloadWarning?.availableMinutes || 0) / 60)} hrs. Estimated
                  deficit: {Math.round((p.workloadWarning?.deficitMinutes || 0) / 60)} hrs.
                </p>
              </div>
            </div>
            {p.courseId && (
              <Link
                href={`/courses/${p.courseId}`}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-mono text-[11px] shrink-0 self-start sm:self-auto transition-colors"
              >
                Recalibrate Plan →
              </Link>
            )}
          </div>
        );
      })}

      {/* Missed Sessions Recovery Card */}
      {missedSessions.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <RotateCcw className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-rose-300">
                {missedSessions.length} Missed Study Session(s) Require Recovery
              </span>
              <p className="text-rose-200/80 mt-0.5">
                Redistribute missed topics forward evenly across remaining days before the
                examination deadline without shaming.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Array.from(new Set(missedSessions.map((s) => s.courseId).filter(Boolean))).map(
              (cId) => {
                const c = courseMap.get(cId);
                return (
                  <button
                    key={cId}
                    onClick={() => handleRecoverPlan(cId)}
                    disabled={recoveringCourseId === cId}
                    className="px-3 py-1.5 rounded-lg bg-rose-900/50 hover:bg-rose-900/80 text-rose-200 border border-rose-500/50 font-mono text-[11px] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw
                      className={`w-3 h-3 ${recoveringCourseId === cId ? 'animate-spin' : ''}`}
                    />
                    <span>Recover {c?.code || 'Course'}</span>
                  </button>
                );
              },
            )}
          </div>
        </div>
      )}

      {/* Filter and Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--cf-text-secondary)] font-mono flex items-center gap-1 mr-2">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white font-mono focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Enrolled Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.title}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 border-l border-[var(--cf-border)] pl-2">
            {(['all', 'scheduled', 'completed', 'missed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 text-xs rounded-md font-mono capitalize transition-colors ${
                  statusFilter === status
                    ? 'bg-sky-950/60 text-sky-300 border border-sky-500/40'
                    : 'text-[var(--cf-text-secondary)] hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <span className="text-xs text-[var(--cf-text-muted)] font-mono">
          Showing {filteredSessions.length} session(s)
        </span>
      </div>

      {/* Sessions Timeline View */}
      {sessionsByDate.length === 0 ? (
        <div className="p-12 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center space-y-4">
          <CalendarCheck className="w-10 h-10 text-[var(--cf-text-muted)] mx-auto" />
          <h2 className="text-base font-medium text-white">No Study Sessions Found</h2>
          <p className="text-xs text-[var(--cf-text-secondary)] max-w-md mx-auto">
            {plans.length === 0
              ? 'You have not generated any study plans yet. Import a syllabus or open an existing course to generate an adaptive schedule.'
              : 'No sessions match your selected filters. Adjust your course or status filters above.'}
          </p>
          <div className="pt-2">
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-medium transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>Go to Courses</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {sessionsByDate.map(([date, dateSessions]) => {
            const isToday = date === new Date().toISOString().split('T')[0];
            return (
              <div
                key={date}
                className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] overflow-hidden"
              >
                <div
                  className={`px-4 py-3 border-b border-[var(--cf-border)] flex items-center justify-between ${
                    isToday ? 'bg-sky-950/30 text-sky-200' : 'bg-[var(--cf-bg-surface-2)]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-400" />
                    <span className="font-mono text-xs font-semibold text-white">{date}</span>
                    {isToday && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                    {dateSessions.length} session{dateSessions.length === 1 ? '' : 's'} ·{' '}
                    {dateSessions.reduce((acc, s) => acc + s.durationMinutes, 0)} mins total
                  </span>
                </div>

                <div className="divide-y divide-[var(--cf-border)]">
                  {dateSessions.map((session) => {
                    const course = courseMap.get(session.courseId);
                    const isCompleted = session.status === 'completed';
                    const isMissed = session.status === 'missed';

                    return (
                      <div
                        key={session.id}
                        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--cf-bg-surface-2)]/30 transition-colors ${
                          isCompleted ? 'opacity-60 bg-[var(--cf-bg-surface-2)]/10' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <button
                            onClick={() => handleToggleStatus(session)}
                            aria-label={`Mark session ${session.title} as ${isCompleted ? 'incomplete' : 'complete'}`}
                            className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                              isCompleted
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-[var(--cf-border)] hover:border-emerald-400'
                            }`}
                          >
                            {isCompleted && <CheckCircle2 className="w-4 h-4" />}
                          </button>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {course && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]">
                                  {course.code}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase border ${
                                  session.sessionType === 'review'
                                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                                    : session.sessionType === 'practice'
                                      ? 'bg-purple-950/40 text-purple-300 border-purple-500/30'
                                      : 'bg-sky-950/40 text-sky-300 border-sky-500/30'
                                }`}
                              >
                                {session.sessionType}
                              </span>
                              {isMissed && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase bg-rose-950/40 text-rose-300 border border-rose-500/30">
                                  Missed
                                </span>
                              )}
                            </div>

                            <h3
                              className={`text-sm font-medium ${
                                isCompleted
                                  ? 'line-through text-[var(--cf-text-secondary)]'
                                  : 'text-white'
                              }`}
                            >
                              {session.title}
                            </h3>

                            <div className="flex items-center gap-3 text-xs text-[var(--cf-text-secondary)] font-mono">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-[var(--cf-accent-primary)]" />
                                {session.durationMinutes} mins (estimate)
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          {session.topicId && (
                            <Link
                              href={`/courses/${session.courseId}?topic=${session.topicId}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-sky-400 hover:text-white hover:bg-sky-900/40 transition-colors"
                            >
                              <span>Topic Workspace</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
