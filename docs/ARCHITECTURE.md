# Architecture

## Data Flow
1. User submits URL on the Next.js web app.
2. Web app validates URL, checks rate limits, creates a `queued` scan row in Supabase, returns ID.
3. Web UI polls `GET /api/scan/:id` for progress.
4. Web app calls Worker over HTTPS with `x-worker-secret`.
5. Worker runs Playwright, checks URL, collects evidence, runs pure-function detectors, scores, calls LLM for roast, saves to Supabase.
6. Web UI displays the completed report.

## Directory Structure
- `/apps/web`: Next.js App Router (UI, API routes, OG image).
- `/apps/worker`: Node 20 + Express + Playwright (Scanner API).
- `/packages/shared`: Shared TypeScript types, constants, pure scoring functions.
- `/fixtures`: Bad static pages for testing detectors.
- `/docs`: Project documentation.

## API Contracts
- `POST /api/scan`: Start a scan.
- `GET /api/scan/:id`: Poll progress.
- Worker `POST /scan`: Start processing (requires secret header).
- Worker `GET /health`: Health check.

## Database Schema (Supabase)
`scans` table:
- `id` (uuid)
- `url` (text)
- `hostname` (text)
- `status` (queued, scanning, done, failed)
- `progress` (json)
- `score` (integer)
- `grade` (text)
- `category_scores` (json)
- `findings` (json)
- `roast` (text)
- `private_token` (uuid)
- `is_public` (boolean)
- `created_at` (timestamp)

## Scoring Formula
- Weights: Security (30), Reliability (25), Performance (15), Mobile (10), Accessibility (10), Polish (10) = 100 total.
- Deductions per finding severity: Critical (-100%), High (-40%), Medium (-20%), Low (-8%), Info (0).
- Cap rule: Any critical finding caps total score at 49.
- Floors: Each category floors at 0. Total floors at 0.
