'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, AlertCircle, Loader2 } from 'lucide-react';
import type { ResourceType } from '@campusflow/types';

interface UploadDropzoneProps {
  courseId?: string;
  onUploadSuccess?: () => void;
}

interface DuplicateState {
  file: File;
  title: string;
  type: ResourceType;
  existingResource: {
    id: string;
    title: string;
    createdAt: string;
  };
}

export function UploadDropzone({ courseId, onUploadSuccess }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateState | null>(null);
  const [selectedType, setSelectedType] = useState<ResourceType>('lecture_notes');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelected(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelected(files[0]);
    }
  };

  const handleFileSelected = async (
    file: File,
    duplicateAction: 'reject' | 'replace' | 'keep_both' = 'reject',
  ) => {
    setError(null);
    setDuplicateInfo(null);

    // 1. Client-side format & size check
    const validExtensions = ['.pdf', '.txt', '.md', '.markdown'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setError('Unsupported file format. MVP supports PDF, Plain Text (.txt), and Markdown (.md).');
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 50 MB limit.`);
      return;
    }

    try {
      setIsUploading(true);
      setUploadStatus('Uploading document...');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name);
      formData.append('type', selectedType);
      if (courseId) formData.append('courseId', courseId);
      formData.append('duplicateAction', duplicateAction);

      const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api/v1';

      const res = await fetch(`${API_BASE}/resources/direct`, {
        method: 'POST',
        headers: {
          'x-test-user-id': '11111111-1111-4111-a111-111111111111',
        },
        body: formData,
      });

      if (res.status === 409) {
        const conflictData = await res.json();
        setDuplicateInfo({
          file,
          title: file.name,
          type: selectedType,
          existingResource: conflictData.existingResource,
        });
        setIsUploading(false);
        setUploadStatus(null);
        return;
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(errorJson.detail || 'Upload failed');
      }

      setUploadStatus('Document stored. Ingestion queued.');
      setTimeout(() => {
        setIsUploading(false);
        setUploadStatus(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (onUploadSuccess) onUploadSuccess();
      }, 1200);
    } catch (err) {
      setIsUploading(false);
      setUploadStatus(null);
      setError((err as Error).message);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Duplicate Dialog / Banner */}
      {duplicateInfo ? (
        <div className="p-4 rounded-lg bg-surface-2 border border-warning/30 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Exact Duplicate Detected</h4>
              <p className="text-xs text-text-secondary mt-1">
                An identical document ({duplicateInfo.existingResource.title}) already exists in
                your academic library.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
            <button
              onClick={() => setDuplicateInfo(null)}
              className="px-3 py-1.5 rounded text-xs font-medium bg-surface-1 border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              Keep Existing (Cancel)
            </button>
            <button
              onClick={() => handleFileSelected(duplicateInfo.file, 'replace')}
              className="px-3 py-1.5 rounded text-xs font-medium bg-warning/20 border border-warning/40 text-warning hover:bg-warning/30 transition-colors"
            >
              Replace Existing
            </button>
            <button
              onClick={() => handleFileSelected(duplicateInfo.file, 'keep_both')}
              className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Keep Both Documents
            </button>
          </div>
        </div>
      ) : null}

      {/* Dropzone Card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-border/80 bg-surface-1/40 hover:bg-surface-1 hover:border-border'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={isUploading}
        />

        <div className="flex flex-col items-center text-center space-y-2.5">
          <div className="w-12 h-12 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text-secondary">
            {isUploading ? (
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-text-primary">
              {isUploading
                ? uploadStatus
                : 'Click to upload or drag & drop syllabus, notes, or past papers'}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Supports PDF, Plain Text (.txt), and Markdown (.md) up to 50 MB
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
            <label className="text-xs text-text-muted">Document Type:</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ResourceType)}
              className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
            >
              <option value="syllabus">Syllabus</option>
              <option value="lecture_notes">Lecture Notes</option>
              <option value="question_bank">Question Bank / Exam Paper</option>
              <option value="reference_material">Reference Material</option>
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="p-3 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
