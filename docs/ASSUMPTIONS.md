# Assumptions

- The environment uses a `.env` pattern.
- Playwright will run in standard Chromium mode; if headless detections trigger, we gracefully skip/fail specific checks rather than crashing.
- We assume `packages/shared` will be a standard TS compilation or bundled with the apps as needed.
- We assume standard ESLint/Prettier is acceptable but not strictly required unless specifically blocking CI. We will focus on TS compiler correctness.
- `Vitest` is used over Jest for faster and modern testing.
- The Node version is 20, as per spec.
