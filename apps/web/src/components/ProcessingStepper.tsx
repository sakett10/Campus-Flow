import React from 'react';
import type { ResourceProcessingStatus } from '@campusflow/types';
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';

interface ProcessingStepperProps {
  status: ResourceProcessingStatus;
  pageCount?: number | null;
  errorMessage?: string | null;
}

export function ProcessingStepper({ status, pageCount, errorMessage }: ProcessingStepperProps) {
  // Milestone progression: Uploading -> Stored -> Processing -> Extracting -> Organizing -> Searchable
  const steps = [
    { key: 'uploading', label: 'Uploading' },
    { key: 'stored', label: 'Stored' },
    { key: 'processing', label: 'Processing' },
    { key: 'extracting', label: pageCount ? `Extracting (${pageCount} pgs)` : 'Extracting' },
    { key: 'organizing', label: 'Organizing' },
    { key: 'searchable', label: 'Searchable' },
  ];

  // Map backend status to active milestone index (0 to 5)
  let activeIndex = 0;
  const isFailed = status === 'failed';

  switch (status) {
    case 'created':
    case 'upload_pending':
      activeIndex = 0; // Uploading
      break;
    case 'uploaded':
      activeIndex = 1; // Stored
      break;
    case 'queued':
      activeIndex = 2; // Processing (queued)
      break;
    case 'processing':
      activeIndex = 3; // Extracting / Organizing
      break;
    case 'ready':
      activeIndex = 5; // Searchable
      break;
    case 'failed':
      activeIndex = 2; // Failed during processing
      break;
  }

  return (
    <div className="w-full bg-surface-1 border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-semibold tracking-wider uppercase text-text-muted">
          Ingestion Pipeline
        </h4>
        <span className="text-xs text-text-secondary font-mono">
          {status === 'ready'
            ? 'Grounding Complete'
            : isFailed
              ? 'Processing Halted'
              : 'Worker Active'}
        </span>
      </div>

      {isFailed ? (
        <div className="p-3 mb-4 rounded-md bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Ingestion Failed</span>
            {errorMessage || 'Document could not be processed. Original file remains downloadable.'}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {steps.map((step, idx) => {
          const isDone = !isFailed && idx < activeIndex;
          const isCurrent = !isFailed && (idx === activeIndex || (status === 'ready' && idx === 5));

          return (
            <div
              key={step.key}
              className={`flex flex-col gap-1 p-2.5 rounded-md border text-xs transition-all ${
                isCurrent
                  ? 'bg-accent/10 border-accent/40 text-text-primary'
                  : isDone
                    ? 'bg-surface-2/60 border-border text-text-secondary'
                    : isFailed && idx === activeIndex
                      ? 'bg-rose-950/30 border-rose-700/40 text-rose-300'
                      : 'bg-surface-2/20 border-white/5 text-text-muted'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                ) : isCurrent ? (
                  status === 'ready' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
                  )
                ) : isFailed && idx === activeIndex ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-text-muted/60 shrink-0" />
                )}
                <span className="font-medium truncate">{step.label}</span>
              </div>
              <span className="text-[10px] text-text-muted font-mono pl-5">
                {isDone
                  ? 'Passed'
                  : isCurrent
                    ? status === 'ready'
                      ? 'Verified'
                      : 'In Progress'
                    : isFailed && idx === activeIndex
                      ? 'Failed'
                      : 'Pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
