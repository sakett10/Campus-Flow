import React from 'react';
import type { ResourceProcessingStatus } from '@campusflow/types';

interface StatusBadgeProps {
  status: ResourceProcessingStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const configs: Record<
    ResourceProcessingStatus,
    { label: string; bg: string; text: string; dot: string; pulse?: boolean }
  > = {
    created: {
      label: 'Created',
      bg: 'bg-slate-800/60',
      text: 'text-slate-300',
      dot: 'bg-slate-400',
    },
    upload_pending: {
      label: 'Upload Pending',
      bg: 'bg-amber-950/40',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
    },
    uploaded: {
      label: 'Stored',
      bg: 'bg-blue-950/40',
      text: 'text-blue-300',
      dot: 'bg-blue-400',
    },
    queued: {
      label: 'Queued',
      bg: 'bg-indigo-950/40',
      text: 'text-indigo-300',
      dot: 'bg-indigo-400',
    },
    processing: {
      label: 'Processing',
      bg: 'bg-purple-950/50',
      text: 'text-purple-300',
      dot: 'bg-purple-400',
      pulse: true,
    },
    ready: {
      label: 'Searchable',
      bg: 'bg-emerald-950/40',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
    },
    failed: {
      label: 'Failed',
      bg: 'bg-rose-950/40',
      text: 'text-rose-300',
      dot: 'bg-rose-400',
    },
  };

  const config = configs[status] || configs.created;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-white/5 ${config.bg} ${config.text} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.dot} ${config.pulse ? 'animate-pulse' : ''}`}
      />
      {config.label}
    </span>
  );
}
