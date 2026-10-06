'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Sparkles,
  User,
  ShieldCheck,
  CheckCircle,
  XCircle,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  BookOpen,
  AlertTriangle,
  FileText,
  Bookmark,
  Trash2,
} from 'lucide-react';
import {
  fetchOpportunities,
  fetchCareerProfile,
  saveCareerProfile,
  fetchRoleFamilies,
  fetchTargetRoles,
  fetchSkillEvidence,
  fetchActionPlan,
  fetchApplications,
  createApplication,
  evaluateOpportunity,
  fetchOpportunityLandscape,
  fetchStudentSavedOpportunities,
  createStudentSavedOpportunity,
  deleteStudentSavedOpportunity,
  syncAcademicEvidence,
} from '@/lib/api';
import type {
  Opportunity,
  StudentCareerProfile,
  RoleFamily,
  StudentSkillEvidence,
  StudentTargetRole,
  ActionOptimizerItem,
  OpportunityEvaluation,
  ApplicationRecord,
  OpportunityLandscapeSummary,
  StudentSavedOpportunity,
} from '@campusflow/types';

export default function OpportunitiesPage() {
  const [activeTab, setActiveTab] = useState<
    'browse' | 'saved' | 'optimizer' | 'profile' | 'evidence' | 'applications'
  >('browse');

  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, OpportunityEvaluation>>({});
  const [landscape, setLandscape] = useState<OpportunityLandscapeSummary>({
    totalDiscovered: 0,
    eligibleCount: 0,
    strongMatchesCount: 0,
    preparationRequiredCount: 0,
    ineligibleCount: 0,
  });
  const [savedOpportunities, setSavedOpportunities] = useState<
    Array<StudentSavedOpportunity & { opportunity?: Opportunity }>
  >([]);
  const [syncingEvidence, setSyncingEvidence] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [savingOppId, setSavingOppId] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentCareerProfile | null>(null);
  const [roleFamilies, setRoleFamilies] = useState<RoleFamily[]>([]);
  const [targetRoles, setTargetRoles] = useState<StudentTargetRole[]>([]);
  const [skillEvidence, setSkillEvidence] = useState<StudentSkillEvidence[]>([]);
  const [actionPlan, setActionPlan] = useState<ActionOptimizerItem[]>([]);
  const [applications, setApplications] = useState<
    Array<ApplicationRecord & { opportunity?: Opportunity }>
  >([]);
  const [selectedRoleFamily, setSelectedRoleFamily] = useState<string>('all');

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    targetCareerPath: '',
    degreeLevel: 'BTech',
    major: 'Computer Science',
    university: '',
    graduationYear: 2027,
    graduationMonth: 5,
    currentYearOfStudy: 3,
    isEnrolled: true,
    workAuthorization: 'us_citizen',
    gpa: '3.8',
    yearsExperience: '1.0',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [opps, prof, rfs, trs, evs, planData, apps, ls, saved] = await Promise.all([
        fetchOpportunities(),
        fetchCareerProfile(),
        fetchRoleFamilies(),
        fetchTargetRoles(),
        fetchSkillEvidence(),
        fetchActionPlan(),
        fetchApplications(),
        fetchOpportunityLandscape(),
        fetchStudentSavedOpportunities(),
      ]);

      setOpportunities(opps);
      setLandscape(ls);
      setSavedOpportunities(saved);
      setProfile(prof);
      if (prof) {
        setProfileForm({
          targetCareerPath: prof.targetCareerPath || '',
          degreeLevel: prof.degreeLevel || 'BTech',
          major: prof.major || 'Computer Science',
          university: prof.university || '',
          graduationYear: prof.graduationYear || 2027,
          graduationMonth: prof.graduationMonth || 5,
          currentYearOfStudy: prof.currentYearOfStudy || 3,
          isEnrolled: prof.isEnrolled ?? true,
          workAuthorization: prof.workAuthorization || 'us_citizen',
          gpa: prof.gpa || '3.8',
          yearsExperience: prof.yearsExperience || '1.0',
        });
      }
      setRoleFamilies(rfs);
      setTargetRoles(trs);
      setSkillEvidence(evs);
      setActionPlan(planData.items);
      setApplications(apps);

      // Auto-evaluate opportunities if profile exists
      if (opps.length > 0) {
        const evalMap: Record<string, OpportunityEvaluation> = {};
        for (const opp of opps.slice(0, 5)) {
          const res = await evaluateOpportunity(opp.id);
          if (res) evalMap[opp.id] = res;
        }
        setEvaluations(evalMap);
      }
    } catch (err) {
      console.error('Error loading opportunity intelligence:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleSaveOpportunity = async (opportunityId: string) => {
    try {
      setSavingOppId(opportunityId);
      const newSaved = await createStudentSavedOpportunity({
        opportunityId,
        status: 'saved',
      });
      const opp = opportunities.find((o) => o.id === opportunityId);
      setSavedOpportunities((prev) => [{ ...newSaved, opportunity: opp }, ...prev]);
    } catch (err) {
      console.error('Failed to save opportunity:', err);
    } finally {
      setSavingOppId(null);
    }
  };

  const handleDeleteSavedOpportunity = async (id: string) => {
    try {
      await deleteStudentSavedOpportunity(id);
      setSavedOpportunities((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to remove saved opportunity:', err);
    }
  };

  const handleSyncAcademicEvidence = async () => {
    try {
      setSyncingEvidence(true);
      setSyncMessage(null);
      const res = await syncAcademicEvidence();
      const updatedEvidence = await fetchSkillEvidence();
      setSkillEvidence(updatedEvidence);
      setSyncMessage(
        `Derived and synchronized ${res.syncedCount} evidence candidates with Academic Brain provenance.`,
      );
    } catch (err) {
      console.error('Failed to sync academic evidence:', err);
      setSyncMessage('Failed to sync academic evidence.');
    } finally {
      setSyncingEvidence(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      const updated = await saveCareerProfile({
        targetCareerPath: profileForm.targetCareerPath || null,
        degreeLevel: profileForm.degreeLevel || null,
        major: profileForm.major || null,
        university: profileForm.university || null,
        graduationYear: Number(profileForm.graduationYear),
        graduationMonth: Number(profileForm.graduationMonth),
        currentYearOfStudy: Number(profileForm.currentYearOfStudy),
        isEnrolled: profileForm.isEnrolled,
        workAuthorization: profileForm.workAuthorization || null,
        gpa: profileForm.gpa || null,
        yearsExperience: profileForm.yearsExperience || '0.0',
      });
      setProfile(updated);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      await loadAllData();
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTrackApplication = async (oppId: string) => {
    try {
      await createApplication(oppId, 'Tracked from Opportunity Intelligence');
      const apps = await fetchApplications();
      setApplications(apps);
      setActiveTab('applications');
    } catch (err) {
      console.error('Failed to track application:', err);
    }
  };

  const filteredOpportunities = opportunities.filter((o) => {
    if (selectedRoleFamily === 'all') return true;
    return o.roleFamilyId === selectedRoleFamily;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--cf-border)]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-[var(--cf-primary)]" />
            Opportunity Intelligence
          </h1>
          <p className="text-xs text-[var(--cf-text-secondary)] mt-1 font-mono">
            Evidence-based career readiness • Deterministic eligibility • Objective role match
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] rounded-lg text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'browse'
                ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                : 'text-[var(--cf-text-secondary)] hover:text-white'
            }`}
          >
            Opportunities ({filteredOpportunities.length})
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'saved'
                ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                : 'text-[var(--cf-text-secondary)] hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Saved ({savedOpportunities.length})
          </button>
          <button
            onClick={() => setActiveTab('optimizer')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'optimizer'
                ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                : 'text-[var(--cf-text-secondary)] hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Action Optimizer ({actionPlan.length})
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                : 'text-[var(--cf-text-secondary)] hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Career Profile
          </button>
          <button
            onClick={() => setActiveTab('evidence')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'evidence'
                ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                : 'text-[var(--cf-text-secondary)] hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Evidence ({skillEvidence.length})
          </button>
          <button
            onClick={() => setActiveTab('applications')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'applications'
                ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                : 'text-[var(--cf-text-secondary)] hover:text-white'
            }`}
          >
            Applications ({applications.length})
          </button>
        </div>
      </div>

      {/* Opportunity Landscape Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
          <div className="text-[11px] font-mono text-[var(--cf-text-secondary)] uppercase">
            Discovered
          </div>
          <div className="text-xl font-bold text-white mt-1">{landscape.totalDiscovered}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Verified Postings</div>
        </div>
        <div className="p-3.5 rounded-xl border border-emerald-900/40 bg-emerald-950/20">
          <div className="text-[11px] font-mono text-emerald-400 uppercase">Eligible</div>
          <div className="text-xl font-bold text-emerald-300 mt-1">{landscape.eligibleCount}</div>
          <div className="text-[10px] text-emerald-400/70 mt-0.5">Requirements Met</div>
        </div>
        <div className="p-3.5 rounded-xl border border-blue-900/40 bg-blue-950/20">
          <div className="text-[11px] font-mono text-blue-400 uppercase">Strong Matches</div>
          <div className="text-xl font-bold text-blue-300 mt-1">{landscape.strongMatchesCount}</div>
          <div className="text-[10px] text-blue-400/70 mt-0.5">Role Match &ge; 70</div>
        </div>
        <div className="p-3.5 rounded-xl border border-amber-900/40 bg-amber-950/20">
          <div className="text-[11px] font-mono text-amber-400 uppercase">Prep Required</div>
          <div className="text-xl font-bold text-amber-300 mt-1">
            {landscape.preparationRequiredCount}
          </div>
          <div className="text-[10px] text-amber-400/70 mt-0.5">Preparation Needed</div>
        </div>
        <div className="p-3.5 rounded-xl border border-rose-900/40 bg-rose-950/20">
          <div className="text-[11px] font-mono text-rose-400 uppercase">Ineligible</div>
          <div className="text-xl font-bold text-rose-300 mt-1">{landscape.ineligibleCount}</div>
          <div className="text-[10px] text-rose-400/70 mt-0.5">Constraints Unmet</div>
        </div>
      </div>

      {/* Mandatory Regulatory / AI Disclaimer Banner */}
      <div className="p-3.5 rounded-lg border border-amber-900/40 bg-amber-950/20 text-amber-300 text-xs flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold tracking-wide">Deterministic Verification Guarantee:</span>
          <p className="text-amber-300/80 leading-relaxed">
            CampusFlow does NOT generate fake hiring probabilities or offer guarantees. Eligibility
            and Role Match scores (0–100) are explainable evidence alignment metrics derived
            strictly from cited opportunity requirements and demonstrated academic/project proof.
          </p>
        </div>
      </div>

      {/* TAB 1: BROWSE OPPORTUNITIES */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          {/* Role Family Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs">
            <span className="text-[var(--cf-text-secondary)] font-mono text-[11px] shrink-0">
              Role Family:
            </span>
            <button
              onClick={() => setSelectedRoleFamily('all')}
              className={`px-2.5 py-1 rounded-md border text-xs font-mono transition-colors shrink-0 ${
                selectedRoleFamily === 'all'
                  ? 'border-[var(--cf-primary)] bg-[var(--cf-primary)]/10 text-white'
                  : 'border-[var(--cf-border)] text-[var(--cf-text-secondary)] hover:text-white'
              }`}
            >
              All Role Families
            </button>
            {roleFamilies.map((rf) => (
              <button
                key={rf.id}
                onClick={() => setSelectedRoleFamily(rf.id)}
                className={`px-2.5 py-1 rounded-md border text-xs font-mono transition-colors shrink-0 ${
                  selectedRoleFamily === rf.id
                    ? 'border-[var(--cf-primary)] bg-[var(--cf-primary)]/10 text-white'
                    : 'border-[var(--cf-border)] text-[var(--cf-text-secondary)] hover:text-white'
                }`}
              >
                {rf.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-[var(--cf-text-secondary)] font-mono">
              Loading verified opportunities...
            </div>
          ) : filteredOpportunities.length === 0 ? (
            <div className="p-12 text-center border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)]">
              <Briefcase className="w-8 h-8 text-[var(--cf-text-secondary)] mx-auto mb-3 opacity-60" />
              <h3 className="text-sm font-medium text-white">No opportunities found</h3>
              <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                No active postings match the selected filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredOpportunities.map((opp) => {
                const evalData = evaluations[opp.id];
                const eligibility = evalData?.eligibility;
                const roleMatch = evalData?.roleMatch;

                return (
                  <div
                    key={opp.id}
                    className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:border-[var(--cf-primary)]/40 transition-colors space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-white tracking-tight">
                            {opp.title}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-[var(--cf-bg-surface-2)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]">
                            {opp.opportunityType.replace('_', ' ')}
                          </span>
                          {opp.season && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/40 text-blue-400 border border-blue-900/40">
                              {opp.season}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                          Source:{' '}
                          <span className="text-white font-medium">{opp.sourceOrganization}</span> •
                          Extraction: {opp.extractionVersion}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleSaveOpportunity(opp.id)}
                          disabled={
                            savedOpportunities.some((s) => s.opportunityId === opp.id) ||
                            savingOppId === opp.id
                          }
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                            savedOpportunities.some((s) => s.opportunityId === opp.id)
                              ? 'border-emerald-600 bg-emerald-950/40 text-emerald-400'
                              : 'border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-white hover:bg-[var(--cf-bg-surface-2)]/80'
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>
                            {savedOpportunities.some((s) => s.opportunityId === opp.id)
                              ? 'Saved'
                              : savingOppId === opp.id
                                ? 'Saving...'
                                : 'Save'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleTrackApplication(opp.id)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--cf-bg-surface-2)] text-white hover:bg-[var(--cf-bg-surface-2)]/80 border border-[var(--cf-border)] transition-colors"
                        >
                          Track Application
                        </button>
                        <Link
                          href={`/opportunities/${opp.id}`}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--cf-primary)] text-white hover:bg-[var(--cf-primary)]/90 transition-colors flex items-center gap-1"
                        >
                          <span>Full Evaluation</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>

                    {/* Evaluation Badges & Match Bar */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-lg bg-[var(--cf-bg-surface-2)]/50 border border-[var(--cf-border)] text-xs">
                      {/* 1. Eligibility */}
                      <div>
                        <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                          Eligibility Verification:
                        </span>
                        {eligibility ? (
                          <div className="flex items-center gap-1.5">
                            {eligibility.status === 'eligible' && (
                              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] bg-emerald-950/50 text-emerald-400 border border-emerald-800/40 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Eligible
                              </span>
                            )}
                            {eligibility.status === 'likely_eligible' && (
                              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] bg-blue-950/50 text-blue-400 border border-blue-800/40 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Likely Eligible
                              </span>
                            )}
                            {eligibility.status === 'uncertain' && (
                              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] bg-amber-950/50 text-amber-400 border border-amber-800/40 flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" /> Uncertain (Data Missing)
                              </span>
                            )}
                            {eligibility.status === 'not_eligible' && (
                              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] bg-rose-950/50 text-rose-400 border border-rose-800/40 flex items-center gap-1">
                                <XCircle className="w-3 h-3" /> Not Eligible
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--cf-text-secondary)] font-mono text-[11px]">
                            Evaluating requirements...
                          </span>
                        )}
                      </div>

                      {/* 2. Role Match */}
                      <div>
                        <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                          Role Match Alignment:
                        </span>
                        {roleMatch ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-white">
                              {roleMatch.score}/100
                            </span>
                            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[var(--cf-primary)] rounded-full transition-all"
                                style={{ width: `${roleMatch.score}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-[var(--cf-text-secondary)] uppercase">
                              Confidence: {roleMatch.evidenceConfidence}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[var(--cf-text-secondary)] font-mono text-[11px]">
                            Calculating evidence alignment...
                          </span>
                        )}
                      </div>

                      {/* 3. Provenance */}
                      <div>
                        <span className="text-[11px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                          Source Provenance:
                        </span>
                        <a
                          href={opp.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--cf-primary)] hover:underline inline-flex items-center gap-1 font-mono text-[11px] truncate max-w-full"
                        >
                          <span className="truncate">{opp.sourceUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>

                    {/* Supporting Evidence and Gaps Snippet */}
                    {roleMatch && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        {roleMatch.supportingEvidence.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-mono text-emerald-400 font-semibold block">
                              Demonstrated Strengths:
                            </span>
                            {roleMatch.supportingEvidence.slice(0, 2).map((item, idx) => (
                              <p
                                key={idx}
                                className="text-slate-300 text-[11px] flex items-center gap-1.5"
                              >
                                <span className="text-emerald-400 font-bold">+</span>
                                <span>{item}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        {roleMatch.gaps.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-mono text-amber-400 font-semibold block">
                              Target Gaps:
                            </span>
                            {roleMatch.gaps.slice(0, 2).map((gap, idx) => (
                              <p
                                key={idx}
                                className="text-slate-400 text-[11px] flex items-center gap-1.5"
                              >
                                <span className="text-amber-400 font-bold">-</span>
                                <span>{gap}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: SAVED OPPORTUNITIES */}
      {activeTab === 'saved' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Saved & Bookmarked Opportunities</h3>
              <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                Personal collection of canonical opportunities and custom tracked positions.
              </p>
            </div>
          </div>

          {savedOpportunities.length === 0 ? (
            <div className="p-12 text-center border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)]">
              <Bookmark className="w-8 h-8 text-[var(--cf-text-secondary)] mx-auto mb-3 opacity-60" />
              <h3 className="text-sm font-medium text-white">No saved opportunities yet</h3>
              <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                Save opportunities from the Browse tab to review criteria and track your
                preparation.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {savedOpportunities.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">
                        {s.opportunity?.title || s.customTitle || 'Saved Opportunity'}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[var(--cf-bg-surface-2)] text-slate-300 border border-[var(--cf-border)]">
                        {s.status}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--cf-text-secondary)] font-mono">
                      {s.opportunity?.sourceOrganization ||
                        s.customCompany ||
                        'External Opportunity'}{' '}
                      • Saved {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                    {s.notes && <p className="text-xs text-slate-300 italic pt-1">{s.notes}</p>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {s.opportunityId && (
                      <Link
                        href={`/opportunities/${s.opportunityId}`}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--cf-primary)] text-white hover:bg-[var(--cf-primary)]/90 transition-colors"
                      >
                        View Evaluation
                      </Link>
                    )}
                    <button
                      onClick={() => handleDeleteSavedOpportunity(s.id)}
                      className="p-1.5 rounded-md border border-rose-900/40 text-rose-400 hover:bg-rose-950/30 transition-colors"
                      title="Remove saved opportunity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTION OPTIMIZER */}
      {activeTab === 'optimizer' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-2">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              What would most improve my opportunity set?
            </h2>
            <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
              The optimizer aggregates requirement demands across all active opportunities within
              your target roles, cross-references your current evidence levels, and connects missing
              skills to relevant academic courses and syllabus nodes in your Second Brain.
            </p>
          </div>

          {actionPlan.length === 0 ? (
            <div className="p-12 text-center border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)]">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3 opacity-80" />
              <h3 className="text-sm font-medium text-white">
                All high-priority qualifications demonstrated
              </h3>
              <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                You have verified or strongly demonstrated all recurring skills for your selected
                roles.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {actionPlan.map((action, idx) => (
                <div
                  key={action.skillId}
                  className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--cf-text-secondary)]">
                        #{idx + 1}
                      </span>
                      <h4 className="text-sm font-semibold text-white tracking-tight">
                        {action.skillName}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          action.impact === 'high'
                            ? 'bg-rose-950/50 text-rose-400 border border-rose-900/40'
                            : 'bg-amber-950/50 text-amber-400 border border-amber-900/40'
                        }`}
                      >
                        {action.impact} impact
                      </span>
                      <span className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
                        Demanded in {action.targetOpportunitiesCount} postings
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">
                      <span className="text-[var(--cf-text-secondary)]">Recommended Action:</span>{' '}
                      {action.recommendedAction}
                    </p>

                    {action.academicConnection && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 pt-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span className="font-mono">
                          Mapped Academic Brain Topic:{' '}
                          <span className="font-semibold text-white">
                            {action.academicConnection.courseCode} (
                            {action.academicConnection.nodeTitle})
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right font-mono text-xs">
                    <span className="text-[var(--cf-text-secondary)] block text-[10px] uppercase">
                      Current Evidence
                    </span>
                    <span className="capitalize text-white font-medium">
                      {action.currentEvidenceLevel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CAREER PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6 max-w-2xl">
          <div className="p-6 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--cf-primary)]" />
              Student Academic & Career Profile
            </h2>
            <p className="text-xs text-[var(--cf-text-secondary)]">
              {profile
                ? `Current configured profile: ${profile.targetCareerPath || 'General Track'}. `
                : ''}
              This information is used strictly for deterministic eligibility checks (degree,
              graduation timing, work authorization).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  Target Career Path
                </label>
                <input
                  type="text"
                  value={profileForm.targetCareerPath}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, targetCareerPath: e.target.value })
                  }
                  placeholder="e.g. Distributed Systems Engineer"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  Degree Level
                </label>
                <select
                  value={profileForm.degreeLevel}
                  onChange={(e) => setProfileForm({ ...profileForm, degreeLevel: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                >
                  <option value="BTech">BTech / BE</option>
                  <option value="BS">BS (Bachelor of Science)</option>
                  <option value="MS">MS / MTech</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  Major / Field of Study
                </label>
                <input
                  type="text"
                  value={profileForm.major}
                  onChange={(e) => setProfileForm({ ...profileForm, major: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  University
                </label>
                <input
                  type="text"
                  value={profileForm.university}
                  onChange={(e) => setProfileForm({ ...profileForm, university: e.target.value })}
                  placeholder="e.g. State University"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  Expected Graduation Year
                </label>
                <input
                  type="number"
                  value={profileForm.graduationYear}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, graduationYear: parseInt(e.target.value, 10) })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  Current Cumulative GPA
                </label>
                <input
                  type="text"
                  value={profileForm.gpa}
                  onChange={(e) => setProfileForm({ ...profileForm, gpa: e.target.value })}
                  placeholder="e.g. 3.85"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  Work Authorization Status
                </label>
                <select
                  value={profileForm.workAuthorization}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, workAuthorization: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                >
                  <option value="us_citizen">US Citizen / Permanent Resident</option>
                  <option value="f1_opt">F1 Visa (CPT / OPT)</option>
                  <option value="requires_sponsorship">Requires Visa Sponsorship</option>
                  <option value="authorized_other">Authorized for Local Country</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--cf-text-secondary)] mb-1">
                  Years of Experience
                </label>
                <input
                  type="text"
                  value={profileForm.yearsExperience}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, yearsExperience: e.target.value })
                  }
                  placeholder="e.g. 1.0"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                />
              </div>
            </div>

            {/* Target Role Families */}
            <div className="pt-4 border-t border-[var(--cf-border)] space-y-2">
              <span className="block text-xs font-mono text-[var(--cf-text-secondary)]">
                Active Target Roles ({targetRoles.length}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {targetRoles.length === 0 ? (
                  <span className="text-xs text-slate-500 italic font-mono">
                    All 16 initial role families currently evaluated.
                  </span>
                ) : (
                  targetRoles.map((tr) => (
                    <span
                      key={tr.id}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-[var(--cf-primary)]/10 text-[var(--cf-primary)] border border-[var(--cf-primary)]/20"
                    >
                      {roleFamilies.find((rf) => rf.id === tr.roleFamilyId)?.name || 'Role Family'}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              {profileSuccess && (
                <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Profile successfully saved!
                </span>
              )}
              <button
                type="submit"
                disabled={savingProfile}
                className="ml-auto px-4 py-2 rounded-lg text-xs font-medium bg-[var(--cf-primary)] text-white hover:bg-[var(--cf-primary)]/90 transition-colors shadow-sm disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 4: SKILL EVIDENCE */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Demonstrated & Verified Evidence</h3>
              <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                Derived with strict provenance from courses, topics, assessments, and projects.
              </p>
            </div>
            <button
              onClick={handleSyncAcademicEvidence}
              disabled={syncingEvidence}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{syncingEvidence ? 'Extracting Evidence...' : 'Sync from Academic Brain'}</span>
            </button>
          </div>

          {syncMessage && (
            <div className="p-3 rounded-lg border border-emerald-800/40 bg-emerald-950/20 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}

          <div className="p-3 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/30 text-xs text-[var(--cf-text-secondary)] space-y-1">
            <span className="font-semibold text-white">Provenance & Anti-Hallucination Guard:</span>
            <p className="leading-relaxed">
              Automatic extraction derives evidence from structured course syllabus nodes,
              assessments, and active projects. Raw document uploads into course resources do NOT
              confer academic mastery.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {skillEvidence.map((ev) => (
              <div
                key={ev.id}
                className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white">{ev.title}</h4>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      ev.evidenceLevel === 'verified'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : ev.evidenceLevel === 'demonstrated' ||
                            ev.evidenceLevel === 'strongly_demonstrated'
                          ? 'bg-blue-950/60 text-blue-400 border border-blue-800/40'
                          : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {ev.evidenceLevel.replace('_', ' ')}
                  </span>
                </div>
                {ev.description && (
                  <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
                    {ev.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-[var(--cf-border)]/40">
                  <span>Source: {ev.evidenceSource.replace('_', ' ')}</span>
                  <span>Confidence: {ev.confidenceScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: APPLICATIONS PIPELINE */}
      {activeTab === 'applications' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-1">
            <h2 className="text-sm font-semibold text-white">Application Outcome Pipeline</h2>
            <p className="text-xs text-[var(--cf-text-secondary)] font-mono">
              Deterministic state tracking: applied → assessment → interview → final_interview →
              offer/rejection
            </p>
          </div>

          {applications.length === 0 ? (
            <div className="p-12 text-center border border-[var(--cf-border)] rounded-xl bg-[var(--cf-bg-surface-1)]">
              <FileText className="w-8 h-8 text-[var(--cf-text-secondary)] mx-auto mb-3 opacity-60" />
              <h3 className="text-sm font-medium text-white">No applications tracked yet</h3>
              <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                Browse opportunities and click "Track Application" to record your pipeline.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-white">
                      {app.opportunity?.title || 'Tracked Role'}
                    </h4>
                    <p className="text-xs text-[var(--cf-text-secondary)] font-mono">
                      Applied: {new Date(app.appliedAt).toLocaleDateString()} • Transitions
                      recorded: {app.stateTransitions?.length || 1}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full font-mono text-xs font-semibold uppercase bg-[var(--cf-primary)]/10 text-[var(--cf-primary)] border border-[var(--cf-primary)]/20">
                      {app.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
