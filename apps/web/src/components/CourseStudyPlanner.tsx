'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Loader2,
  Check,
} from 'lucide-react';
import {
  fetchCourseStudyPlan,
  generateCourseStudyPlan,
  updatePlanSession,
  recoverCourseStudyPlan,
} from '@/lib/api';
import type {
  StudyPlan,
  StudySession,
  PlanWorkloadWarning,
  AcademicNodeWithResources,
} from '@campusflow/types';

interface CourseStudyPlannerProps {
  courseId: string;
  courseTitle: string;
  courseCode: string;
  topics: AcademicNodeWithResources[];
  onSelectTopic?: (topicId: string) => void;
}

export function CourseStudyPlanner({
  courseId,
  courseTitle: _courseTitle,
  courseCode: _courseCode,
  topics: _topics,
  onSelectTopic,
}: CourseStudyPlannerProps) {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generator modal state
  const [showGenerator, setShowGenerator] = useState(false);
  const [targetExamDate, setTargetExamDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 28); // Default 4 weeks out
    return d.toISOString().slice(0, 10);
  });
  const [availableHours, setAvailableHours] = useState(10);
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [generating, setGenerating] = useState(false);
  const [workloadWarning, setWorkloadWarning] = useState<PlanWorkloadWarning | null>(null);

  // Recovery state
  const [recovering, setRecovering] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  const loadPlan = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchCourseStudyPlan(courseId);
      setPlan(res.plan);
      setSessions(res.sessions);
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to load study plan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, [courseId]);

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGenerating(true);
      setError(null);
      const isoDate = new Date(`${targetExamDate}T18:00:00Z`).toISOString();
      const res = await generateCourseStudyPlan(courseId, {
        targetExamDate: isoDate,
        availableHoursPerWeek: availableHours,
        dailyTargetMinutes: dailyMinutes,
      });

      setPlan(res.plan);
      setSessions(res.sessions);
      setWorkloadWarning(res.workloadWarning || null);
      setShowGenerator(false);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to generate plan';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleComplete = async (session: StudySession) => {
    const nextStatus = session.status === 'completed' ? 'scheduled' : 'completed';
    try {
      const updated = await updatePlanSession(courseId, session.id, {
        status: nextStatus,
      });
      setSessions((prev) => prev.map((s) => (s.id === session.id ? updated : s)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecoverMissedSessions = async () => {
    try {
      setRecovering(true);
      setRecoveryNotice(null);
      const res = await recoverCourseStudyPlan(courseId);
      setSessions(res.sessions);
      setRecoveryNotice(
        `Missed-session recovery complete: ${res.recoveredCount} past sessions redistributed into future slots.`,
      );
    } catch (err) {
      console.error(err);
      setError('Recovery failed or no active exam plan found.');
    } finally {
      setRecovering(false);
    }
  };

  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const progressPercent = sessions.length
    ? Math.round((completedCount / sessions.length) * 100)
    : 0;

  const daysUntilExam = plan?.targetExamDate
    ? Math.max(
        0,
        Math.ceil((new Date(plan.targetExamDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[var(--cf-primary)]" />
              Personalized Study Planner
            </h2>
            {plan && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                Active Plan
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--cf-text-secondary)]">
            Personal study schedule allocating topics and spaced revision leading to your exam
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {plan && (
            <button
              onClick={handleRecoverMissedSessions}
              disabled={recovering}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] text-xs text-white transition-colors disabled:opacity-50"
              title="Redistribute missed sessions"
            >
              {recovering ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Recover Missed</span>
            </button>
          )}

          <button
            onClick={() => setShowGenerator(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{plan ? 'Recalibrate Plan' : 'Generate Study Plan'}</span>
          </button>
        </div>
      </div>

      {/* Notifications / Warnings */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {recoveryNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{recoveryNotice}</span>
        </div>
      )}

      {workloadWarning?.hasWarning && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Workload Deficit Warning</span>
            <p className="text-[11px] leading-relaxed opacity-90">{workloadWarning.message}</p>
          </div>
        </div>
      )}

      {/* Stats Summary Bar */}
      {plan && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] space-y-0.5">
            <span className="text-[10px] font-mono uppercase text-[var(--cf-text-secondary)]">
              Exam Countdown
            </span>
            <p className="text-base font-bold text-white font-mono">
              {daysUntilExam !== null ? `${daysUntilExam} Days Left` : 'Unscheduled'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] space-y-0.5">
            <span className="text-[10px] font-mono uppercase text-[var(--cf-text-secondary)]">
              Completion
            </span>
            <p className="text-base font-bold text-emerald-400 font-mono">
              {completedCount} / {sessions.length} ({progressPercent}%)
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] space-y-0.5">
            <span className="text-[10px] font-mono uppercase text-[var(--cf-text-secondary)]">
              Daily Target
            </span>
            <p className="text-base font-bold text-white font-mono">
              {plan.dailyTargetMinutes} mins / day
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] space-y-0.5">
            <span className="text-[10px] font-mono uppercase text-[var(--cf-text-secondary)]">
              Study Pace
            </span>
            <p className="text-base font-bold text-white font-mono">
              {plan.availableHoursPerWeek} hrs / week
            </p>
          </div>
        </div>
      )}

      {/* Main Sessions List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
          Loading study sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-12 rounded-2xl border border-dashed border-[var(--cf-border)] text-center bg-[var(--cf-bg-surface-1)] space-y-3">
          <CalendarIcon className="w-8 h-8 text-[var(--cf-text-secondary)] mx-auto" />
          <h3 className="text-sm font-semibold text-white">No active study plan</h3>
          <p className="text-xs text-[var(--cf-text-secondary)] max-w-md mx-auto">
            Set your target examination date and study availability to automatically distribute
            course topics into manageable daily sessions.
          </p>
          <button
            onClick={() => setShowGenerator(true)}
            className="px-4 py-2 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            Create Study Plan
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] overflow-hidden divide-y divide-[var(--cf-border)]">
          {sessions.map((sess) => {
            const isCompleted = sess.status === 'completed';
            const scheduledDateFormatted = new Date(sess.scheduledDate).toLocaleDateString(
              'en-US',
              {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              },
            );

            return (
              <div
                key={sess.id}
                className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                  isCompleted
                    ? 'bg-[var(--cf-bg-surface-2)]/20 opacity-75'
                    : 'hover:bg-[var(--cf-bg-surface-2)]/40'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Completion toggle button */}
                  <button
                    onClick={() => handleToggleComplete(sess)}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      isCompleted
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'border-[var(--cf-border)] hover:border-zinc-500 bg-[var(--cf-bg-surface-2)]'
                    }`}
                  >
                    {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          sess.sessionType === 'review'
                            ? 'bg-amber-950/50 text-amber-300 border-amber-800/40'
                            : sess.sessionType === 'practice'
                              ? 'bg-purple-950/50 text-purple-300 border-purple-800/40'
                              : 'bg-sky-950/50 text-sky-300 border-sky-800/40'
                        }`}
                      >
                        {sess.sessionType}
                      </span>
                      <h4
                        className={`text-xs font-medium truncate ${
                          isCompleted
                            ? 'line-through text-[var(--cf-text-secondary)]'
                            : 'text-white'
                        }`}
                      >
                        {sess.title}
                      </h4>
                    </div>

                    {sess.notes && (
                      <p className="text-[11px] text-[var(--cf-text-secondary)] truncate mt-0.5">
                        {sess.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 font-mono text-xs text-[var(--cf-text-secondary)]">
                  <span>{scheduledDateFormatted}</span>
                  <span>·</span>
                  <span>{sess.durationMinutes}m</span>

                  {sess.topicId && onSelectTopic && (
                    <button
                      onClick={() => onSelectTopic(sess.topicId)}
                      className="text-[11px] text-[var(--cf-primary)] hover:underline ml-2"
                    >
                      Topic Workspace
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plan Generator / Recalibration Modal */}
      {showGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] p-6 shadow-2xl space-y-5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">
                Personalized Study Schedule Generator
              </h3>
              <p className="text-xs text-[var(--cf-text-secondary)]">
                Calibrates study sessions across available days leading up to your exam date
              </p>
            </div>

            <form onSubmit={handleGeneratePlan} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--cf-text-secondary)] block mb-1">
                  Target Exam Date *
                </label>
                <input
                  type="date"
                  required
                  value={targetExamDate}
                  onChange={(e) => setTargetExamDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)] font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--cf-text-secondary)] block mb-1">
                    Study Hours / Week
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={availableHours}
                    onChange={(e) => setAvailableHours(parseInt(e.target.value, 10) || 10)}
                    className="w-full p-2.5 rounded-xl bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--cf-text-secondary)] block mb-1">
                    Daily Session (mins)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    step={15}
                    value={dailyMinutes}
                    onChange={(e) => setDailyMinutes(parseInt(e.target.value, 10) || 60)}
                    className="w-full p-2.5 rounded-xl bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowGenerator(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[var(--cf-text-secondary)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-4 py-2 rounded-xl bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-semibold shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Optimizing Schedule...</span>
                    </>
                  ) : (
                    <span>Generate Schedule</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
