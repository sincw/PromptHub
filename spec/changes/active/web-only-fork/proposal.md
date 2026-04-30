# Web-only Fork

## Why

PromptHub is being forked for web-only secondary development. Keeping `apps/desktop` as the default target creates script, dependency, Docker, and CI noise for a repository that will no longer ship Electron builds.

## Scope

- Make `apps/web` independent from `apps/desktop`.
- Remove Electron desktop package, scripts, and release automation.
- Keep shared packages used by web (`packages/shared`, `packages/db`).

## Risks

- The web workspace UI still reuses code originally authored for the desktop renderer. The fork keeps that code under `apps/web/vendor/renderer` so it can be adapted in place later.
- The browser runtime bridge still exposes compatibility objects expected by the reused UI.
