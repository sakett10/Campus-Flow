'use client';

import React, { useState, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Filter,
  List,
  Network,
  ChevronRight,
} from 'lucide-react';
import type { AcademicNodeWithResources, StudyStateValue } from '@campusflow/types';

interface InteractiveKnowledgeMapProps {
  courseId: string;
  courseTitle: string;
  nodes: AcademicNodeWithResources[];
  onSelectTopic: (topic: AcademicNodeWithResources) => void;
}

export function InteractiveKnowledgeMap({
  courseId: _courseId,
  courseTitle: _courseTitle,
  nodes,
  onSelectTopic,
}: InteractiveKnowledgeMapProps) {
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<StudyStateValue | 'all'>('all');

  // Zoom & Pan transforms for SVG Graph
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Separate modules and topics
  const modules = useMemo(
    () => nodes.filter((n) => n.type === 'module').sort((a, b) => a.orderIndex - b.orderIndex),
    [nodes],
  );

  const topicsByModule = useMemo(() => {
    const map = new Map<string, AcademicNodeWithResources[]>();
    for (const mod of modules) {
      const childTopics = nodes
        .filter((n) => n.type === 'topic' && n.parentId === mod.id)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      map.set(mod.id, childTopics);
    }
    // Also include orphans if any
    const orphans = nodes.filter((n) => n.type === 'topic' && !n.parentId);
    if (orphans.length > 0) {
      map.set('orphan', orphans);
    }
    return map;
  }, [nodes, modules]);

  // Filtered topics for search & state filters
  const matchesSearch = (title: string) => {
    if (!searchQuery.trim()) return true;
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const matchesFilter = (state?: StudyStateValue | null) => {
    if (filterState === 'all') return true;
    return (state || 'not_started') === filterState;
  };

  // Graph Layout Calculations
  const graphLayout = useMemo(() => {
    const layoutNodes: Array<{
      id: string;
      title: string;
      type: 'module' | 'topic';
      x: number;
      y: number;
      width: number;
      height: number;
      rawNode?: AcademicNodeWithResources;
      state?: StudyStateValue;
      duration?: number;
    }> = [];

    const layoutEdges: Array<{
      id: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }> = [];

    let currentY = 60;
    const moduleX = 80;
    const topicX = 400;

    for (const mod of modules) {
      const childTopics = topicsByModule.get(mod.id) || [];
      const modHeight = 70;
      const topicHeight = 52;
      const topicGap = 16;
      const totalTopicsHeight = Math.max(
        modHeight,
        childTopics.length * (topicHeight + topicGap) - topicGap,
      );

      const modY = currentY + totalTopicsHeight / 2 - modHeight / 2;

      layoutNodes.push({
        id: mod.id,
        title: mod.title,
        type: 'module',
        x: moduleX,
        y: modY,
        width: 240,
        height: modHeight,
      });

      let topicCurrentY = currentY;
      for (const topic of childTopics) {
        layoutNodes.push({
          id: topic.id,
          title: topic.title,
          type: 'topic',
          x: topicX,
          y: topicCurrentY,
          width: 260,
          height: topicHeight,
          rawNode: topic,
          state: topic.studyState?.state || 'not_started',
          duration: topic.estimatedMinutes || 60,
        });

        // Edge from module to topic
        layoutEdges.push({
          id: `${mod.id}->${topic.id}`,
          fromX: moduleX + 240,
          fromY: modY + modHeight / 2,
          toX: topicX,
          toY: topicCurrentY + topicHeight / 2,
        });

        topicCurrentY += topicHeight + topicGap;
      }

      currentY += Math.max(totalTopicsHeight + 50, 120);
    }

    return { layoutNodes, layoutEdges, totalHeight: Math.max(currentY + 100, 600) };
  }, [modules, topicsByModule]);

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const getStateColor = (state?: StudyStateValue) => {
    switch (state) {
      case 'reviewed':
        return {
          bg: 'bg-emerald-950/50',
          border: 'border-emerald-500/60',
          text: 'text-emerald-300',
          indicator: 'bg-emerald-400',
        };
      case 'learning':
        return {
          bg: 'bg-sky-950/50',
          border: 'border-sky-500/60',
          text: 'text-sky-300',
          indicator: 'bg-sky-400',
        };
      case 'needs_review':
        return {
          bg: 'bg-amber-950/50',
          border: 'border-amber-500/60',
          text: 'text-amber-300',
          indicator: 'bg-amber-400',
        };
      case 'not_started':
      default:
        return {
          bg: 'bg-[var(--cf-bg-surface-2)]/60',
          border: 'border-[var(--cf-border)]',
          text: 'text-[var(--cf-text-secondary)]',
          indicator: 'bg-zinc-600',
        };
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)] shadow-xl overflow-hidden flex flex-col">
      {/* Top Controls Toolbar */}
      <div className="p-4 border-b border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/40 flex flex-wrap items-center justify-between gap-3">
        {/* Left: View Mode Toggle & Search */}
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 rounded-xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'graph'
                  ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                  : 'text-[var(--cf-text-secondary)] hover:text-white'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Interactive Graph</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'list'
                  ? 'bg-[var(--cf-primary)] text-white shadow-sm'
                  : 'text-[var(--cf-text-secondary)] hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Hierarchical List</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--cf-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] text-xs text-white placeholder-[var(--cf-text-secondary)] focus:outline-none focus:border-[var(--cf-primary)] w-44 sm:w-56"
            />
          </div>
        </div>

        {/* Right: State Filter & Zoom Controls */}
        <div className="flex items-center gap-3">
          {/* Study State Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-[var(--cf-text-secondary)]" />
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value as StudyStateValue | 'all')}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)] text-xs text-white focus:outline-none"
            >
              <option value="all">All States</option>
              <option value="not_started">Not Started</option>
              <option value="learning">Learning</option>
              <option value="needs_review">Needs Review</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>

          {/* Zoom controls (only in graph mode) */}
          {viewMode === 'graph' && (
            <div className="flex items-center p-1 rounded-xl bg-[var(--cf-bg-surface-1)] border border-[var(--cf-border)]">
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.15, 2.0))}
                className="p-1.5 rounded-lg text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-2)] transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.15, 0.5))}
                className="p-1.5 rounded-lg text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-2)] transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 40, y: 40 });
                }}
                className="p-1.5 rounded-lg text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-2)] transition-colors"
                title="Reset View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'graph' ? (
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="relative w-full h-[620px] overflow-hidden bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] cursor-grab active:cursor-grabbing select-none"
        >
          {/* SVG Canvas for Edges and Nodes */}
          <svg
            className="w-full h-full"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            {/* Draw smooth bezier connecting curves */}
            {graphLayout.layoutEdges.map((edge) => {
              const dx = edge.toX - edge.fromX;
              const pathD = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX + dx / 2} ${edge.fromY}, ${edge.toX - dx / 2} ${edge.toY}, ${edge.toX} ${edge.toY}`;
              return (
                <path
                  key={edge.id}
                  d={pathD}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Draw Nodes */}
            {graphLayout.layoutNodes.map((node) => {
              const isMatch = matchesSearch(node.title);
              const passesFilter =
                node.type === 'module' || matchesFilter(node.rawNode?.studyState?.state);
              const isDimmed = !isMatch || !passesFilter;

              if (node.type === 'module') {
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    opacity={isDimmed ? 0.3 : 1}
                  >
                    <rect
                      width={node.width}
                      height={node.height}
                      rx="14"
                      className="fill-[var(--cf-bg-surface-2)] stroke-[var(--cf-border)] stroke-1"
                    />
                    <text
                      x="16"
                      y="28"
                      className="fill-[var(--cf-primary)] text-[10px] font-mono font-bold uppercase tracking-wider"
                    >
                      Module
                    </text>
                    <text x="16" y="48" className="fill-white text-xs font-semibold">
                      {node.title.length > 28 ? `${node.title.slice(0, 28)}...` : node.title}
                    </text>
                  </g>
                );
              }

              // Topic Node
              const colors = getStateColor(node.state);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  opacity={isDimmed ? 0.3 : 1}
                  className="cursor-pointer group"
                  onClick={() => node.rawNode && onSelectTopic(node.rawNode)}
                >
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="12"
                    className="fill-[var(--cf-bg-surface-1)] stroke-[var(--cf-border)] stroke-1 group-hover:stroke-[var(--cf-primary)] transition-colors"
                  />
                  {/* Mastery Indicator Pill */}
                  <circle cx="20" cy="26" r="4" className={colors.indicator} />
                  <text
                    x="34"
                    y="24"
                    className="fill-white text-xs font-medium group-hover:fill-[var(--cf-primary)] transition-colors"
                  >
                    {node.title.length > 28 ? `${node.title.slice(0, 28)}...` : node.title}
                  </text>
                  <text
                    x="34"
                    y="40"
                    className="fill-[var(--cf-text-secondary)] text-[10px] font-mono"
                  >
                    ~{node.duration}m · {node.state?.replace('_', ' ')}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating Instructions Banner */}
          <div className="absolute bottom-4 left-4 pointer-events-none p-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-[var(--cf-border)] text-[11px] text-[var(--cf-text-secondary)] font-mono">
            Drag to pan · Scroll or buttons to zoom · Click any topic to open workspace
          </div>
        </div>
      ) : (
        /* Accessible Hierarchical List View */
        <div className="p-6 space-y-6 max-h-[620px] overflow-y-auto">
          {modules.map((mod) => {
            const childTopics = (topicsByModule.get(mod.id) || []).filter(
              (t) => matchesSearch(t.title) && matchesFilter(t.studyState?.state),
            );

            if (childTopics.length === 0 && searchQuery) return null;

            return (
              <div
                key={mod.id}
                className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-bg-surface-2)]/30 overflow-hidden"
              >
                <div className="p-4 bg-[var(--cf-bg-surface-2)]/80 border-b border-[var(--cf-border)] flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono uppercase text-[var(--cf-primary)] font-bold">
                      Module
                    </span>
                    <h3 className="text-sm font-semibold text-white">{mod.title}</h3>
                  </div>
                  <span className="text-xs font-mono text-[var(--cf-text-secondary)]">
                    {childTopics.length} topics
                  </span>
                </div>

                <div className="divide-y divide-[var(--cf-border)]/50">
                  {childTopics.map((topic) => {
                    const colors = getStateColor(topic.studyState?.state);
                    return (
                      <div
                        key={topic.id}
                        onClick={() => onSelectTopic(topic)}
                        className="p-3.5 hover:bg-[var(--cf-bg-surface-2)]/60 transition-colors cursor-pointer flex items-center justify-between gap-4 group"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${colors.indicator} shrink-0`}
                          />
                          <div className="min-w-0">
                            <h4 className="text-xs font-medium text-white group-hover:text-[var(--cf-primary)] transition-colors truncate">
                              {topic.title}
                            </h4>
                            {topic.notes && (
                              <p className="text-[10px] font-mono text-emerald-400 mt-0.5">
                                {topic.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${colors.bg} ${colors.text} border ${colors.border}`}
                          >
                            {(topic.studyState?.state || 'not_started').replace('_', ' ')}
                          </span>
                          <span className="text-xs font-mono text-[var(--cf-text-secondary)]">
                            ~{topic.estimatedMinutes || 60}m
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--cf-text-secondary)] group-hover:text-white transition-colors" />
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
