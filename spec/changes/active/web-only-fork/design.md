# Design

## Approach

- Vendor the renderer UI that web already embedded into `apps/web/vendor/renderer`.
- Point Vite, Vitest, Tailwind, and i18n imports at the web-owned runtime paths.
- Rename the browser compatibility bridge folder to `runtime-bridge` while preserving the `window.electron` compatibility surface consumed by the vendored UI.
- Move runtime dependencies used by the vendored workspace UI into `@prompthub/web`.
- Remove desktop-focused root scripts and GitHub release automation.

## Compatibility

- Web keeps the existing server API and data packages.
- Existing browser storage and auth routes are unchanged.
