# Implementation

## Status

Implemented.

## Shipped Changes

- Removed `apps/desktop` and Electron release automation from the workspace.
- Moved the renderer UI used by web into `apps/web/vendor/renderer`.
- Updated web Vite, Vitest, Tailwind, Docker, i18n, and runtime imports so web no longer reads desktop paths.
- Renamed the browser compatibility bridge folder to `runtime-bridge` and the protected client page to `WorkspacePage`.
- Moved runtime UI dependencies into `@prompthub/web`.
- Updated root scripts, README, contributing docs, and stable specs for the web-only boundary.

## Verification

- Passed: `pnpm --filter @prompthub/web typecheck`
- Passed: `pnpm --filter @prompthub/web lint`
- Passed: `pnpm --filter @prompthub/web test -- --run src/client/main.test.tsx src/client/i18n.test.ts src/client/runtime-bridge/install-bridge.test.ts src/client/App.test.tsx`
- Passed: `pnpm --filter @prompthub/web build`
- Full `pnpm --filter @prompthub/web test` was attempted and failed on existing service/integration test timeouts plus a local `pnpm` binary lookup in the Docker runtime dependency test.
