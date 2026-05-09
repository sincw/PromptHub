# Content Sharing

## Scenario: Share Entries and Public Share Pages

### 1. Scope / Trigger

- Trigger: Content sharing adds a cross-layer contract spanning SQLite storage, authenticated `/api/shares` routes, unauthenticated public read routes, runtime bridge calls, and import/export plus sync payloads.
- Any future change to share fields, public availability behavior, or backup shape must update this spec and the route tests.

### 2. Signatures

- DB class: `new ShareDB(db)`
- DB methods:
  - `create(data: CreateShareEntryDTO): ShareEntry`
  - `getById(id: string): ShareEntry | null`
  - `getByShareId(shareId: string): ShareEntry | null`
  - `getAll(): ShareEntry[]`
  - `update(id: string, data: UpdateShareEntryDTO): ShareEntry | null`
  - `delete(id: string): boolean`
  - `insertShareDirect(share: ShareEntry): void`
  - `search(query: ShareSearchQuery): ShareEntry[]`
  - `toPublic(shareId: string): PublicShareResponse`
- Authenticated API:
  - `POST /api/shares`
  - `GET /api/shares`
  - `GET /api/shares/:id`
  - `PUT /api/shares/:id`
  - `DELETE /api/shares/:id`
- Public API:
  - `GET /api/public/shares/:shareId`
- Backup payload:
  - `WebBackupPayload.shares: ShareEntry[]`
  - `BackupImportResult.sharesImported: number`

### 3. Contracts

- `share_entries.share_id` is the public opaque identifier. Do not expose or accept the internal `id` in public URLs.
- Public share routes must be mounted before protected `/api` middleware so unauthenticated readers can access enabled shares.
- Public responses must be one of:
  - `{ available: true, shareId, title, description, content, promptContent, sourceSnapshot, updatedAt }`
  - `{ available: false }`
- Disabled or missing shares must return only `{ available: false }`. Do not include title, description, content, notes, tags, owner IDs, or source metadata in unavailable responses.
- `content` is the reader-facing body. Prompt-origin System/User Prompt material must not be injected into `content`.
- `promptContent` is the optional Markdown field for storing combined System Prompt/User Prompt text. Prompt-origin share UIs should render this field collapsed by default.
- `sourceSnapshot` stores prompt-origin data structurally. Do not parse Markdown content to recover prompt IDs or prompt text.
- Existing shares without `promptContent` may fall back to `sourceSnapshot.systemPrompt` and `sourceSnapshot.userPrompt` for collapsed display.
- Import/export and `/api/sync/data` payloads must include `shares`, defaulting to `[]` for older payloads.

### 4. Validation & Error Matrix

- Authenticated create with missing `title` -> `422 VALIDATION_ERROR`.
- Authenticated create with empty `content` -> `422 VALIDATION_ERROR`.
- Normal user creating or changing `visibility: "shared"` -> `403 FORBIDDEN`.
- Reading another user's private share by internal `id` -> `404 NOT_FOUND`.
- Updating another user's private share -> `404 NOT_FOUND`.
- Non-admin updating a shared share -> `403 FORBIDDEN`.
- Public read of disabled share -> `200` with `{ available: false }`.
- Public read of unknown `shareId` -> `200` with `{ available: false }`.
- Quick-share with prompt context -> `content` contains only the selected conversation message; `promptContent` contains the prompt Markdown.

### 5. Good/Base/Bad Cases

- Good: A user creates an enabled share, copies `/share/:shareId`, and unauthenticated readers receive Markdown content through `/api/public/shares/:shareId`.
- Good: Quick-share from an AI test message stores `## System Prompt` and `## User Prompt` under `promptContent`, leaving `content` clean for reading.
- Base: A user creates a disabled share; the in-app detail can show metadata to the owner, but the public API returns only unavailable.
- Bad: The public route is mounted under protected middleware, causing readers to get `401`.
- Bad: A disabled public response includes `title` or `content`, leaking private material.
- Bad: Quick-share prepends System/User Prompt sections to `content`, making the public body noisy and hard to read.
- Bad: Backup export omits `shares`, causing share content to disappear during sync or restore.

### 6. Tests Required

- Route test: create enabled share, public read returns content and promptContent, disable share, public read returns exactly `{ available: false }`.
- Regression assertion: share `content` must not contain `System Prompt` when prompt text is stored in `promptContent`.
- Route test: authenticated share permissions mirror private/shared ownership rules.
- Import/export test: exported payload includes `shares`, old payloads without `shares` import as `[]`, import result includes `sharesImported`.
- Sync test: manifest/status counts include shares, `/api/sync/data` accepts and returns shares.
- Type-check web package after changing share DTOs or route schemas.

### 7. Wrong vs Correct

#### Wrong

```ts
protectedApi.route('/public/shares', publicShareRoutes);
```

This requires authentication and breaks public reader access.

#### Correct

```ts
app.route('/api/public/shares', publicShareRoutes);
app.route('/api', protectedApi);
```

Public share availability is handled by `ShareDB.toPublic`, not by auth middleware.
