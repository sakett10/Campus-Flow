'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Building,
  Calendar,
  MapPin,
  Layers,
  Bookmark,
  BookOpen,
  Scale,
  Info,
  EyeOff,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  fetchOpportunityDetail,
  evaluateOpportunity,
  fetchPredictionTransparency,
  createApplication,
  createStudentSavedOpportunity,
  type OpportunityWithRelations,
} from '@/lib/api';
import type { OpportunityEvaluation, PredictionTransparencyRecord } from '@campusflow/types';

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.['id'] as string;

  const [loading, setLoading] = useState(true);
  const [opportunity, setOpportunity] = useState<OpportunityWithRelations | null>(null);
  const [evaluation, setEvaluation] = useState<OpportunityEvaluation | null>(null);
  const [transparency, setTransparency] = useState<PredictionTransparencyRecord | null>(null);
  const [showHowCalculated, setShowHowCalculated] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        setLoading(true);
        const [opp, ev, tr] = await Promise.all([
          fetchOpportunityDetail(id),
          evaluateOpportunity(id),
          fetchPredictionTransparency(id),
        ]);
        setOpportunity(opp);
        setEvaluation(ev);
        setTransparency(tr);
      } catch (err) {
        console.error('Failed to load opportunity evaluation:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await createStudentSavedOpportunity({
        opportunityId: id,
        status: 'saved',
      });
      setSaved(true);
    } catch (err) {
      console.error('Failed to save opportunity:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleTrack = async () => {
    try {
      setTracking(true);
      await createApplication(id, 'Tracked from evaluation page');
      setTracked(true);
      setTimeout(() => {
        router.push('/opportunities');
      }, 1500);
    } catch (err) {
      console.error('Failed to track application:', err);
    } finally {
      setTracking(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
        Evaluating opportunity criteria...
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="p-12 text-center space-y-3">
        <h2 className="text-base font-semibold text-white">Opportunity not found</h2>
        <Link
          href="/opportunities"
          className="text-xs text-[var(--cf-primary)] hover:underline inline-flex items-center gap-1 font-mono"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Opportunities
        </Link>
      </div>
    );
  }

  const eligibility = evaluation?.eligibility;
  const roleMatch = evaluation?.roleMatch;
  const hiringProbability = evaluation?.hiringProbability;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Back Link */}
      <div>
        <Link
          href="/opportunities"
          className="text-xs text-[var(--cf-text-secondary)] hover:text-white inline-flex items-center gap-1 font-mono transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Opportunities
        </Link>
      </div>

      {/* Role Header Banner */}
      <div className="p-6 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-white">{opportunity.title}</h1>
              <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]">
                {opportunity.opportunityType.replace('_', ' ')}
              </span>
              {opportunity.season && (
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-blue-950/40 text-blue-400 border border-blue-900/40">
                  {opportunity.season}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-[var(--cf-text-secondary)] font-mono flex-wrap pt-1">
              <span className="flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                {opportunity.sourceOrganization}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Target Grad: {opportunity.targetGraduationYears?.join(', ') || 'Any'}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Workplace: {opportunity.workplaceType}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                saved
                  ? 'border-emerald-600 bg-emerald-950/40 text-emerald-400'
                  : 'border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-white hover:bg-[var(--cf-bg-surface-2)]/80'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{saved ? 'Saved' : saving ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              onClick={handleTrack}
              disabled={tracking || tracked}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--cf-primary)] text-white hover:bg-[var(--cf-primary)]/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {tracked ? 'Tracked in Pipeline!' : tracking ? 'Tracking...' : 'Track Application'}
            </button>
          </div>
        </div>

        {/* Provenance Card */}
        <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/40 border border-[var(--cf-border)] text-xs text-[var(--cf-text-secondary)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <span className="font-mono text-[11px] text-white">Source Provenance:</span>
            <a
              href={opportunity.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--cf-primary)] hover:underline inline-flex items-center gap-1 font-mono text-[11px] truncate"
            >
              <span>{opportunity.sourceUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
          <span className="font-mono text-[11px] shrink-0">
            Retrieved: {new Date(opportunity.retrievalTimestamp).toLocaleDateString()} • Extraction:{' '}
            {opportunity.extractionVersion}
          </span>
        </div>
      </div>

      {/* 4 Distinct Evaluation Pillars Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Eligibility */}
        <div className="p-3.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[var(--cf-text-secondary)] font-semibold">
              1. Eligibility
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-white uppercase font-mono">
            {eligibility ? eligibility.status.replace('_', ' ') : 'Checking...'}
          </div>
          <p className="text-[10px] text-[var(--cf-text-secondary)] leading-tight">
            Institutional rule constraints. Not a probability.
          </p>
        </div>

        {/* 2. Role Match */}
        <div className="p-3.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[var(--cf-text-secondary)] font-semibold">
              2. Role Match
            </span>
            <Layers className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
          </div>
          <div className="text-sm font-bold text-white font-mono">
            {roleMatch ? `${roleMatch.score}/100` : 'Calculating...'}
          </div>
          <p className="text-[10px] text-[var(--cf-text-secondary)] leading-tight">
            Skill readiness alignment. Not a probability.
          </p>
        </div>

        {/* 3. Evidence Confidence */}
        <div className="p-3.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[var(--cf-text-secondary)] font-semibold">
              3. Evidence Confidence
            </span>
            <Scale className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-sm font-bold text-white uppercase font-mono">
            {roleMatch ? `${roleMatch.evidenceConfidence} Confidence` : 'Analyzing...'}
          </div>
          <p className="text-[10px] text-[var(--cf-text-secondary)] leading-tight">
            Demonstrated vs claimed. Self-claims are not evidence.
          </p>
        </div>

        {/* 4. Hiring Probability */}
        <div className="p-3.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[var(--cf-text-secondary)] font-semibold">
              4. Hiring Probability
            </span>
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xs font-bold font-mono text-amber-400">
            {hiringProbability?.status === 'calculated'
              ? `${(hiringProbability.probability * 100).toFixed(1)}%`
              : 'Unavailable'}
          </div>
          <p className="text-[10px] text-[var(--cf-text-secondary)] leading-tight">
            Strict empirical integrity. No fake percentages.
          </p>
        </div>
      </div>

      {/* Mandatory Disclaimer */}
      <div className="p-3.5 rounded-lg border border-amber-900/40 bg-amber-950/20 text-amber-300 text-xs flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold tracking-wide">Deterministic Verification Guarantee:</span>
          <p className="text-amber-300/80 leading-relaxed">
            CampusFlow does NOT estimate hiring chances. Role Match is an evidence alignment metric
            based on stated requirements. It is NOT a hiring probability, interview prediction, or
            offer guarantee.
          </p>
        </div>
      </div>

      {/* Grid: 1. Eligibility Breakdown, 2. Role Match Alignment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Eligibility Engine Breakdown */}
        <div className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--cf-border)] pb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Eligibility Verification
            </h2>

            {eligibility && (
              <span
                className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold uppercase ${
                  eligibility.status === 'eligible'
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                    : eligibility.status === 'likely_eligible'
                      ? 'bg-blue-950/60 text-blue-400 border border-blue-800/40'
                      : eligibility.status === 'uncertain'
                        ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                        : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                }`}
              >
                {eligibility.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {eligibility?.criteria.map((c, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/30 border border-[var(--cf-border)] space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-white">{c.criterion}</span>
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    {c.status === 'pass' && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Pass
                      </span>
                    )}
                    {c.status === 'fail' && (
                      <span className="text-rose-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Fail
                      </span>
                    )}
                    {c.status === 'uncertain' && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" /> Uncertain
                      </span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
                  {c.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Role Match Alignment Breakdown */}
        <div className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--cf-border)] pb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--cf-primary)]" />
              Role Match Alignment
            </h2>

            {roleMatch && (
              <div className="flex items-center gap-2 font-mono">
                <span className="text-base font-bold text-white">{roleMatch.score}/100</span>
                <span className="text-[10px] text-[var(--cf-text-secondary)] uppercase">
                  ({roleMatch.evidenceConfidence} conf)
                </span>
              </div>
            )}
          </div>

          {roleMatch ? (
            <div className="space-y-4">
              {/* Supporting Evidence */}
              <div className="space-y-2">
                <h3 className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wide">
                  Demonstrated Qualifications ({roleMatch.supportingEvidence.length})
                </h3>
                {roleMatch.supportingEvidence.length === 0 ? (
                  <p className="text-xs text-[var(--cf-text-secondary)] italic">
                    No matching demonstrated evidence logged yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {roleMatch.supportingEvidence.map((ev, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-emerald-950/20 border border-emerald-900/30 text-xs text-slate-200 flex items-start gap-2"
                      >
                        <span className="text-emerald-400 font-bold shrink-0">+</span>
                        <span>{ev}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Gaps */}
              <div className="space-y-2">
                <h3 className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-wide">
                  Identified Requirement Gaps ({roleMatch.gaps.length})
                </h3>
                {roleMatch.gaps.length === 0 ? (
                  <p className="text-xs text-[var(--cf-text-secondary)] italic">
                    No requirement gaps detected for this role.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {roleMatch.gaps.map((gap, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-amber-950/20 border border-amber-900/30 text-xs text-slate-300 flex items-start gap-2"
                      >
                        <span className="text-amber-400 font-bold shrink-0">-</span>
                        <span>{gap}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
              Evaluating qualifications...
            </div>
          )}
        </div>
      </div>

      {/* Relevant Academic Brain Concepts & Technical Requirements */}
      {opportunity.skillRequirements && opportunity.skillRequirements.length > 0 && (
        <div className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--cf-border)] pb-2.5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              Relevant Academic Brain Concepts & Coursework Connections
            </h3>
            <span className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
              {opportunity.skillRequirements.length} Tracked Technical Requirements
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            {opportunity.skillRequirements.map((sr) => (
              <div
                key={sr.id}
                className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/40 border border-[var(--cf-border)] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">
                    {sr.skill?.name || 'Skill Requirement'}
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--cf-bg-surface-1)] text-slate-300 border border-[var(--cf-border)]">
                    {sr.requirementType}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
                  Min Proficiency:{' '}
                  <span className="text-slate-300 capitalize">{sr.minProficiency}</span>
                </div>
                {sr.notes && (
                  <p className="text-[11px] text-slate-400 italic leading-snug">{sr.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Probability Integrity Section */}
      <div className="p-6 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--cf-border)] gap-2">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400" />
              Probability Integrity Assessment
            </h2>
            <p className="text-xs text-[var(--cf-text-secondary)]">
              Strict empirical standards for hiring & offer probabilities. No fabricated
              percentages.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded font-mono text-xs uppercase font-semibold bg-amber-950/40 text-amber-300 border border-amber-800/40 shrink-0">
            {hiringProbability?.status === 'calculated'
              ? 'Empirical Prediction'
              : 'Statistically Guarded'}
          </span>
        </div>

        {/* Primary Probability Display Banner */}
        {hiringProbability?.status === 'calculated' ? (
          <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-900/40 space-y-2">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {(hiringProbability.probability * 100).toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-slate-300">
                Uncertainty Interval: [
                {(hiringProbability.metadata.uncertaintyInterval.lower * 100).toFixed(1)}%,{' '}
                {(hiringProbability.metadata.uncertaintyInterval.upper * 100).toFixed(1)}%] (
                {(hiringProbability.metadata.uncertaintyInterval.confidenceLevel * 100).toFixed(0)}%
                CI)
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Calibrated empirical estimate cohorted on{' '}
              {hiringProbability.metadata.populationDefinition}.
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-900/40 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold font-mono text-amber-300">
                {hiringProbability?.message ||
                  'Probability unavailable: insufficient comparable outcome data.'}
              </span>
            </div>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              CampusFlow strictly refuses to display a fabricated hiring percentage. A statistically
              defensible probability requires validated calibration (Brier score ≤ 0.25) and
              sufficient comparable historical candidate outcomes (N ≥ 100).
            </p>
            <div className="flex items-center gap-4 text-xs font-mono text-amber-400 pt-1">
              <span>
                Comparable Sample Observed: {hiringProbability?.comparableSampleSize ?? 0}
              </span>
              <span>•</span>
              <span>Minimum Required: {hiringProbability?.minimumRequiredSampleSize ?? 100}</span>
            </div>
          </div>
        )}

        {/* "How is this calculated?" Interactive Transparency Panel */}
        <div className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHowCalculated(!showHowCalculated)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-[var(--cf-bg-surface-2)]/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <HelpCircle className="w-4 h-4 text-[var(--cf-primary)]" />
              <span className="text-sm font-semibold text-white tracking-wide">
                How is this calculated?
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--cf-bg-surface-1)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]">
                8-Pillar Transparency Guarantee
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--cf-text-secondary)] font-mono">
              <span>{showHowCalculated ? 'Hide details' : 'Show details'}</span>
              {showHowCalculated ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {showHowCalculated && (
            <div className="p-5 border-t border-[var(--cf-border)] space-y-6 text-xs">
              {/* 1. Student Evidence */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-950/60 border border-blue-800/40 text-blue-400 font-mono text-[11px] flex items-center justify-center font-bold">
                    1
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-blue-300">
                    Student Evidence
                  </h3>
                </div>
                <p className="text-[var(--cf-text-secondary)] pl-7 leading-relaxed">
                  Why CampusFlow thinks the student has the relevant capabilities. Extracted
                  deterministically from verified coursework, Academic Brain concept mastery, and
                  demonstrated project artifacts at prediction snapshot time.
                </p>
                <div className="pl-7 space-y-1.5 pt-1">
                  {transparency?.evidenceProvenance &&
                  transparency.evidenceProvenance.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {transparency.evidenceProvenance.map((s, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-[var(--cf-bg-surface-1)] text-slate-200 border border-[var(--cf-border)] font-mono text-[11px]"
                        >
                          {s.skillName || s.title} ({s.evidenceSource} • {s.evidenceLevel})
                        </span>
                      ))}
                    </div>
                  ) : roleMatch?.supportingEvidence && roleMatch.supportingEvidence.length > 0 ? (
                    <div className="space-y-1">
                      {roleMatch.supportingEvidence.slice(0, 3).map((ev, idx) => (
                        <div key={idx} className="text-slate-300 font-mono text-[11px]">
                          • {ev}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic font-mono text-[11px]">
                      No demonstrated skill evidence records associated with current profile yet.
                    </p>
                  )}
                </div>
              </div>

              {/* 2. Opportunity Evidence */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 font-mono text-[11px] flex items-center justify-center font-bold">
                    2
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
                    Opportunity Evidence
                  </h3>
                </div>
                <p className="text-[var(--cf-text-secondary)] pl-7 leading-relaxed">
                  Where requirements came from. Captured in an immutable opportunity snapshot to
                  prevent historical training drift or post-application requirement revisions.
                </p>
                <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Source Organization
                    </span>
                    <span className="text-slate-200">
                      {transparency?.opportunitySnapshot?.company.name ||
                        opportunity.sourceOrganization}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] truncate">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Source Provenance URL
                    </span>
                    <span className="text-[var(--cf-primary)] truncate">
                      {transparency?.opportunitySnapshot?.sourceProvenance.sourceUrl ||
                        opportunity.sourceUrl ||
                        'Direct / Official Ingestion'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Retrieval Timestamp
                    </span>
                    <span className="text-slate-200">
                      {new Date(
                        transparency?.opportunitySnapshot?.sourceProvenance.retrievalTimestamp ||
                          opportunity.retrievalTimestamp ||
                          Date.now(),
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] truncate">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Immutable Content Hash
                    </span>
                    <span className="text-slate-400 truncate">
                      {transparency?.opportunitySnapshot?.contentHash || 'sha256:immutable_source'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Model */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-400 font-mono text-[11px] flex items-center justify-center font-bold">
                    3
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300">
                    Model
                  </h3>
                </div>
                <p className="text-[var(--cf-text-secondary)] pl-7 leading-relaxed">
                  Which approved model produced the prediction. CampusFlow rules strictly forbid
                  referencing unapproved, uncalibrated, or ad-hoc machine learning models.
                </p>
                <div className="pl-7 pt-1">
                  <div className="p-3 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">
                        Active Model:{' '}
                        <strong className="text-white">
                          {transparency?.modelVersion || 'None (Model Gate Locked)'}
                        </strong>
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">
                        {transparency?.prediction.status === 'calculated'
                          ? 'Approved Production'
                          : 'Model Not Activated'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--cf-text-secondary)]">
                      Governance Rule: Probabilities may only be emitted by models explicitly vetted
                      through the 10-point Model Readiness Gate and signed off in the Model
                      Registry.
                    </p>
                  </div>
                </div>
              </div>

              {/* 4. Data */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 font-mono text-[11px] flex items-center justify-center font-bold">
                    4
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
                    Data
                  </h3>
                </div>
                <p className="text-[var(--cf-text-secondary)] pl-7 leading-relaxed">
                  How many comparable historical observations support it. Models must define
                  explicit, homogeneous populations (geography, role family, graduation cohort)
                  rather than pooling unrelated students.
                </p>
                <div className="pl-7 grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] pt-1">
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Comparable Observations (N)
                    </span>
                    <span className="text-white font-bold">
                      {transparency?.comparableSampleSize ?? 0}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Observed Positive Outcomes (k)
                    </span>
                    <span className="text-white font-bold">
                      {transparency?.observedPositiveOutcomes ?? 0}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Population Cohort
                    </span>
                    <span className="text-slate-300 truncate block">
                      {transparency?.populationDefinition || opportunity.title}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Validation */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 font-mono text-[11px] flex items-center justify-center font-bold">
                    5
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300">
                    Validation
                  </h3>
                </div>
                <p className="text-[var(--cf-text-secondary)] pl-7 leading-relaxed">
                  How the model performed on held-out data. Validated strictly across out-of-time
                  temporal splits (train → validation → test) to ensure real-world predictive
                  calibration and discrimination.
                </p>
                <div className="pl-7 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] pt-1">
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Brier Score
                    </span>
                    <span className="text-white">
                      {transparency?.validationMetrics?.['brierScore'] != null
                        ? transparency.validationMetrics['brierScore'].toFixed(3)
                        : 'N/A (Ungated)'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      Log Loss
                    </span>
                    <span className="text-white">
                      {transparency?.validationMetrics?.['logLoss'] != null
                        ? transparency.validationMetrics['logLoss'].toFixed(3)
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      ROC-AUC
                    </span>
                    <span className="text-white">
                      {transparency?.validationMetrics?.['rocAuc'] != null
                        ? transparency.validationMetrics['rocAuc'].toFixed(3)
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                      ECE (Calibration)
                    </span>
                    <span className="text-white">
                      {transparency?.validationMetrics?.['expectedCalibrationError'] != null
                        ? transparency.validationMetrics['expectedCalibrationError'].toFixed(3)
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 6. Uncertainty */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-950/60 border border-amber-800/40 text-amber-400 font-mono text-[11px] flex items-center justify-center font-bold">
                    6
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                    Uncertainty
                  </h3>
                </div>
                <p className="text-[var(--cf-text-secondary)] pl-7 leading-relaxed">
                  How wide the prediction interval is. Predictions expose statistical uncertainty
                  via bootstrap intervals. Without sufficient sample support, the interval span is
                  indefinite.
                </p>
                <div className="pl-7 pt-1">
                  <div className="p-3 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] font-mono text-[11px]">
                    {transparency?.uncertainty ? (
                      <span className="text-white">
                        [{(transparency.uncertainty.lower * 100).toFixed(1)}%,{' '}
                        {(transparency.uncertainty.upper * 100).toFixed(1)}%] at{' '}
                        {(transparency.uncertainty.confidenceLevel * 100).toFixed(0)}% Confidence
                      </span>
                    ) : (
                      <span className="text-amber-400">
                        Uncertainty interval undefined: Model gate active pending empirical outcome
                        evidence.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 7. Unknowns */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-950/60 border border-rose-800/40 text-rose-400 font-mono text-[11px] flex items-center justify-center font-bold">
                    7
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-rose-300">
                    Unknowns
                  </h3>
                </div>
                <p className="text-[var(--cf-text-secondary)] pl-7 leading-relaxed">
                  Important factors CampusFlow does not observe. Academic and self-evidence data
                  cannot capture these critical dimensions:
                </p>
                <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                  {(
                    transparency?.unobservedFactors || [
                      'Internal recruiter hiring quotas and headcount revisions',
                      'Proprietary technical interview question variations',
                      'Interpersonal rapport and team culture alignment dynamics',
                      'Macroeconomic and tech-sector hiring velocity shifts',
                      'Competing applicant pool volume and pedigree distributions',
                    ]
                  ).map((uf, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] text-slate-300"
                    >
                      • {uf}
                    </div>
                  ))}
                </div>
              </div>

              {/* 8. Availability */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px] flex items-center justify-center font-bold">
                    8
                  </span>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                    Availability
                  </h3>
                </div>
                <div className="pl-7 pt-1">
                  <div
                    className={`p-3.5 rounded-lg border font-mono ${
                      transparency?.prediction.status === 'calculated'
                        ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300'
                        : 'border-amber-900/60 bg-amber-950/30 text-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {transparency?.prediction.status === 'calculated' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span className="font-bold text-xs">
                        {transparency?.prediction.status === 'calculated'
                          ? 'Probability Available: Model Approved & Calibrated'
                          : transparency?.prediction.status === 'unavailable'
                            ? transparency.prediction.message
                            : 'Probability unavailable: insufficient comparable outcome data.'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300/80 mt-1 leading-relaxed">
                      CampusFlow guarantees that probabilities will never be displayed without
                      auditable evidence, temporal out-of-time validation, and meeting the 10-point
                      Model Readiness Gate.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Strict Dimensional Distinctions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/40 border border-[var(--cf-border)] space-y-1">
            <span className="font-semibold text-white">Eligibility ≠ Probability</span>
            <p className="text-[var(--cf-text-secondary)] leading-relaxed">
              Eligibility only validates institutional rule constraints (e.g., graduation year,
              degree program, visa status). Being eligible does not indicate candidate hiring
              likelihood.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/40 border border-[var(--cf-border)] space-y-1">
            <span className="font-semibold text-white">Role Match ≠ Probability</span>
            <p className="text-[var(--cf-text-secondary)] leading-relaxed">
              Role Match (out of 100) measures alignment between your verified skills and stated job
              requirements. It is an educational readiness diagnostic, NOT an offer probability.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/40 border border-[var(--cf-border)] space-y-1">
            <span className="font-semibold text-white">Target Selection ≠ Employability</span>
            <p className="text-[var(--cf-text-secondary)] leading-relaxed">
              Manually choosing a target company, bookmarking an opportunity, or tracking an
              application is student intent, not empirical evidence of employability.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/40 border border-[var(--cf-border)] space-y-1">
            <span className="font-semibold text-white">Claimed Skill ≠ Demonstrated Evidence</span>
            <p className="text-[var(--cf-text-secondary)] leading-relaxed">
              A self-reported skill is not equivalent to demonstrated coursework mastery, completed
              projects, or verified technical artifacts.
            </p>
          </div>
        </div>

        {/* Unobserved Factors Disclosure */}
        <div className="p-4 rounded-lg bg-[var(--cf-bg-surface-2)]/20 border border-[var(--cf-border)] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <EyeOff className="w-4 h-4 text-slate-400" />
            <span>Important Information CampusFlow Does NOT Observe</span>
          </div>
          <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
            CampusFlow does not track private interview environments or macroeconomic factors.
            Transparently omitted from calculations:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 font-mono">
            {hiringProbability?.unobservedFactors?.map((factor, idx) => (
              <div key={idx} className="flex items-start gap-1.5 py-0.5">
                <span className="text-slate-500 shrink-0">•</span>
                <span className="leading-snug">{factor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calculated Model Provenance Table (when calculated) */}
        {hiringProbability?.status === 'calculated' && (
          <div className="p-4 rounded-lg bg-[var(--cf-bg-surface-2)]/30 border border-[var(--cf-border)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white font-mono uppercase">
                Model Provenance & Calibration Metrics
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                Pipeline v{hiringProbability.metadata.predictionProvenance.pipelineVersion}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                  Model Version
                </span>
                <span className="text-white">{hiringProbability.metadata.modelVersion}</span>
              </div>
              <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                  Dataset Version
                </span>
                <span className="text-white">
                  {hiringProbability.metadata.trainingDatasetVersion}
                </span>
              </div>
              <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                <span className="text-[var(--cf-text-secondary)] block text-[10px]">
                  Brier Score
                </span>
                <span className="text-white">
                  {hiringProbability.metadata.calibrationMetrics.brierScore.toFixed(3)}
                </span>
              </div>
              <div className="p-2 rounded bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
                <span className="text-[var(--cf-text-secondary)] block text-[10px]">Log Loss</span>
                <span className="text-white">
                  {hiringProbability.metadata.calibrationMetrics.logLoss.toFixed(3)}
                </span>
              </div>
            </div>
            <div className="text-[11px] font-mono text-[var(--cf-text-secondary)] truncate">
              Input Snapshot Hash: {hiringProbability.metadata.predictionProvenance.inputDataHash}
            </div>
          </div>
        )}

        {/* Ethical Non-deterministic Guarantee */}
        <div className="text-[11px] text-[var(--cf-text-secondary)] border-t border-[var(--cf-border)] pt-3 leading-relaxed flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span>
            {hiringProbability?.disclaimer ||
              'CampusFlow predictions are statistical aggregations based on historical data. A probability is NEVER a guarantee, deterministic prediction of employability, or ranking of human worth.'}
          </span>
        </div>
      </div>
    </div>
  );
}
