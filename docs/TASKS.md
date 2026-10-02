# Tasks

## Phase 0: Planning Docs
- [x] PRD.md
- [x] ARCHITECTURE.md
- [x] THREAT_MODEL.md
- [x] TASKS.md
- [ ] ASSUMPTIONS.md

## Step 1: Scanner core (no UI)
- [ ] Set up npm workspaces (apps/web, apps/worker, packages/shared, fixtures)
- [ ] Create packages/shared with TypeScript, Vitest, types, and scoring logic
- [ ] Write Vitest tests for scoring (cap rule, bands, etc.)
- [ ] Target guard with SSRF tests
- [ ] Raw fetch
- [ ] Playwright collection
- [ ] Bundle scan
- [ ] Detectors as pure functions
- [ ] CLI scanner
- [ ] Test fixtures

## Step 2: Worker service and web app skeleton
- [ ] Express worker
- [ ] Supabase schema
- [ ] Next.js landing and polling API
- [ ] Basic report view

## Step 3: Product layer
- [ ] Fix prompts and master prompt
- [ ] Roast with fallback
- [ ] Private token handling
- [ ] Share card and OG tags
- [ ] Leaderboard
- [ ] About page

## Step 4: Harden, dogfood, deploy
- [ ] Polish UI, dark mode
- [ ] DEPLOY.md and smoke test
- [ ] Dogfood test
