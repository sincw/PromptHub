# Web Delta Spec

## Added Requirements

- `apps/web` must build, typecheck, test, and package without reading from `apps/desktop`.
- Web workspace UI runtime assets must live under the web app or shared packages.
- Root workspace scripts must default to web development and verification.

## Removed Requirements

- The repository no longer needs to preserve Electron desktop app build or release flows.
