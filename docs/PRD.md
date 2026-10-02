# Product Requirements Document (PRD)

## 1. Problem
AI coding tools make it easy to build apps that look complete, but non-technical builders struggle to verify their correctness, reliability, and security.

## 2. Users
- Primary: Non-technical and semi-technical builders wanting a plain-English audit.
- Secondary: Developers needing a quick prototype audit; social media users sharing scores.
- Tertiary: Reviewers checking the tool's quality.

## 3. Stories
- As a builder, I want to paste my app URL and get a score so I know if it's production-ready.
- As a builder, I want clear, copy-paste prompts to fix any issues found using my AI tool.
- As a user, I want my sensitive leaked secrets redacted and kept private.

## 4. Features
- Passive, out-of-band scanner (URL input).
- Live progress checklist.
- Production Readiness Score (0-100) and grade.
- LLM-generated playful roast.
- Prioritized findings with plain-English explanations.
- Copy-paste fix prompts (individual and master).
- Shareable score card and opt-in public leaderboard.

## 5. Non-Goals
- Active penetration testing, fuzzing, or exploiting found secrets.
- Full source code analysis (we only scan what the browser sees).
- Fixing the code on the user's behalf.

## 6. Success Metrics
- Dogfood test: App scores 90+ on its own scan.
- Scan completes in under 60 seconds.
- Accurate detection of deliberately bad fixtures.

## 7. Risks
- Malicious inputs (SSRF, prompt injection).
- Legal/Privacy issues with exposed secrets.
- Scans hanging or failing due to anti-bot protections.
