# ADR-001: Web framework

## Status

Accepted

## Decision

The web command center is a **Next.js App Router** application written in **TypeScript**, located at `apps/web`.

It will host authentication UI (Clerk) and, in later phases, resource management, courses/assessments, academic map, grounded search, exam preparation, sessions, and settings.

This phase does **not** implement product pages, a dashboard, chat, Spline, or exam intelligence.

## Alternatives considered

- Vite + SPA: weaker first-party auth/session and SEO for marketing later; extra API CORS surface.
- Remix: viable, but Next.js matches the frozen product stack (React, Tailwind later, Clerk examples).
- Separate marketing site first: deferred; landing/Spline is out of this phase.

## Reason

One TypeScript web app with server components keeps auth session handling close to Clerk while leaving business authorization in the API/Postgres.

## Consequences

- Web must not become the authorization authority.
- Product UI waits until the API ownership model is proven.
- Tailwind/shadcn are allowed later; this phase only lays tokens/spec, not a component library dump.

## Reversal conditions

Replace Next.js only if Clerk+App Router integration or deploy constraints fail in a documented incident, or if a lighter SPA is proven sufficient after the MVP loop exists.
