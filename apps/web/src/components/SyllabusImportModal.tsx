'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import { extractSyllabus, createCourseFromSyllabus } from '@/lib/api';
import type { SyllabusExtractedCourse } from '@campusflow/types';

interface SyllabusImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCourseCreated?: (courseId: string) => void;
}

export function SyllabusImportModal({
  isOpen,
  onClose,
  onCourseCreated,
}: SyllabusImportModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [uploadMode, setUploadMode] = useState<'pdf' | 'text'>('pdf');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Extracted and editable course data
  const [extractedData, setExtractedData] = useState<SyllabusExtractedCourse | null>(null);
  const [resourceId, setResourceId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile.type === 'application/pdf' ||
        droppedFile.name.endsWith('.pdf') ||
        droppedFile.type.includes('text')
      ) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please drop a valid PDF syllabus document.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const startExtraction = async () => {
    try {
      setError(null);

      if (!isLoaded) {
        setError('Authentication is still loading. Please wait a moment.');
        return;
      }
      if (!isSignedIn) {
        setError(
          'Your session is invalid or has expired. Please sign in to import a course syllabus.',
        );
        return;
      }

      setStep('processing');
      setProcessingStatus('Acquiring secure session and validating syllabus...');

      const token = await getToken({ skipCache: true }).catch(() => null);
      if (!token) {
        setError('Unable to obtain a valid session token. Please sign in again.');
        setStep('upload');
        return;
      }

      let res;
      if (uploadMode === 'pdf') {
        if (!file) {
          setError('Please select a syllabus PDF file.');
          setStep('upload');
          return;
        }
        setProcessingStatus('Extracting pages and detecting course structure...');
        res = await extractSyllabus({ file }, token);
      } else {
        if (!rawText.trim()) {
          setError('Please paste syllabus text.');
          setStep('upload');
          return;
        }
        setProcessingStatus('Parsing syllabus modules and learning objectives...');
        res = await extractSyllabus({ text: rawText }, token);
      }

      setExtractedData(res.extractedCourse);
      setResourceId(res.resourceId);
      setWarnings(res.warnings || []);
      setStep('review');
    } catch (err: unknown) {
      console.error(err);
      let msg = err instanceof Error ? err.message : 'Failed to extract syllabus.';
      if (msg.includes('Invalid or corrupt') || msg.includes('Invalid PDF')) {
        msg =
          'Invalid or corrupted PDF file. Please ensure the document is a readable, uncorrupted PDF.';
      } else if (msg.includes('password') || msg.includes('Password-protected')) {
        msg =
          'The uploaded PDF is password-protected. Please remove the password before uploading.';
      } else if (msg.includes('exceeds maximum allowed limit') || msg.includes('page count')) {
        msg =
          'The PDF exceeds the maximum supported page limit (100 pages). Please upload a syllabus excerpt.';
      } else if (msg.includes('File size')) {
        msg = 'The file size exceeds the 50 MB limit. Please compress or optimize the PDF.';
      } else if (msg.includes('Hostile file signature') || msg.includes('Executable')) {
        msg =
          'Executable files are strictly rejected for security reasons. Please upload a PDF syllabus.';
      } else if (
        msg.includes('Unsupported MIME type') ||
        msg.includes('Unsupported document format')
      ) {
        msg = 'Unsupported file format. Please upload a PDF document (.pdf) or plain text.';
      }
      setError(msg);
      setStep('upload');
    }
  };

  const handleConfirmAndSave = async () => {
    if (!extractedData) return;
    if (!extractedData.code.trim() || !extractedData.title.trim()) {
      setError('Course code and title are required.');
      return;
    }

    if (!isLoaded) {
      setError('Authentication is still loading. Please wait a moment.');
      return;
    }
    if (!isSignedIn) {
      setError('Your session has expired. Please sign in again to save this course.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Force fresh session token immediately prior to course creation
      const token = await getToken({ skipCache: true }).catch(() => null);
      if (!token) {
        setError('Your session is invalid or has expired. Please sign in again.');
        return;
      }

      const result = await createCourseFromSyllabus(
        extractedData,
        resourceId,
        extractedData.term || 'Fall 2026',
        token,
      );

      onClose();
      if (onCourseCreated) {
        onCourseCreated(result.course.id);
      } else {
        router.push(`/courses/${result.course.id}`);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to persist course structure.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper mutation functions for review step
  const updateModuleTitle = (modIdx: number, newTitle: string) => {
    if (!extractedData) return;
    const modules = [...extractedData.modules];
    if (modules[modIdx]) {
      modules[modIdx] = { ...modules[modIdx], title: newTitle };
      setExtractedData({ ...extractedData, modules });
    }
  };

  const updateTopicTitle = (modIdx: number, topicIdx: number, newTitle: string) => {
    if (!extractedData) return;
    const modules = [...extractedData.modules];
    const mod = modules[modIdx];
    if (mod && mod.topics[topicIdx]) {
      const topics = [...mod.topics];
      topics[topicIdx] = { ...topics[topicIdx]!, title: newTitle };
      modules[modIdx] = { ...mod, topics };
      setExtractedData({ ...extractedData, modules });
    }
  };

  const updateTopicDuration = (modIdx: number, topicIdx: number, minutes: number) => {
    if (!extractedData) return;
    const modules = [...extractedData.modules];
    const mod = modules[modIdx];
    if (mod && mod.topics[topicIdx]) {
      const topics = [...mod.topics];
      topics[topicIdx] = { ...topics[topicIdx]!, estimatedMinutes: minutes };
      modules[modIdx] = { ...mod, topics };
      setExtractedData({ ...extractedData, modules });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-[var(--cf-primary)]/10 text-[var(--cf-primary)] border border-[var(--cf-primary)]/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                Import Syllabus to Learning Universe
              </h2>
              <p className="text-[11px] text-[var(--cf-text-secondary)]">
                Transforms your syllabus into structured modules, topics, resources & study plan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-border)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-200 text-xs space-y-1">
              {warnings.map((w, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-[var(--cf-border)] pb-3">
                <button
                  type="button"
                  onClick={() => setUploadMode('pdf')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    uploadMode === 'pdf'
                      ? 'bg-[var(--cf-primary)] text-white'
                      : 'text-[var(--cf-text-secondary)] hover:text-white'
                  }`}
                >
                  Upload PDF Syllabus
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('text')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    uploadMode === 'text'
                      ? 'bg-[var(--cf-primary)] text-white'
                      : 'text-[var(--cf-text-secondary)] hover:text-white'
                  }`}
                >
                  Paste Plaintext / Outline
                </button>
              </div>

              {uploadMode === 'pdf' ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-10 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center space-y-3 ${
                    isDragging
                      ? 'border-[var(--cf-primary)] bg-[var(--cf-primary)]/10 scale-[0.99]'
                      : 'border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/30 hover:bg-[var(--cf-bg-surface-2)]/60'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="p-4 rounded-2xl bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-[var(--cf-primary)] shadow-inner">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {file ? file.name : 'Drop your course syllabus PDF here'}
                    </p>
                    <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                      {file
                        ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace`
                        : 'Supports institutional university syllabi up to 50 MB'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--cf-text-secondary)]">
                    Paste syllabus text, course outline, or module list
                  </label>
                  <textarea
                    rows={10}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Course Code: CSE3001&#10;Course Title: Database Systems&#10;Module 1: Relational Model (6 Hours)&#10;- Introduction to Relational Databases&#10;- Relational Algebra..."
                    className="w-full p-4 rounded-xl bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] text-xs text-white placeholder-[var(--cf-text-secondary)] focus:outline-none focus:border-[var(--cf-primary)] font-mono resize-none"
                  />
                </div>
              )}

              <div className="p-4 rounded-xl bg-[var(--cf-bg-surface-2)]/40 border border-[var(--cf-border)] space-y-2 text-xs text-[var(--cf-text-secondary)]">
                <span className="font-semibold text-white">What CampusFlow extracts:</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>✓ Course code, title & semester</div>
                  <div>✓ Modules & unit teaching hours</div>
                  <div>✓ Topics & estimated study duration</div>
                  <div>✓ Page citations in source PDF</div>
                  <div>✓ Prescribed textbooks & authors</div>
                  <div>✓ Examination dates & evaluation weights</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Processing Stepper */}
          {step === 'processing' && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 text-[var(--cf-primary)] animate-spin mx-auto" />
              <div>
                <h3 className="text-sm font-medium text-white mb-1">Parsing Academic Syllabus</h3>
                <p className="text-xs text-[var(--cf-text-secondary)] font-mono">
                  {processingStatus}
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Review & Edit Extracted Hierarchy */}
          {step === 'review' && extractedData && (
            <div className="space-y-6">
              {/* Top summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)]">
                  <label className="text-[10px] font-mono uppercase text-[var(--cf-text-secondary)] block mb-1">
                    Course Code
                  </label>
                  <input
                    type="text"
                    value={extractedData.code}
                    onChange={(e) =>
                      setExtractedData({ ...extractedData, code: e.target.value.toUpperCase() })
                    }
                    className="w-full bg-transparent font-mono font-bold text-sm text-white focus:outline-none border-b border-transparent focus:border-[var(--cf-primary)]"
                  />
                </div>
                <div className="p-3.5 rounded-xl bg-[var(--cf-bg-surface-2)] border border-[var(--cf-border)] md:col-span-2">
                  <label className="text-[10px] font-mono uppercase text-[var(--cf-text-secondary)] block mb-1">
                    Course Title
                  </label>
                  <input
                    type="text"
                    value={extractedData.title}
                    onChange={(e) => setExtractedData({ ...extractedData, title: e.target.value })}
                    className="w-full bg-transparent font-medium text-sm text-white focus:outline-none border-b border-transparent focus:border-[var(--cf-primary)]"
                  />
                </div>
              </div>

              {/* Modules & Topics Hierarchy */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)] font-mono flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[var(--cf-primary)]" />
                    Detected Modules ({extractedData.modules.length})
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    {Math.round(extractedData.confidence * 100)}% Extraction Confidence
                  </span>
                </div>

                <div className="space-y-3">
                  {extractedData.modules.map((mod, modIdx) => (
                    <div
                      key={modIdx}
                      className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/40 overflow-hidden"
                    >
                      <div className="p-3 bg-[var(--cf-bg-surface-2)]/80 border-b border-[var(--cf-border)] flex items-center justify-between">
                        <input
                          type="text"
                          value={mod.title}
                          onChange={(e) => updateModuleTitle(modIdx, e.target.value)}
                          className="bg-transparent text-xs font-semibold text-white focus:outline-none border-b border-transparent focus:border-[var(--cf-primary)] flex-1 mr-4"
                        />
                        <span className="text-[10px] font-mono text-[var(--cf-text-secondary)] shrink-0">
                          {mod.teachingHours ? `${mod.teachingHours} hrs · ` : ''}
                          {mod.topics.length} topics
                        </span>
                      </div>

                      <div className="p-3 divide-y divide-[var(--cf-border)]/50">
                        {mod.topics.map((t, tIdx) => (
                          <div
                            key={tIdx}
                            className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs"
                          >
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={t.title}
                                onChange={(e) => updateTopicTitle(modIdx, tIdx, e.target.value)}
                                className="w-full bg-transparent text-xs text-white/90 focus:outline-none border-b border-transparent focus:border-[var(--cf-primary)]"
                              />
                              {t.subtopics && t.subtopics.length > 0 && (
                                <p className="text-[10px] text-[var(--cf-text-secondary)] truncate mt-0.5">
                                  Subtopics: {t.subtopics.join(', ')}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {t.pageReferences && (
                                <span className="px-2 py-0.5 rounded bg-[var(--cf-bg-surface-1)] text-[10px] text-[var(--cf-primary)] font-mono border border-[var(--cf-border)]">
                                  {t.pageReferences}
                                </span>
                              )}
                              <div className="flex items-center gap-1 text-[11px] text-[var(--cf-text-secondary)] font-mono">
                                <Clock className="w-3 h-3" />
                                <input
                                  type="number"
                                  min={15}
                                  max={300}
                                  step={15}
                                  value={t.estimatedMinutes || 60}
                                  onChange={(e) =>
                                    updateTopicDuration(
                                      modIdx,
                                      tIdx,
                                      parseInt(e.target.value, 10) || 60,
                                    )
                                  }
                                  className="w-12 bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] rounded px-1 text-center text-[10px] text-white focus:outline-none"
                                />
                                <span>m</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Textbooks and Assessments preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {Boolean(
                  extractedData.prescribedTextbooks && extractedData.prescribedTextbooks.length > 0,
                ) && (
                  <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/30 space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--cf-text-secondary)] block">
                      Prescribed Textbooks ({extractedData.prescribedTextbooks?.length || 0})
                    </span>
                    <ul className="space-y-1.5 text-xs text-white/90">
                      {extractedData.prescribedTextbooks?.map((b, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-[var(--cf-primary)]">•</span>
                          <div>
                            <span className="font-medium">{b.title}</span>
                            {b.author && (
                              <span className="text-[var(--cf-text-secondary)] text-[11px]">
                                {' '}
                                — {b.author}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Boolean(extractedData.assessments && extractedData.assessments.length > 0) && (
                  <div className="p-4 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/30 space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--cf-text-secondary)] block">
                      Assessments Detected ({extractedData.assessments.length})
                    </span>
                    <ul className="space-y-1.5 text-xs text-white/90">
                      {extractedData.assessments.map((a, idx) => (
                        <li key={idx} className="flex items-center justify-between text-[11px]">
                          <span>{a.title}</span>
                          <span className="font-mono text-[var(--cf-text-secondary)]">
                            {a.weightage} {a.totalMarks ? `(${a.totalMarks} marks)` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/60 flex items-center justify-between">
          {step === 'review' ? (
            <button
              type="button"
              onClick={() => setStep('upload')}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg text-xs text-[var(--cf-text-secondary)] hover:text-white transition-colors"
            >
              Back to Upload
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs text-[var(--cf-text-secondary)] hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}

          {step === 'upload' && (
            <button
              type="button"
              onClick={startExtraction}
              disabled={uploadMode === 'pdf' ? !file : !rawText.trim()}
              className="px-5 py-2 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Analyze Syllabus</span>
            </button>
          )}

          {step === 'review' && (
            <button
              type="button"
              onClick={handleConfirmAndSave}
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-[var(--cf-primary)] hover:bg-[var(--cf-primary)]/90 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating Universe...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm & Generate Course</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
