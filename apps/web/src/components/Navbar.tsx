'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Search, Calendar, Cpu, CheckCircle } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Today', icon: Calendar },
    { href: '/courses', label: 'Courses', icon: BookOpen },
    { href: '/search', label: 'Search', icon: Search },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--cf-border)] bg-[var(--cf-bg-surface-1)]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="h-8 w-8 rounded-lg bg-[var(--cf-primary)]/10 border border-[var(--cf-primary)]/20 flex items-center justify-center text-[var(--cf-primary)] group-hover:scale-105 transition-transform">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
                CampusFlow
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded bg-[var(--cf-primary)]/20 text-[var(--cf-primary)]">
                  MVP
                </span>
              </span>
              <span className="text-[11px] text-[var(--cf-text-secondary)] font-mono">
                Academic OS
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-[var(--cf-border)]">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--cf-bg-surface-2)] text-white shadow-sm border border-[var(--cf-border)]'
                      : 'text-[var(--cf-text-secondary)] hover:text-white hover:bg-[var(--cf-bg-surface-2)]/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Status Indicator */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-[11px] font-mono">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span>Second Brain Active</span>
          </div>
        </div>
      </div>
    </header>
  );
}
