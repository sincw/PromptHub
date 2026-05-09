# PromptHub Web - Project Context & Development Rules

## 1. Project Overview

**PromptHub Web** is a self-hosted AI Prompt and Skill management workspace. The current repository should be treated as Web-only: `apps/web` contains the product surface, `packages/db` contains the SQLite-backed data layer, and `packages/shared` contains shared types and constants.

- **Type:** Self-hosted Web application
- **License:** AGPL-3.0
- **Version:** 0.5.5

### Tech Stack

| Category | Technology |
| :-- | :-- |
| **Server** | Hono, Node.js |
| **Frontend** | React 18, TypeScript 5, Vite 6 |
| **Styling** | Tailwind CSS 3 |
| **State** | Zustand 5 |
| **Database** | SQLite via the shared database package |
| **Testing** | Vitest, Playwright where applicable |
| **I18n** | i18next / react-i18next |
| **Package Manager** | pnpm |

## 2. Repository Layout

```text
PromptHub/
├── apps/
│   └── web/                 # Self-hosted Web app
│       ├── src/             # Hono routes, services, middleware, Web runtime bridge
│       ├── vendor/          # Web-owned UI source adapted for the browser runtime
│       └── Dockerfile       # Production image build
├── packages/
│   ├── db/                  # SQLite schema, migrations, and adapters
│   └── shared/              # Shared types and constants
├── docs/                    # Repository-facing documentation
├── website/                 # Public documentation site
└── package.json
```

## 3. Key Commands

| Command | Description |
| :-- | :-- |
| `pnpm install` | Install dependencies |
| `pnpm dev:web` | Start the Web development server |
| `pnpm build:web` | Build the Web app |
| `pnpm lint:web` | Run lint checks |
| `pnpm typecheck:web` | Run TypeScript checks |
| `pnpm test:web -- --run` | Run the Web test suite |
| `pnpm verify:web` | Run lint, type-check, tests, and build |

## 4. Development Rules

- Treat this repository as Web-only unless the user explicitly asks for legacy migration work.
- Do not reintroduce native-app setup, packaging, update, or runtime assumptions into docs or code comments.
- Prefer existing Hono route, service, store, and component patterns over new abstractions.
- Keep user-facing strings behind the existing i18n mechanism.
- Before changing shared contracts, search for all consumers across `apps/web`, `packages/db`, and `packages/shared`.
- Keep broad compatibility code only when removing it would affect imports, sync, backup, or persisted data formats.

## 5. Data And Sync Notes

- PromptHub Web stores managed data under the configured `DATA_ROOT`.
- Workspace files and SQLite indexes must stay consistent.
- Backup/import formats may still need compatibility handling for historical exports. Keep those references narrowly worded as compatibility concerns, not as active product surfaces.

## 6. Quality Gate

Run the smallest useful verification for the change. For broad edits, prefer:

```bash
pnpm lint:web
pnpm typecheck:web
pnpm test:web -- --run
```
