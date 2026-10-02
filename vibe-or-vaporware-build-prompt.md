# MASTER PROMPT: "Vibe or Vaporware"
### A production-readiness scanner and roaster for vibe-coded apps

Paste everything below into your coding assistant (Opus recommended) in an empty folder. Every section explains the WHY as well as the WHAT, so the assistant can make good decisions without asking questions.

---

## 1. YOUR ROLE
You are a senior software architect and full-stack engineer with a security mindset. You design before you code, you write testable pure functions, you treat every URL a user submits as hostile, and you ship fast without over-engineering. You explain trade-offs briefly in the docs, not in long chat replies.

## 2. THE IDEA (what we are building and why)
**Vibe or Vaporware** is a web app. A user pastes the URL of an app they built with an AI coding tool (Emergent, Lovable, Bolt, Replit, v0, Cursor, anything). Within about a minute the app returns:
- a **Production Readiness Score** from 0 to 100 and a grade,
- a short, funny, specific **roast** of the app,
- a prioritized list of **findings**, each explained in plain English,
- a **copy-paste fix prompt** for every finding, plus one "master fix prompt", that the user can paste straight into their AI coding tool,
- a **shareable score card**, and an optional opt-in leaderboard.

**Why this exists:** AI tools make it easy to get an app that *looks* finished. The hard part is correctness, reliability and security: leaked keys, broken pages, missing headers, apps that fall over on a phone. Non-technical builders don't know what to check. This tool checks it for them, from the outside, in a way that is fun enough to share.

**Hidden goal:** this is a portfolio project for an internship application at a vibe-coding company whose stated hard problem is exactly this (correctness, reliability, security of AI-generated apps). It must be polished, safe, genuinely useful, and demo-able in 60 seconds.

## 3. TARGET AUDIENCE
- **Primary:** non-technical and semi-technical builders who shipped an app with an AI tool and want to know "is this actually okay?" Explain everything in plain English. No jargon without a one-line explanation.
- **Secondary:** developers who want a quick outside-in audit of a prototype; people on tech social media who will screenshot a score.
- **Tertiary:** the reviewers who will judge this project. They will paste their own company's apps in. The tool must be accurate, fast, and must not crash or embarrass anyone.

## 4. NON-NEGOTIABLE PRINCIPLES
1. **Passive only.** We only look at what any normal visitor's browser receives: the page, its scripts, headers, and network requests the page makes by itself. We NEVER guess hidden paths (no probing `/.env`, `/.git`, `/admin`), never submit forms, never log in, never fuzz, never send payloads, never call a third party using a key we found.
2. **Secrets are radioactive.** If we detect a leaked secret we store and show only a redacted form (first 4 and last 2 characters) and the secret type, never the full value, never in logs, never to the LLM. Critical findings are visible only to the person who ran the scan (private link with an unguessable token), never on public pages or the leaderboard.
3. **Untrusted input everywhere.** The URL is hostile. Page content is hostile (it can contain prompt injection aimed at our LLM). Design for that.
4. **Never fail the whole scan because one check failed.** Each check has its own timeout and its own "couldn't run this" state. Partial results are fine and are labelled honestly.
5. **Honest claims.** This is a heuristic outside-in scanner, NOT a penetration test. The UI must say so. Never say an app is "secure"; say "no issues found by these checks".
6. **Dogfood.** The finished app must scan itself and score 90+. That is a required acceptance test.

## 5. HOW IT WORKS (end-to-end flow)
1. User submits a URL on the landing page. Optional checkbox: "List my score on the public leaderboard" (default OFF).
2. **Web app** (Next.js, on Vercel) validates the URL, applies rate limits, creates a `scan` row with status `queued`, then calls the **scanner worker** over HTTPS with a shared-secret header. It returns the scan id immediately.
3. The browser shows a **live progress checklist** (polling `GET /api/scan/:id` every 1.5 s, or server-sent events if simple). Steps are named in a fun voice ("Sniffing your JavaScript for secrets...").
4. **Scanner worker** (Node + Playwright in Docker, on Railway or Render) runs the pipeline in section 7, writes progress and results to the database.
5. The report page `/r/:id` shows score, grade, roast, category bars, findings, fix prompts and a share card.
6. Re-scanning the same URL shows a **before/after score delta** ("+23 since last scan") so users see their fixes working.

**Why a separate worker:** Playwright/Chromium does not run reliably in Vercel serverless functions (size and time limits). A small always-on container is the honest, reliable design.

## 6. ARCHITECTURE

### Repo layout (simple npm workspaces, TypeScript everywhere)
```
/apps/web        Next.js App Router + Tailwind (UI, API routes, OG image)
/apps/worker     Node 20 + Express + Playwright (scanner), Dockerfile
/packages/shared Types (Finding, ScanResult), scoring, constants, fix-prompt templates
/fixtures        Deliberately bad demo pages for testing detectors
/docs            PRD, ARCHITECTURE, THREAT_MODEL, TASKS, ASSUMPTIONS, DEPLOY
```

### Key design choice: detectors are pure functions
Each check is a pure function `(ScanContext) => Finding[]` where `ScanContext` holds the already-collected evidence (HTML, headers, cookies, bundle texts, console log, network log, PSI result). Collection (I/O) and judging (logic) are separate. This makes every detector unit-testable with fixtures, with no browser needed.

### Data stores
- **Supabase Postgres** (free tier). Tables: `scans` (id, url, hostname, status, progress JSON, score, grade, category_scores JSON, findings JSON, roast, private_token, is_public, created_at), `rate_limits` if not using memory. Row Level Security ON for all tables; the browser never talks to the database directly. Only server code uses the service key. (We preach this, so we must practice it.)
- Store NO raw HTML and NO full bundle text. Store only findings and small evidence snippets that are redacted.

### Finding schema (shared type)
```
Finding {
  id: string                // stable, e.g. "sec.secret.openai"
  category: "security"|"reliability"|"performance"|"mobile"|"accessibility"|"polish"
  severity: "critical"|"high"|"medium"|"low"|"info"
  title: string             // plain English
  evidence: string          // short and REDACTED
  whyItMatters: string      // 1-2 sentences for a non-technical reader
  fix: string               // 2-4 plain steps
  fixPrompt: string         // ready-to-paste prompt for any AI coding tool
  confidence: "high"|"medium"|"low"
  visibility: "public"|"private"   // critical secret findings are "private"
}
```

### Worker API
`POST /scan` with header `x-worker-secret` and body `{ scanId, url }`. Returns 202 immediately. The worker processes in an in-process queue (concurrency 2) and writes progress to the DB. `GET /health` for the host's health check.

## 7. THE SCAN PIPELINE (worker)
Hard cap of 60 seconds per scan. Each step has its own timeout and a "skipped" state.

**Step A: Target guard (SSRF protection).** Reject non-http(s) schemes, credentials in URL, ports other than 80/443, and hostnames that resolve to private, loopback, link-local or cloud-metadata ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 incl. 169.254.169.254, ::1, fc00::/7, fe80::/10). Resolve DNS yourself, check every resolved IP, re-check after every redirect (max 5 redirects). Also intercept every request inside Playwright (`page.route`) and abort any request whose destination resolves to a blocked range. A dev-only env flag `ALLOW_LOCAL_TARGETS` may allow localhost for fixtures, and the code must refuse to start if that flag is true while `NODE_ENV=production`.

**Step B: Raw fetch.** One plain HTTPS GET of the URL with our own User-Agent (`VibeOrVaporwareBot/1.0 (+https://<our-domain>/about)`). Capture status, final URL, response headers, `Set-Cookie` attributes, and TTFB.

**Step C: Browser load (Playwright).** New isolated browser context per scan, no persisted storage, downloads blocked, JS enabled. Load at desktop 1366x768, wait for network idle (max 15 s), scroll once to trigger lazy content. Collect: console errors and warnings, uncaught page errors, failed and 4xx/5xx network requests, list of script URLs, the final DOM, and (stretch) a small screenshot. Then reload at mobile 375x812 and measure horizontal overflow (`scrollWidth > clientWidth`) and viewport meta. Never click, type or submit anything.

**Step D: Bundle scan.** Download up to 15 JavaScript files referenced by the page (cap 5 MB each, 15 MB total, 8 s each) and run the secret and tell-tale detectors on them. Note any `sourceMappingURL` referenced in those files and whether that referenced map is publicly reachable (a single GET of the exact URL the page itself references, not a guessed path).

**Step E: Link and 404 check.** Sample up to 15 same-origin links from the DOM and check status with HEAD (fallback GET); respect `robots.txt` Disallow for these extra requests. Make exactly one GET to a random non-existent path on the same origin to see how the app handles 404s.

**Step F: PageSpeed.** Call the Google PageSpeed Insights API (mobile strategy) for performance, accessibility, SEO and best-practices scores. Optional (needs `PSI_API_KEY`); if it is missing, rate-limited or slow, skip and say so. Do NOT run Lighthouse locally.

**Step G: Judge.** Run all detectors, build findings, compute scores.

**Step H: Roast.** Generate the roast with the LLM (section 9), with fallback.

**Step I: Save** and mark `done`.

**Why Playwright and not just a scraper:** we need console errors, failed requests and real rendering, not just HTML text.

## 8. THE CHECKS (detectors) AND SCORING

### Categories and weights (total 100)
Security 30, Reliability 25, Performance 15, Mobile 10, Accessibility 10, Polish & SEO 10.
Each category starts at its full weight and loses points per finding by severity (critical -100% of category, high -40%, medium -20%, low -8%, info 0), floored at 0. Put this in one pure, unit-tested function in `packages/shared`.

### Grade bands
85-100 "Production Ready", 65-84 "Almost Shippable", 40-64 "Vibes Only", 0-39 "Vaporware".
**Cap rule:** any critical finding caps the total score at 49, whatever else is good.

### Security (30)
- **Leaked secrets in client JS (critical when high confidence).** Patterns to implement, with fake fixtures in tests (never real keys): OpenAI (`sk-` / `sk-proj-`), Anthropic (`sk-ant-`), Stripe secret/restricted (`sk_live_`, `rk_live_`), AWS access key id (`AKIA` + 16 chars), GitHub tokens (`ghp_`, `github_pat_`), Slack (`xox[baprs]-`), SendGrid (`SG.`), PEM private key blocks, and Supabase JWTs whose decoded payload has `role: "service_role"`. Publishable keys are fine and must NOT be flagged as critical: Stripe `pk_`, Supabase `anon` role, Firebase web config. Google API keys (`AIza...`) are usually meant to be public: flag only as **medium "check that this key is restricted"**. Generic high-entropy strings count only when assigned to a variable named like `secret`, `private_key`, `api_secret`, `service_key`, and get medium confidence. **Never validate a key by calling the provider.**
- **Security headers:** HTTPS enforced, HSTS, Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, and clickjacking protection (X-Frame-Options or CSP frame-ancestors). Missing headers are low to medium, not critical.
- **Cookies:** Secure, HttpOnly (for session-looking cookies), SameSite.
- **Mixed content** (HTTP resources on an HTTPS page).
- **Public source maps** referenced by the page (medium: exposes original source).
- **Detected backends** (Supabase, Firebase, etc.): an **info** finding reminding the user to verify Row Level Security / database rules. We cannot verify it passively, so never claim a vulnerability.

### Reliability (25)
Non-200 final status, console errors, uncaught exceptions, failed API/network calls, broken internal links, a 404 path that returns 200 (soft 404) or shows a raw framework error, blank-screen detection (DOM with almost no visible text after load), slow TTFB.

### Performance (15)
PSI performance score bands, total JS bundle size, render-blocking resources, uncompressed responses (no gzip/br).

### Mobile (10)
Missing viewport meta, horizontal overflow at 375px, tiny font sizes or tap targets if cheaply measurable.

### Accessibility (10)
PSI accessibility score, plus cheap DOM checks: images without alt, inputs without labels, missing `lang` attribute, low-contrast only if from PSI.

### Polish & SEO (10), including "vibe tells"
Missing or default `<title>` ("Vite + React App", "Create Next App", "React App", "Untitled"), missing meta description, missing Open Graph tags, default framework favicon, lorem ipsum or obvious placeholder text ("Your Company Name", "Acme Inc"), leftover template badges. These are fun to roast and low severity.

### Fix prompts (important)
Every finding ships a `fixPrompt` template, written for any AI coding tool, e.g. for a leaked key: "My app exposes a secret API key in client-side JavaScript. Move all calls that use it to a server-side API route or backend function, read the key from an environment variable that is never sent to the browser, then rotate (revoke and recreate) the exposed key in the provider dashboard." Also generate one **master fix prompt** that lists all findings in priority order. The report page has Copy buttons for each and for the master prompt. Keep the tone neutral and tool-agnostic.

## 9. THE ROAST (LLM)
- Provider abstraction in `apps/web` or `packages/shared` (`LLM_PROVIDER` = `openai` | `anthropic`, `LLM_API_KEY`, `LLM_MODEL`), 8-second timeout, server-side only.
- **Prompt-injection defense:** the LLM receives ONLY our structured output (scores, finding ids/titles, counts). It NEVER receives raw page HTML, page text, titles or bundle content. Validate the returned roast: max 400 characters, strip URLs and markdown.
- **Voice:** playful, specific, internet-literate, punches at the app not the person, celebrates good scores genuinely. 2-3 sentences. No swearing, no mocking of anyone's skills or identity.
- **Fallback:** if the LLM fails, use a bank of 30+ handwritten roasts keyed by grade and top finding.

## 10. PRODUCT SURFACES (UI)
- **Landing `/`:** giant headline, one URL input, the leaderboard opt-in checkbox, a one-line disclaimer ("passive checks only, not a penetration test"), and a few example scores. Mobile-first.
- **Progress view:** live checklist with friendly copy and a fake-but-honest progress feel (steps tick as the worker reports them).
- **Report `/r/:id`:** animated score dial, grade badge, roast, six category bars, findings grouped by severity with expand/collapse, per-finding Copy fix prompt, master prompt button, Share button, Re-scan button, delta vs previous scan. Critical/private findings require the private token in the URL fragment or cookie; otherwise show "a critical issue was found; only the person who ran this scan can see details".
- **Share card:** `GET /api/card?score=&grade=&host=` using `next/og`, 1200x630. Validate params. Show the score, the grade and the hostname only, never findings. Add Open Graph tags on `/r/:id`.
- **Leaderboard `/leaderboard`:** only scans with `is_public = true`, no critical findings, highest first. No "wall of shame", ever.
- **`/about`:** what is checked, what is not, privacy (what we store), the bot User-Agent, how to contact us to remove a listing, and the "not a pen test" statement.
- **Design:** bold, meme-literate but clean, high contrast, one distinctive display font and one body font via `next/font`, colour-coded grades, subtle reveal animation, dark mode via `prefers-color-scheme`. Must look great at 380px wide.

## 11. ABUSE PREVENTION AND ETHICS
- Rate limits: 5 scans per hour per IP, and one scan per hostname per 10 minutes (return the cached result instead). Use the DB or Upstash Redis, not just memory, because serverless is stateless.
- Request size and URL length caps; reject obviously abusive targets (our own worker, private ranges, huge/binary responses).
- Identify ourselves honestly in the User-Agent.
- Data retention: delete scan rows older than 30 days (scheduled function or documented manual job).
- A takedown/removal path on `/about`.
- Privacy: no analytics, no third-party trackers on our own site (we must pass our own scan).

## 12. TECH STACK SUMMARY
Next.js (App Router) + TypeScript + Tailwind; Node 20 + Express + Playwright (official Playwright Docker image, non-root user); Supabase Postgres; Vitest for unit tests; PageSpeed Insights API; LLM via provider abstraction. Hosting: Vercel (web) and Railway or Render (worker). Keep dependencies minimal.

## 13. ENVIRONMENT VARIABLES (create `.env.example` with no real values)
Web: `WORKER_URL`, `WORKER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `NEXT_PUBLIC_SITE_URL`.
Worker: `WORKER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PSI_API_KEY` (optional), `ALLOW_LOCAL_TARGETS` (dev only), `PORT`.
Put `.env*` (except `.env.example`) in `.gitignore` BEFORE the first commit. Secrets only in host dashboards.

## 14. PHASE 0: PLANNING DOCS (do this before any app code)
Create `/docs` and write, then continue without waiting for approval:
1. `PRD.md` (problem, users, stories, features, non-goals, success metrics, risks)
2. `ARCHITECTURE.md` (diagram in text, data flow, API contracts, DB schema, scoring formula)
3. `THREAT_MODEL.md` (SSRF, abuse, prompt injection, secret handling, data retention, and the mitigation for each)
4. `TASKS.md` (the build steps below as checklists; tick as you go)
5. `ASSUMPTIONS.md` (log every assumption; do NOT stop to ask me questions)

## 15. BUILD STEPS (execute in order)

### STEP 1: Scanner core (no UI)
Shared types and scoring; target guard with SSRF tests; raw fetch; Playwright collection; bundle scan; all detectors as pure functions; CLI `npm run scan -- <url>` printing JSON findings and score. Create `/fixtures` with 3 deliberately bad static pages (leaked FAKE key, no headers and console errors, placeholder text and no viewport meta) served locally in dev.
**Acceptance:** Vitest passes, including: each secret pattern with positive and negative fixtures, publishable keys NOT flagged, SSRF blocks for every private range and for a redirect to a private IP, scoring and cap rule, each detector with at least one fixture. The CLI scans the 3 fixtures and 3 real public sites without crashing, within 60 s each.

### STEP 2: Worker service and web app skeleton
Express worker with secret-header auth and queue; Supabase schema with RLS; Next.js landing, `POST /api/scan`, rate limits, progress polling, basic report page rendering findings and scores.
**Acceptance:** submit a URL in the browser, watch progress, see a report; invalid, private and oversized inputs are rejected with friendly errors; a worker failure yields a clear failed state, not a hang.

### STEP 3: Product layer
Fix prompts and master prompt, roast with fallback, private-token handling for critical findings, share card and OG tags, re-scan delta, leaderboard (opt-in), `/about`.
**Acceptance:** roast never contains page content; a scan with a fake critical finding is hidden from public views and the leaderboard; card renders for all four grades; malformed params return a safe default.

### STEP 4: Harden, dogfood, deploy
Design polish, dark mode, accessibility pass, README (what/why/how, screenshots placeholder, architecture image or text diagram, env table, limitations), `docs/DEPLOY.md` (worker on Railway/Render from the Dockerfile, web on Vercel, env vars, health check, a smoke test script).
**Acceptance:** the deployed app scans itself and scores 90+; `git log -p` contains no real secrets; the smoke test passes against production; worker refuses requests without the secret header.

## 16. EXECUTION PROTOCOL
1. Finish Phase 0 (docs) first.
2. Execute Steps 1 to 4 in order. After each step: run build and tests, tick `docs/TASKS.md`, commit (`feat: step N ...`), print a summary of at most 5 lines, then continue immediately. Stop and report only if truly blocked.
3. Token discipline: do not reprint whole files after editing, do not re-read files you just wrote, keep chat explanations short (detailed reasoning goes in `docs/`). Prefer small targeted edits.
4. If a real-world behaviour differs from this spec (an API changed, a site blocks headless browsers), trust reality, adapt, and log it in `docs/ASSUMPTIONS.md`. Sites behind bot protection should yield a graceful "we couldn't scan this one" result, never a crash.
5. Finish by printing: the folder tree, local run instructions, the exact env vars to set on each host, the 3 biggest known limitations, and 3 improvements for v2.

Begin with Phase 0 now.
