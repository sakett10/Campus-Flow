'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import type { Course } from '@campusflow/types';

interface LearningUniverseVisualizerProps {
  courses: Course[];
  splineSceneUrl?: string;
  onSelectCourse?: (courseId: string) => void;
}

interface Node3D {
  id: string;
  code: string;
  title: string;
  orbitRadius: number;
  orbitSpeed: number;
  orbitAngle: number;
  orbitTilt: number;
  radius: number;
  color: string;
  glowColor: string;
}

export function LearningUniverseVisualizer({
  courses,
  splineSceneUrl: _splineSceneUrl,
  onSelectCourse,
}: LearningUniverseVisualizerProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hoveredCourse, setHoveredCourse] = useState<Course | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [rotation, setRotation] = useState({ x: 0.35, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Check reduced motion preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      if (mediaQuery.matches) {
        setIsPaused(true);
      }
      const listener = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(e.matches);
        if (e.matches) setIsPaused(true);
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  // Generate deterministic 3D celestial nodes for courses
  const nodes3D = useMemo<Node3D[]>(() => {
    const palette = [
      { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.4)' }, // Sky
      { color: '#34d399', glow: 'rgba(52, 211, 153, 0.4)' }, // Emerald
      { color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.4)' }, // Amber
      { color: '#a78bfa', glow: 'rgba(167, 139, 250, 0.4)' }, // Violet
      { color: '#f472b6', glow: 'rgba(244, 114, 182, 0.4)' }, // Rose
    ];

    return courses.map((c, i) => {
      const p = palette[i % palette.length]!;
      const orbitRadius = 140 + i * 55;
      const orbitSpeed = 0.003 / (1 + i * 0.25);
      const orbitTilt = 0.2 + (i % 3) * 0.15;
      const initialAngle = (i * (2 * Math.PI)) / Math.max(1, courses.length);

      return {
        id: c.id,
        code: c.code,
        title: c.title,
        orbitRadius,
        orbitSpeed,
        orbitAngle: initialAngle,
        orbitTilt,
        radius: 12 + (i % 3) * 3,
        color: p.color,
        glowColor: p.glow,
      };
    });
  }, [courses]);

  // Starfield background data
  const stars = useMemo(() => {
    const count = 120;
    const items: Array<{ x: number; y: number; z: number; size: number; alpha: number }> = [];
    for (let i = 0; i < count; i++) {
      items.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1200,
        z: Math.random() * 800 + 100,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.7 + 0.2,
      });
    }
    return items;
  }, []);

  // Main 3D Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let angleOffset = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Starfield
      for (const s of stars) {
        const perspective = 600 / (600 + s.z);
        const sx = centerX + s.x * perspective;
        const sy = centerY + s.y * perspective;
        if (sx > 0 && sx < width && sy > 0 && sy < height) {
          ctx.beginPath();
          ctx.arc(sx, sy, s.size * perspective, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha * 0.8})`;
          ctx.fill();
        }
      }

      // 2. Central Core (Second Brain Nucleus)
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 45);
      coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      coreGradient.addColorStop(0.3, 'rgba(56, 189, 248, 0.8)');
      coreGradient.addColorStop(0.7, 'rgba(56, 189, 248, 0.2)');
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
      ctx.fillStyle = coreGradient;
      ctx.fill();

      // Core Solid Center
      ctx.beginPath();
      ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 3. Render Orbital Trajectories and Planetary Nodes
      const projectedNodes: Array<{
        node: Node3D;
        px: number;
        py: number;
        pz: number;
        scale: number;
      }> = [];

      for (const n of nodes3D) {
        // Draw orbital elliptical ring
        ctx.beginPath();
        const rx = n.orbitRadius;
        const ry = n.orbitRadius * Math.cos(rotation.x);
        ctx.ellipse(centerX, centerY, rx, ry, rotation.y, 0, Math.PI * 2);
        ctx.strokeStyle =
          hoveredCourse?.id === n.id ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = hoveredCourse?.id === n.id ? 1.5 : 1;
        ctx.stroke();

        // Calculate 3D position
        const currentAngle = n.orbitAngle + angleOffset;
        const x3d = Math.cos(currentAngle) * n.orbitRadius;
        const z3d = Math.sin(currentAngle) * n.orbitRadius;
        const y3d = Math.sin(currentAngle) * n.orbitRadius * Math.sin(n.orbitTilt);

        // Apply view rotations
        const cosX = Math.cos(rotation.x);
        const sinX = Math.sin(rotation.x);
        const cosY = Math.cos(rotation.y);
        const sinY = Math.sin(rotation.y);

        // Rotate around Y
        const xRotY = x3d * cosY - z3d * sinY;
        const zRotY = x3d * sinY + z3d * cosY;

        // Rotate around X
        const yRotX = y3d * cosX - zRotY * sinX;
        const zRotX = y3d * sinX + zRotY * cosX;

        // Perspective projection
        const fov = 500;
        const cameraZ = 500;
        const scale = fov / (cameraZ + zRotX);
        const px = centerX + xRotY * scale;
        const py = centerY + yRotX * scale;

        projectedNodes.push({ node: n, px, py, pz: zRotX, scale });
      }

      // Sort by Z-depth for correct occlusion
      projectedNodes.sort((a, b) => a.pz - b.pz);

      // Render projected planetary course nodes
      for (const item of projectedNodes) {
        const { node, px, py, scale } = item;
        const r = Math.max(6, node.radius * scale);
        const isHovered = hoveredCourse?.id === node.id;

        // Atmospheric halo
        const haloGrad = ctx.createRadialGradient(px, py, r * 0.5, px, py, r * 2.2);
        haloGrad.addColorStop(0, node.glowColor);
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = haloGrad;
        ctx.fill();

        // Planet Body
        const planetGrad = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        planetGrad.addColorStop(0, '#ffffff');
        planetGrad.addColorStop(0.3, node.color);
        planetGrad.addColorStop(1, '#09090b');

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = planetGrad;
        ctx.fill();

        if (isHovered) {
          ctx.beginPath();
          ctx.arc(px, py, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Course Code Tag in 3D Space
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.75)';
        ctx.textAlign = 'center';
        ctx.fillText(node.code, px, py + r + 14);
      }

      if (!isPaused) {
        angleOffset += 0.003;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes3D, stars, rotation, isPaused, hoveredCourse]);

  // Raycasting / Mouse Hit Detection
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setRotation((prev) => ({
        x: Math.max(0.1, Math.min(1.4, prev.x + dy * 0.005)),
        y: prev.y + dx * 0.005,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check hit against rendered positions
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    let foundCourse: Course | null = null;

    for (const n of nodes3D) {
      const rx = n.orbitRadius;
      const ry = n.orbitRadius * Math.cos(rotation.x);
      // Rough projection hit check
      const currentAngle = n.orbitAngle;
      const x3d = Math.cos(currentAngle) * rx;
      const y3d = Math.sin(currentAngle) * ry;

      const px = centerX + x3d;
      const py = centerY + y3d;

      const dist = Math.hypot(mouseX - px, mouseY - py);
      if (dist < n.radius + 18) {
        const matchingCourse = courses.find((c) => c.id === n.id);
        if (matchingCourse) {
          foundCourse = matchingCourse;
          setTooltipPos({ x: e.clientX, y: e.clientY });
          break;
        }
      }
    }

    setHoveredCourse(foundCourse);
    if (!foundCourse) setTooltipPos(null);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleCanvasClick = () => {
    if (hoveredCourse) {
      if (onSelectCourse) {
        onSelectCourse(hoveredCourse.id);
      } else {
        router.push(`/courses/${hoveredCourse.id}`);
      }
    }
  };

  return (
    <div className="relative w-full rounded-3xl border border-[var(--cf-border)] bg-[#030712] overflow-hidden shadow-2xl">
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        width={960}
        height={460}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        className="w-full h-[400px] sm:h-[460px] cursor-grab active:cursor-grabbing block"
      />

      {/* Top Floating Glass Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="p-2.5 px-3.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white flex items-center gap-2 shadow-lg">
          <Sparkles className="w-4 h-4 text-[var(--cf-primary)]" />
          <span className="text-xs font-semibold tracking-wide">CampusFlow Learning Space</span>
          <span className="text-[10px] font-mono text-[var(--cf-text-secondary)]">
            ({courses.length} Active Courses)
          </span>
          {prefersReducedMotion && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">
              Reduced Motion
            </span>
          )}
        </div>

        {/* Motion and Reset Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white/80 hover:text-white transition-colors"
            title={isPaused ? 'Resume Orbit' : 'Pause Orbit'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setRotation({ x: 0.35, y: 0 })}
            className="p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white/80 hover:text-white transition-colors"
            title="Reset Perspective"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Hover Tooltip */}
      {hoveredCourse && tooltipPos && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltipPos.x + 14}px`,
            top: `${tooltipPos.y - 14}px`,
          }}
          className="z-50 pointer-events-none p-3.5 rounded-xl bg-black/90 backdrop-blur-md border border-white/20 shadow-2xl text-left space-y-1 animate-in fade-in duration-100"
        >
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-[var(--cf-primary)]/20 text-[var(--cf-primary)] font-mono text-[10px] font-bold border border-[var(--cf-primary)]/40">
              {hoveredCourse.code}
            </span>
            <span className="text-[10px] font-mono text-[var(--cf-text-secondary)]">
              {hoveredCourse.term || 'Fall 2026'}
            </span>
          </div>
          <p className="text-xs font-semibold text-white max-w-xs truncate">
            {hoveredCourse.title}
          </p>
          <p className="text-[10px] font-mono text-emerald-400 pt-0.5">
            Click to enter course workspace →
          </p>
        </div>
      )}

      {/* Accessible Non-3D Companion Footer */}
      <div className="p-4 border-t border-[var(--cf-border)] bg-black/40 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-[11px] font-mono text-[var(--cf-text-secondary)]">
          Drag to rotate galaxy · Hover celestial nodes · Select any course to enter:
        </span>
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/courses/${c.id}`}
              className="px-2.5 py-1 rounded-lg bg-[var(--cf-bg-surface-2)] hover:bg-[var(--cf-border)] border border-[var(--cf-border)] text-white text-[11px] font-mono transition-colors shrink-0 flex items-center gap-1.5"
            >
              <span className="text-[var(--cf-primary)] font-semibold">{c.code}</span>
              <ArrowRight className="w-3 h-3 text-[var(--cf-text-secondary)]" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
