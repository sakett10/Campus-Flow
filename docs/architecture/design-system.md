# CampusFlow Preliminary Design System Specification

## 1. Design Language & Brand Philosophy

CampusFlow is designed as a focused **academic operating system and second brain** for college students. The visual language conveys:

- **Premium & Technical**: Precise layout, information-dense without clutter, clean engineering aesthetic.
- **Calm & Intelligent**: Subtle contrasts, high readability, avoiding visual noise or over-stimulation.
- **Student-Native**: Direct, utilitarian, respecting student time and cognitive bandwidth.

### Explicit Anti-Patterns (Forbidden)

- **NO generic purple AI gradients** or iridescent rainbow glows.
- **NO excessive glassmorphism** (no blurry multi-layered frosted glass panels everywhere).
- **NO excessive pill UI** (avoid turning every badge, tag, and button into bubbly rounded pills).
- **NO excessive cards-within-cards** nesting.
- **NO fake analytics, vanity gauges, or fake probabilities**.
- **NO decorative clutter** or meaningless decorative micro-illustrations.

---

## 2. Color Tokens & Semantic Colors

The color palette is built around deep, disciplined neutrals with crisp functional accents.

### Neutral Scale (Dark Mode Default, Light Mode Supported)

- **Canvas Base (`--cf-bg-base`)**:
  - Dark: `#0A0D12` (rich obsidian, subtle blue-slate undertone)
  - Light: `#F8FAFC`
- **Surface Layer 1 (`--cf-bg-surface-1`)**:
  - Dark: `#12161F` (panel background, subtle contrast from base)
  - Light: `#FFFFFF`
- **Surface Layer 2 (`--cf-bg-surface-2`)**:
  - Dark: `#1B212D` (raised cards, modals, table headers)
  - Light: `#F1F5F9`
- **Surface Hover (`--cf-bg-surface-hover`)**:
  - Dark: `#232B3A`
  - Light: `#E2E8F0`

### Text & Content Hierarchy

- **Text Primary (`--cf-text-primary`)**:
  - Dark: `#F1F5F9` (high legibility, 95% contrast)
  - Light: `#0F172A`
- **Text Secondary (`--cf-text-secondary`)**:
  - Dark: `#94A3B8` (metadata, labels, descriptions)
  - Light: `#475569`
- **Text Muted / Tertiary (`--cf-text-muted`)**:
  - Dark: `#64748B` (timestamps, subtle placeholders)
  - Light: `#94A3B8`

### Semantic & Functional Accents

- **Brand / Focus Primary (`--cf-accent-primary`)**:
  - `#2563EB` (Royal Blue) / Hover: `#1D4ED8` (Technical, steady, authoritative)
- **Success (`--cf-success`)**:
  - Dark: `#10B981` / Background: `rgba(16, 185, 129, 0.12)`
  - Light: `#059669` / Background: `#ECFDF5`
- **Warning / Pending (`--cf-warning`)**:
  - Dark: `#F59E0B` / Background: `rgba(245, 158, 11, 0.12)`
  - Light: `#D97706` / Background: `#FFFBEB`
- **Danger / Destructive (`--cf-danger`)**:
  - Dark: `#EF4444` / Background: `rgba(239, 68, 68, 0.12)`
  - Light: `#DC2626` / Background: `#FEF2F2`
- **Information / Agent Evidence (`--cf-info`)**:
  - Dark: `#38BDF8` (Sky technical cyan for cited evidence)
  - Light: `#0284C7`

---

## 3. Typography

Using modern, highly legible sans-serif typography for UI and tabular numbers for metrics.

- **Primary Typeface**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.
- **Code & Citations**: `JetBrains Mono`, `Fira Code`, `ui-monospace`, `monospace`.

### Hierarchy

- **Display / Page Title**: `24px` (`1.5rem`), font-weight: `600`, line-height: `1.25`, letter-spacing: `-0.02em`
- **Section Heading**: `18px` (`1.125rem`), font-weight: `600`, line-height: `1.35`, letter-spacing: `-0.01em`
- **Subheading**: `15px` (`0.9375rem`), font-weight: `500`, line-height: `1.4`
- **Body Text**: `14px` (`0.875rem`), font-weight: `400`, line-height: `1.5`
- **Small / Metadata**: `12px` (`0.75rem`), font-weight: `400`, line-height: `1.4`
- **Data / Metrics**: `13px` or `14px`, `font-variant-numeric: tabular-nums`

---

## 4. Spacing, Radii & Borders

### Spacing Scale (4px / 8px grid)

- `cf-space-1`: `4px`
- `cf-space-2`: `8px`
- `cf-space-3`: `12px`
- `cf-space-4`: `16px`
- `cf-space-6`: `24px`
- `cf-space-8`: `32px`
- `cf-space-12`: `48px`

### Radii (Subtle, architectural, never bubbly)

- `--cf-radius-sm`: `4px` (inner badges, code tags)
- `--cf-radius-md`: `6px` (buttons, text inputs, dropdown items)
- `--cf-radius-lg`: `8px` (cards, dialogs, drawers)
- `--cf-radius-full`: Reserved **only** for user avatar circles and status indicator dots.

### Borders & Dividers

- Border Width: `1px` crisp.
- Border Color:
  - Dark: `rgba(255, 255, 255, 0.08)` (subtle structural divider)
  - Light: `rgba(0, 0, 0, 0.08)`
- Focused Border: `var(--cf-accent-primary)` with `1px` ring offset.

### Elevation (Shadows)

- **Flat (Default UI)**: Border only, no blur shadow.
- **Elevation 1 (Dropdown / Tooltip)**: `0 4px 12px rgba(0, 0, 0, 0.35)`
- **Elevation 2 (Modal / Dialog)**: `0 12px 32px rgba(0, 0, 0, 0.5)`

---

## 5. Motion & Transitions

CampusFlow emphasizes **restrained motion** that clarifies spatial relationships and state transitions without being sluggish.

- **Fast Micro-interaction**: `100ms ease-out` (hover, active press, toggle)
- **Standard Transition**: `150ms cubic-bezier(0.16, 1, 0.3, 1)` (modal enter, accordion open, panel slide)
- **Reduced Motion**:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```

---

## 6. Icons & Visual Anchors

- Icon Library: `lucide-react` (uniform 2px stroke, clean geometric glyphs).
- Size rules:
  - Inline with body: `14px` or `16px`
  - Action buttons: `16px`
  - Navigation / Section headers: `18px` or `20px`
- Icons must always be accompanied by accessible labels (`aria-label` or visible text).

---

## 7. Data Visualization Rules

- **Strict Evidence Rule**: Every score or mastery band must represent genuine evidence (e.g. `Mastery: Band 2 (3/5 practice items completed)`). Never emit fake percentages (e.g. "You have 87.42% chance of an A").
- **Uncertainty Representation**: When evidence is low, charts must show an "Insufficient evidence" badge or dashed confidence band.
- **Palette for Data**:
  - Blue (`#2563EB`): Completed / Solid evidence
  - Slate (`#475569`): Unattempted / Pending
  - Amber (`#D97706`): Needs review / Low confidence

---

## 8. State Patterns (Empty, Loading, Error)

### Empty States

- Direct, informative headline explaining what is missing (e.g., "No syllabus uploaded yet").
- Actionable primary button (e.g., "Upload Syllabus PDF").
- No sad mascot illustrations or empty filler cards.

### Loading States

- Skeleton loaders matching the exact structural layout of content blocks.
- Subtle opacity pulse (`0.6` to `0.85`), no jarring bright sweeps.
- Inline spinners only for buttons actively submitting requests.

### Error States

- Inline field validation with explicit guidance on how to rectify.
- Non-recoverable API errors wrapped in an error card with error code and retry CTA.
- Internal database details or stack traces are never exposed to the client.

---

## 9. Responsive Breakpoints

- Mobile: `< 640px` (Clean single column, bottom nav or condensed header)
- Tablet: `640px - 1024px` (Collapsible sidebar, compact data tables)
- Desktop: `1024px - 1440px` (Fixed navigation sidebar, dense main workspace)
- Wide: `> 1440px` (Max content container width: `1400px` centered to maintain reading line length)

---

## 10. Accessibility (A11y) Standards

- **Contrast Ratios**: Minimum `4.5:1` for body text; `3:1` for large text and interactive borders.
- **Focus Rings**: Distinct keyboard focus indicator (`outline: 2px solid var(--cf-accent-primary)`, `outline-offset: 2px`).
- **Semantic HTML**: Proper heading hierarchy (`h1` -> `h2` -> `h3`), `<main>`, `<nav>`, `<aside>`, `<section>`, `<article>`.
- **Keyboard Navigation**: All interactive elements (modals, dropdowns, tables) fully operable via `Tab`, `Escape`, `Enter`, and Arrow keys.
