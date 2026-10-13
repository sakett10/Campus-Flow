'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  AlertCircle,
  Sparkles,
  BarChart3,
  Edit3,
  RotateCcw,
  X,
  ChevronRight,
  TrendingUp,
  BrainCircuit,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import {
  uploadExaminationPaper,
  fetchCourseExaminationPapers,
  fetchExaminationPaper,
  updateExaminationQuestion,
  fetchCourseExaminationAnalysis,
  generatePracticeAssessment,
  submitPracticeAssessment,
  fetchAiQuotaStatus,
} from '@/lib/api';
import type {
  ExaminationPaper,
  ExaminationQuestion,
  ExamPaperStructuralAnalysis,
  ExamTopicAnalysis,
  CrossPaperComparisonReport,
  PracticeAssessment,
  PracticeAssessmentFormat,
  PracticeQuestion,
  PracticeSubmission,
  QuestionDiagnosticFeedback,
  PracticeDiagnosticReport,
  AiUsageQuotaStatus,
  AcademicNodeWithResources,
} from '@campusflow/types';

interface ExaminationIntelligenceViewProps {
  courseId: string;
  courseTitle: string;
  courseCode: string;
  academicNodes: AcademicNodeWithResources[];
  onSelectTopic?: (topicId: string) => void;
}

export function ExaminationIntelligenceView({
  courseId,
  courseTitle,
  courseCode,
  academicNodes,
  onSelectTopic,
}: ExaminationIntelligenceViewProps) {
  // Navigation sub-tabs within Examination view
  const [activeSubTab, setActiveSubTab] = useState<'papers' | 'analysis' | 'practice'>('papers');

  // Papers state
  const [papers, setPapers] = useState<ExaminationPaper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedPaperDetails, setSelectedPaperDetails] = useState<{
    paper: ExaminationPaper;
    questions: ExaminationQuestion[];
  } | null>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadExamType, setUploadExamType] = useState('CAT-1');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<ExaminationQuestion | null>(null);
  const [editMarks, setEditMarks] = useState<number>(0);
  const [editTopicId, setEditTopicId] = useState<string>('');
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Analysis state
  const [analysisData, setAnalysisData] = useState<{
    courseId: string;
    paperCount: number;
    questionCount: number;
    paperAnalyses: ExamPaperStructuralAnalysis[];
    topicAnalysis: ExamTopicAnalysis[];
    crossPaperReport: CrossPaperComparisonReport | null;
  } | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Practice Assessment state
  const [practiceAssessment, setPracticeAssessment] = useState<PracticeAssessment | null>(null);
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [isGeneratingPractice, setIsGeneratingPractice] = useState(false);
  const [practiceDifficulty, setPracticeDifficulty] = useState<'easy' | 'medium' | 'hard'>(
    'medium',
  );
  const [practiceFormat, setPracticeFormat] = useState<PracticeAssessmentFormat>('standard');
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('');
  const [practiceError, setPracticeError] = useState<string | null>(null);

  // Attempt & Submission state
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [isSubmittingPractice, setIsSubmittingPractice] = useState(false);
  const [submissionReport, setSubmissionReport] = useState<{
    submission: PracticeSubmission;
    feedback: QuestionDiagnosticFeedback[];
    report: PracticeDiagnosticReport;
  } | null>(null);

  // AI Usage Quota state
  const [quotaStatus, setQuotaStatus] = useState<AiUsageQuotaStatus | null>(null);

  // Initial data loading
  useEffect(() => {
    loadPapers();
    loadQuota();
  }, [courseId]);

  const loadQuota = async () => {
    try {
      const q = await fetchAiQuotaStatus();
      setQuotaStatus(q);
    } catch {
      // Ignore quota fetch error
    }
  };

  const loadPapers = async () => {
    try {
      const list = await fetchCourseExaminationPapers(courseId);
      setPapers(list);
      if (list.length > 0 && !selectedPaperId) {
        setSelectedPaperId(list[0]?.id ?? null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedPaperId) {
      loadPaperDetails(selectedPaperId);
    }
  }, [selectedPaperId]);

  const loadPaperDetails = async (id: string) => {
    try {
      const details = await fetchExaminationPaper(id);
      setSelectedPaperDetails(details);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAnalysis = async () => {
    try {
      setLoadingAnalysis(true);
      const data = await fetchCourseExaminationAnalysis(courseId);
      setAnalysisData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const { isLoaded, isSignedIn, getToken } = useAuth();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    if (!isLoaded) {
      setUploadError('Authentication service is initializing. Please wait a moment.');
      return;
    }
    if (!isSignedIn) {
      setUploadError('Authentication token required. Please sign in to upload examination papers.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      const token = await getToken({ skipCache: true }).catch(() => null);
      if (!token) {
        throw new Error('Authentication token required. Please sign in again.');
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadTitle) formData.append('title', uploadTitle);
      if (uploadExamType) formData.append('examType', uploadExamType);

      const result = await uploadExaminationPaper(courseId, formData, token);
      setUploadFile(null);
      setUploadTitle('');
      await loadPapers();
      setSelectedPaperId(result.paper.id);
      await loadQuota();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveQuestionCorrection = async () => {
    if (!editingQuestion) return;
    try {
      setIsSavingQuestion(true);
      const targetTopic = academicNodes.find((n) => n.id === editTopicId);
      const updated = await updateExaminationQuestion(editingQuestion.id, {
        marks: editMarks,
        topicId: editTopicId || undefined,
        topicTitle: targetTopic?.title || undefined,
        verificationStatus: 'verified_by_user',
      });

      if (selectedPaperDetails) {
        setSelectedPaperDetails({
          ...selectedPaperDetails,
          questions: selectedPaperDetails.questions.map((q) => (q.id === updated.id ? updated : q)),
        });
      }
      setEditingQuestion(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleGeneratePractice = async (overrideBlueprintId?: string) => {
    try {
      setIsGeneratingPractice(true);
      setPracticeError(null);
      setSubmissionReport(null);
      setStudentAnswers({});
      const blueprintIdToUse =
        overrideBlueprintId !== undefined ? overrideBlueprintId : selectedBlueprintId;
      if (overrideBlueprintId !== undefined) {
        setSelectedBlueprintId(overrideBlueprintId);
      }
      const result = await generatePracticeAssessment(courseId, {
        format: practiceFormat,
        blueprintId: blueprintIdToUse || undefined,
        targetDifficulty: practiceDifficulty,
        difficulty: practiceDifficulty,
      });
      setPracticeAssessment(result.assessment);
      setPracticeQuestions(result.questions);
      setActiveSubTab('practice');
      await loadQuota();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Practice generation failed';
      setPracticeError(msg);
      alert(msg);
    } finally {
      setIsGeneratingPractice(false);
    }
  };

  const handleSubmitPractice = async () => {
    if (!practiceAssessment) return;
    try {
      setIsSubmittingPractice(true);
      const answersPayload = Object.entries(studentAnswers).map(([questionId, studentAnswer]) => ({
        questionId,
        studentAnswer,
      }));

      const result = await submitPracticeAssessment(practiceAssessment.id, answersPayload);
      setSubmissionReport(result);
      await loadQuota();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Submission evaluation failed');
    } finally {
      setIsSubmittingPractice(false);
    }
  };

  const topicsList = academicNodes.filter((n) => n.type === 'topic');

  return (
    <div className="space-y-6">
      {/* Top Banner & AI Quota Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white tracking-wide">
              Academic Examination Intelligence · {courseCode} ({courseTitle})
            </h2>
          </div>
          <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
            Ingest previous papers, map question distributions to syllabus concepts, and simulate
            calibrated practice exams.
          </p>
        </div>

        {quotaStatus && (
          <div className="flex items-center gap-4 text-xs font-mono bg-[var(--cf-bg-surface-2)] px-3 py-2 rounded-lg border border-[var(--cf-border)]">
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Usage: {quotaStatus.requestsInWindow}/{quotaStatus.windowLimit} reqs (
                {quotaStatus.tier})
              </span>
            </div>
            <div className="h-3 w-px bg-zinc-700" />
            <div className="text-[var(--cf-text-secondary)]">
              Tokens: {(quotaStatus.dailyTokensUsed / 1000).toFixed(1)}k/
              {(quotaStatus.dailyTokenLimit / 1000).toFixed(0)}k
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--cf-border)] pb-2 text-xs font-medium">
        <button
          onClick={() => setActiveSubTab('papers')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab === 'papers'
              ? 'bg-[var(--cf-primary)] text-white'
              : 'text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-2)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Papers & Questions ({papers.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('analysis');
            if (!analysisData) loadAnalysis();
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab === 'analysis'
              ? 'bg-[var(--cf-primary)] text-white'
              : 'text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-2)]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Structural & Topic Analytics</span>
        </button>

        <button
          onClick={() => setActiveSubTab('practice')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab === 'practice'
              ? 'bg-[var(--cf-primary)] text-white'
              : 'text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-2)]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Practice Simulation {practiceAssessment ? '(Active)' : ''}</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 1. PAPERS & QUESTIONS VIEW */}
      {/* ============================================================ */}
      {activeSubTab === 'papers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Upload & Papers List */}
          <div className="space-y-4">
            {/* Upload Paper Box */}
            <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <UploadCloud className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
                <span>Upload Past Exam Paper</span>
              </h3>

              <form onSubmit={handleUpload} className="space-y-3">
                <div>
                  <label className="text-[11px] text-[var(--cf-text-secondary)] block mb-1">
                    Document File (PDF / TXT)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:bg-[var(--cf-bg-surface-2)] file:text-white hover:file:bg-[var(--cf-border)] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-[var(--cf-text-secondary)] block mb-1">
                      Paper Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CAT-1 Fall 2025"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[var(--cf-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--cf-text-secondary)] block mb-1">
                      Exam Type
                    </label>
                    <select
                      value={uploadExamType}
                      onChange={(e) => setUploadExamType(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white focus:outline-none focus:border-[var(--cf-primary)]"
                    >
                      <option value="CAT-1">CAT-1</option>
                      <option value="CAT-2">CAT-2</option>
                      <option value="FAT">Final (FAT)</option>
                      <option value="Midterm">Midterm</option>
                      <option value="Quiz">Quiz</option>
                    </select>
                  </div>
                </div>

                {uploadError && (
                  <p className="text-[11px] text-rose-400 font-mono">{uploadError}</p>
                )}

                <button
                  type="submit"
                  disabled={!uploadFile || isUploading}
                  className="w-full py-2 px-3 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary-hover)] disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  {isUploading ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Parsing Structure...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Extract & Analyze Paper</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* List of uploaded papers */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] px-1">
                Ingested Papers ({papers.length})
              </h4>
              {papers.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--cf-border)] text-center text-xs text-[var(--cf-text-secondary)]">
                  No examination papers uploaded yet. Upload a past paper above to view parsed
                  questions.
                </div>
              ) : (
                papers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPaperId(p.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedPaperId === p.id
                        ? 'border-[var(--cf-primary)] bg-[var(--cf-bg-surface-2)] shadow-sm'
                        : 'border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] hover:bg-[var(--cf-bg-surface-2)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs text-white">{p.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--cf-bg-surface-3)] text-emerald-400 border border-emerald-900/40">
                        {p.examType || 'Exam'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--cf-text-secondary)] font-mono mt-1 flex items-center gap-3">
                      <span>{p.totalMarks ? `${p.totalMarks} Marks` : 'Unspecified Marks'}</span>
                      <span>·</span>
                      <span>{p.durationMinutes ? `${p.durationMinutes}m` : 'Duration N/A'}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Question Inspection & Correction */}
          <div className="lg:col-span-2 space-y-4">
            {selectedPaperDetails ? (
              <div className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--cf-border)]">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {selectedPaperDetails.paper.title}
                    </h3>
                    <p className="text-xs text-[var(--cf-text-secondary)] font-mono">
                      {selectedPaperDetails.questions.length} questions detected · Status:{' '}
                      <span className="text-emerald-400 font-semibold">
                        {selectedPaperDetails.paper.status}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      handleGeneratePractice(selectedPaperDetails.paper.id);
                    }}
                    disabled={isGeneratingPractice}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-600/30 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Practice from this Blueprint</span>
                  </button>
                </div>

                {/* Questions List */}
                <div className="space-y-3">
                  {selectedPaperDetails.questions.map((q) => (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-1)] text-white border border-[var(--cf-border)]">
                            Q{q.questionNumber}
                          </span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-950/40 text-sky-400 border border-sky-800/40">
                            {q.questionFormat}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {q.cognitiveLevel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-amber-300">
                            {q.marks !== undefined ? `${q.marks} Marks` : 'Marks N/A'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingQuestion(q);
                              setEditMarks(q.marks || 0);
                              setEditTopicId(q.topicId || '');
                            }}
                            className="p-1 rounded hover:bg-[var(--cf-bg-surface-1)] text-zinc-400 hover:text-white transition-colors"
                            title="Correct Question / Syllabus Association"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                        {q.questionText}
                      </p>

                      {/* Multiple choice options if present */}
                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-2 pt-1">
                          {q.options.map((opt) => (
                            <div
                              key={opt.label}
                              className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5"
                            >
                              <span className="font-bold text-zinc-300">({opt.label})</span>
                              <span>{opt.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Topic Association Provenance */}
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--cf-text-secondary)]">Mapped Topic:</span>
                          {q.topicTitle ? (
                            <button
                              onClick={() => q.topicId && onSelectTopic?.(q.topicId)}
                              className="text-[var(--cf-primary)] hover:underline font-medium text-left truncate max-w-xs"
                            >
                              {q.topicTitle}
                            </button>
                          ) : (
                            <span className="text-zinc-500 italic">Unmapped / Cross-domain</span>
                          )}
                        </div>

                        {q.topicConfidence !== undefined && q.topicConfidence !== null && (
                          <div className="text-zinc-400 font-mono text-[10px]">
                            Confidence: {(q.topicConfidence * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] text-center text-xs text-[var(--cf-text-secondary)]">
                Select a paper from the list on the left to inspect its question structure.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. STRUCTURAL & TOPIC ANALYTICS VIEW */}
      {/* ============================================================ */}
      {activeSubTab === 'analysis' && (
        <div className="space-y-6">
          {loadingAnalysis ? (
            <div className="p-8 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4 animate-spin" />
              <span>Analyzing examination structures across papers...</span>
            </div>
          ) : analysisData ? (
            <div className="space-y-6">
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
                  <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono uppercase">
                    Analyzed Papers
                  </span>
                  <div className="text-2xl font-bold text-white mt-1">
                    {analysisData.paperCount}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {analysisData.questionCount} Total observed questions
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
                  <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono uppercase">
                    Observed Exam Topics
                  </span>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    {analysisData.topicAnalysis.filter((t) => t.questionCount > 0).length}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Explicitly represented in questions
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]">
                  <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono uppercase">
                    Syllabus Coverage Gaps
                  </span>
                  <div className="text-2xl font-bold text-amber-400 mt-1">
                    {analysisData.topicAnalysis.filter((t) => t.questionCount === 0).length}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Topics with 0 observed past questions
                  </p>
                </div>
              </div>

              {/* Topic Distribution Grid */}
              <div className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                  Observed Topic Representation & Question Counts
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysisData.topicAnalysis
                    .filter((item) => item.questionCount > 0)
                    .map((item) => (
                      <div
                        key={item.topicId}
                        className="p-3 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-medium text-white">{item.topicTitle}</div>
                          <div className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
                            {item.questionCount} Questions · {item.totalMarksObserved} Total Marks
                          </div>
                        </div>
                        <button
                          onClick={() => onSelectTopic?.(item.topicId)}
                          className="text-xs text-[var(--cf-primary)] hover:underline flex items-center gap-1 font-mono"
                        >
                          <span>View</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>

                {analysisData.topicAnalysis.filter((t) => t.questionCount === 0).length > 0 && (
                  <div className="pt-4 border-t border-[var(--cf-border)] space-y-2">
                    <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Unrepresented Syllabus Concepts (Coverage Warning)</span>
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      These topics exist in your course syllabus but have not been tested in any of
                      the uploaded papers. Do not assume they will be excluded from future
                      assessments:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {analysisData.topicAnalysis
                        .filter((t) => t.questionCount === 0)
                        .map((t) => (
                          <button
                            key={t.topicId}
                            onClick={() => onSelectTopic?.(t.topicId)}
                            className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs hover:bg-amber-950/50 transition-colors"
                          >
                            {t.topicTitle}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Cross Paper Comparison if multiple papers exist */}
              {analysisData.crossPaperReport && (
                <div className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                    Cross-Paper Comparison & Structural Consistency
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)]">
                      <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
                        Frequently Repeated Topic Themes
                      </span>
                      <ul className="mt-2 space-y-1">
                        {analysisData.crossPaperReport.repeatedTopicThemes.map((rt) => (
                          <li
                            key={rt.topicTitle}
                            className="text-xs text-zinc-200 flex items-center justify-between"
                          >
                            <span>{rt.topicTitle}</span>
                            <span className="font-mono text-[10px] text-emerald-400">
                              {rt.frequency}x in papers
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)]">
                      <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
                        Structural Shifts & Observations
                      </span>
                      <ul className="mt-2 space-y-1">
                        {analysisData.crossPaperReport.observedFormatShifts.map((shift, i) => (
                          <li key={i} className="text-xs text-zinc-300 flex items-start gap-1.5">
                            <span className="text-[var(--cf-primary)] font-bold">·</span>
                            <span>{shift}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--cf-text-secondary)]">
              No examination analysis available yet. Upload at least one past paper to compute
              analytics.
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. PRACTICE SIMULATION & DIAGNOSTIC EVALUATION */}
      {/* ============================================================ */}
      {activeSubTab === 'practice' && (
        <div className="space-y-6">
          {/* Error Banner */}
          {practiceError && (
            <div className="p-4 rounded-xl border border-red-500/40 bg-red-950/20 text-xs text-red-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-red-400">Practice Generation Error:</span>
                <span>{practiceError}</span>
              </div>
              <button
                onClick={() => setPracticeError(null)}
                className="px-2 py-1 rounded border border-red-500/30 text-red-300 hover:bg-red-500/20 text-[11px] font-mono shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Generation Control Bar */}
          <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] uppercase font-mono text-[var(--cf-text-secondary)] block mb-0.5">
                  Blueprint Format
                </label>
                <select
                  value={practiceFormat}
                  onChange={(e) => setPracticeFormat(e.target.value as PracticeAssessmentFormat)}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white"
                >
                  <option value="standard">Standard Practice Exam (Calibrated)</option>
                  <option value="quick_diagnostic">Quick Diagnostic Drill (15m)</option>
                  <option value="full_simulation">Full Exam Simulation (100 Marks)</option>
                  <option value="targeted_weakness">Targeted Weakness Revision</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-mono text-[var(--cf-text-secondary)] block mb-0.5">
                  Difficulty
                </label>
                <select
                  value={practiceDifficulty}
                  onChange={(e) =>
                    setPracticeDifficulty(e.target.value as 'easy' | 'medium' | 'hard')
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white"
                >
                  <option value="easy">Easy (Foundations)</option>
                  <option value="medium">Medium (Calibrated Exam Level)</option>
                  <option value="hard">Hard (Challenging & Deep)</option>
                </select>
              </div>

              {papers.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase font-mono text-[var(--cf-text-secondary)] block mb-0.5">
                    Blueprint Paper (Optional)
                  </label>
                  <select
                    value={selectedBlueprintId}
                    onChange={(e) => setSelectedBlueprintId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white"
                  >
                    <option value="">None (Course Syllabus Synthesis)</option>
                    {papers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.examType || 'Paper'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={() => handleGeneratePractice()}
              disabled={isGeneratingPractice}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-2"
            >
              {isGeneratingPractice ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Exam...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Practice Exam</span>
                </>
              )}
            </button>
          </div>

          {/* Active Assessment Attempt */}
          {practiceAssessment && (
            <div className="space-y-6">
              {/* Header with Title and Mode */}
              <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{practiceAssessment.title}</h3>
                  <p className="text-xs text-[var(--cf-text-secondary)] font-mono">
                    {practiceAssessment.totalMarks} Marks · {practiceQuestions.length} Questions ·{' '}
                    {submissionReport ? 'Diagnostic Results Ready' : 'Blind Attempt in Progress'}
                  </p>
                </div>

                {!submissionReport && (
                  <button
                    onClick={handleSubmitPractice}
                    disabled={isSubmittingPractice}
                    className="px-4 py-2 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary-hover)] disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {isSubmittingPractice ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Evaluating Diagnostic Rubric...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Submit for Diagnostic Evaluation</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Diagnostic Report Summary (if submitted) */}
              {submissionReport && (
                <div className="p-5 rounded-xl border border-emerald-800/40 bg-emerald-950/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-900/40">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                        Diagnostic Evaluation Complete
                      </span>
                      <div className="text-xl font-bold text-white mt-0.5">
                        Score: {submissionReport.report.totalEarnedMarks} /{' '}
                        {submissionReport.report.totalMaxMarks} Marks (
                        {submissionReport.report.percentage}%)
                      </div>
                    </div>

                    <div className="text-xs text-zinc-300 font-mono">
                      Evaluation Mode: Model-Assisted Diagnostic Rubric
                    </div>
                  </div>

                  {/* Recommendations and Weak Topics */}
                  {submissionReport.report.recommendedFollowUpTopics.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                        <span>Actionable Revision Roadmap & Focus Topics:</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {submissionReport.report.recommendedFollowUpTopics.map((topic, i) => (
                          <div
                            key={topic.topicId}
                            className="p-3 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-zinc-200 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span>
                              <button
                                onClick={() => onSelectTopic?.(topic.topicId)}
                                className="text-white hover:text-[var(--cf-primary)] font-medium text-left"
                              >
                                {topic.topicTitle}
                              </button>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                              {topic.recommendedMinutes} mins · {topic.priority} priority
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Questions List with Inputs / Feedback */}
              <div className="space-y-4">
                {practiceQuestions.map((q, index) => {
                  const feedbackItem = submissionReport?.feedback.find(
                    (f) => f.questionId === q.id,
                  );

                  return (
                    <div
                      key={q.id}
                      className="p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--cf-bg-surface-2)] text-white border border-[var(--cf-border)]">
                            Question {index + 1}
                          </span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {q.questionFormat}
                          </span>
                          <span className="text-xs font-mono font-semibold text-amber-300">
                            {q.marks} Marks
                          </span>
                        </div>

                        {feedbackItem && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                feedbackItem.earnedMarks === feedbackItem.maxMarks
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {feedbackItem.earnedMarks} / {feedbackItem.maxMarks} Marks
                            </span>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-white leading-relaxed font-sans font-medium">
                        {q.questionText}
                      </p>

                      {/* Options if MCQ */}
                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {q.options.map((opt) => (
                            <label
                              key={opt.label}
                              className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                                studentAnswers[q.id] === opt.label
                                  ? 'border-[var(--cf-primary)] bg-[var(--cf-primary)]/10 text-white'
                                  : 'border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-zinc-300 hover:text-white'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q_${q.id}`}
                                value={opt.label}
                                disabled={!!submissionReport}
                                checked={studentAnswers[q.id] === opt.label}
                                onChange={(e) =>
                                  setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })
                                }
                                className="sr-only"
                              />
                              <span className="font-mono font-bold">({opt.label})</span>
                              <span>{opt.text}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Text Input if Open-Ended / Numerical / Coding */}
                      {(!q.options || q.options.length === 0) && (
                        <div>
                          <label className="text-[11px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                            Your Working / Response:
                          </label>
                          <textarea
                            rows={3}
                            disabled={!!submissionReport}
                            placeholder="Type your calculation, derivation, or answer explanation..."
                            value={studentAnswers[q.id] || ''}
                            onChange={(e) =>
                              setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[var(--cf-primary)] font-mono disabled:opacity-80"
                          />
                        </div>
                      )}

                      {/* Diagnostic Evaluation Feedback (After Submission) */}
                      {feedbackItem && (
                        <div className="p-3.5 rounded-lg border border-zinc-800 bg-[var(--cf-bg-surface-2)] space-y-2 mt-3">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-zinc-400">Diagnostic Feedback:</span>
                            {feedbackItem.errorCategory && (
                              <span className="text-amber-400 uppercase text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40">
                                {feedbackItem.errorCategory.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed">
                            {feedbackItem.feedbackSummary}
                          </p>
                          {feedbackItem.recommendedReviewAction && (
                            <p className="text-[11px] text-amber-300 font-mono">
                              Recommended: {feedbackItem.recommendedReviewAction}
                            </p>
                          )}

                          {q.workedSolution && (
                            <div className="pt-2 border-t border-zinc-800 text-xs">
                              <span className="font-semibold text-emerald-400 font-mono block mb-1">
                                Worked Solution & Benchmark Answer:
                              </span>
                              <p className="text-zinc-300 font-sans leading-relaxed whitespace-pre-wrap">
                                {q.workedSolution}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Question Correction Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full p-5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--cf-border)]">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Correct Question #{editingQuestion.questionNumber}
              </h3>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300">{editingQuestion.questionText}</p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                  Marks Allocated
                </label>
                <input
                  type="number"
                  value={editMarks}
                  onChange={(e) => setEditMarks(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-[var(--cf-text-secondary)] block mb-1">
                  Target Syllabus Concept
                </label>
                <select
                  value={editTopicId}
                  onChange={(e) => setEditTopicId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)] text-xs text-white"
                >
                  <option value="">-- Select Syllabus Topic --</option>
                  {topicsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--cf-border)]">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuestionCorrection}
                disabled={isSavingQuestion}
                className="px-3 py-1.5 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary-hover)] text-xs font-semibold text-white"
              >
                {isSavingQuestion ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
