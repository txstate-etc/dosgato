# Scan Support — Design Plan

Scans run **externally** (pluggable scanners: accessibility, link checking, etc.) and may target **pages, assets, or data entries** (see D10). The API's job is:

1. Help scanners find targets that need (re)scanning.
2. Store summary results: scanner name, issue count, severity breakdown, optional detail link.
3. Display those summaries to editors.

Per-issue detail stays in the external system behind `detailUrl`.

Each decision below has options and a recommendation. Mark decisions as they're made.

---

## Decisions

### D1. Staleness definition — what makes a target "need scanning"?

- [ ] (a) Time only — rescan when `scannedAt` older than a cutoff.
- [ ] (b) Content marker + time — record `scannedVersion`/`scannedShasum`; rescan when content changed since last scan OR past the time cutoff.
- [x] **(c) Scanner decides; CMS provides facts + indexed queries** — scheduling and prioritization are the scanner's job. The CMS exposes the queryable facts (`scannedAt`, `modifiedAt`, `publishedAt`, and scanner-set `nextScanAt`) and indexed filters over them, but computes no staleness policy of its own.

**Decision: (c).** Consequences:

- **`nextScanAt`** — nullable DATETIME on each scan row, set by the scanner in `recordScans`. Lets scanners be stateless (a scan result can schedule the follow-up, e.g. an LLM staleness scanner that sees a due date on the page and books a rescan for the day after) and gives the UI a "next scheduled scan" display. Guardrail against overengineering: the CMS **stores** the date, it never **computes** one — no recurrence rules, priorities, or default schedules. Richer scanner state stays in the scanner. Display it as scanner-provided intent, not a CMS promise.
- **`scannedVersion` kept — but for provenance, not policy.** Staleness queries stay timestamp-based (`modifiedAt > scannedAt`); the version number is stored so the exact content that was scanned can be recreated from versioned storage (for assets, the version data includes the shasum, so the binary is recoverable too). Scanners echo back the version they fetched; if omitted, the server records the current published version at recording time (slightly skewed if the target republished mid-scan). No `scannedShasum` needed — the version covers it. Versioned storage's retention policy deletes old untagged versions, so reconstruction is best-effort: **if `scannedVersion` has been pruned, the recreate code falls back to the oldest version still retained** (the closest surviving approximation). No pinning/tagging of scanned versions — retention stays intact.
- Scanners must report `scannedAt` as the time they **fetched** the content, not when they posted results.
- **Scan-relative filters are OR-able facts** (see GraphQL sketch): never scanned, scanned before X, modified/published since last scan, `nextScanAt` due. "Modified since its last scan" is a JOIN condition, so it must be a filter — scanners can't compose it from separate queries.
- `modifiedAt`/`publishedAt` already exist on Page (from `storage.modified` and the `published` version tag) but are display-only today — the scan-relative filters make them queryable relative to scans.

### D2. History vs. latest-only

- [ ] (a) Latest-only — unique index per (scanner, target), `recordScans` is an upsert. Simple, bounded.
- [x] **(b) Keep history** — enables trend analysis ("40 → 12 → 3 issues over the semester").

**Decision: (b) keep history.** Consequences:

- No unique (scanner, target) index. `recordScans` inserts a new row and maintains a **`current` flag** in the same transaction (clear the old current row, insert the new one with current=1). The flag keeps dataloaders ("current scans for these pages") and the scan-relative filter JOINs (comparisons run against the current scan only) simple and indexed — no window functions in hot paths.
- `nextScanAt` is meaningful on the current row only.
- **Retention: last 10 scans or 1 year, whichever is greater.** A row is deleted only when it is BOTH older than 1 year AND not among the 10 most recent for its (scanner, target) — so an infrequent scanner keeps its full last-10 however old, and a nightly scanner keeps a year's worth. The current row is among the 10 most recent by definition, so it's never eligible. Severity child rows delete with their scan row. Enforce in a scheduled cleanup job (there's an existing scheduler at `src/util/scheduler.ts`).
- GraphQL: the `scans` fields return current scans; history is a separate field (see sketch) so trend queries are explicit and the common display path stays cheap.

### D3. Severity taxonomy

- [x] **(a) Scanner-defined labels + normalized level** — each severity row is `{ severity: 'serious', level: 4, count: 12 }`. Scanners keep their own vocabulary (axe: critical/serious/moderate/minor; linkcheck: broken/redirect); `level` (1–5) gives cross-scanner sorting/coloring.
- [ ] (b) Fixed shared enum — simpler UI, but forces every scanner into one vocabulary.

**Decision: (a).** Scanners send their own severity labels plus a normalized `level` 1–5 (5 = most severe) with every count. The UI sorts and colors by `level`, displays the scanner's label. Consistency of labels/levels across a scanner's own submissions is the scanner's responsibility — the CMS doesn't validate vocabulary.

### D4. Severity storage

- [x] **(a) Child table** — enables SQL rollups ("critical issues per site") and severity-level trend queries. With D10(b) separate scan tables, this means three child tables (`pagescan_severities`, `assetscan_severities`, `datascan_severities`); with D2(b) history, severity rows multiply with history — rollups filter `current=1`, trend queries filter by scanner/target.
- [ ] (b) JSON column on each scan table — one less join and no tripled child tables, but rollups and severity-level trend queries get ugly.

**Decision: (a) child tables.** Severity rows delete with their scan row under the D2 retention job.

### D5. Queue exposure in GraphQL

- ~~(a) `needsScan` filter on existing queries~~ / ~~(b) dedicated `scanQueue` root query~~

**Decision: superseded by D1(c) — there is no CMS queue.** Scanners build their own worklists from facts, so the API just adds **scan-relative filters** to the existing `pages` / `assets` / `data` queries (mirroring the `lastIndexedBefore` precedent, composing with `live`, `siteIds`, `pagetreeTypes`, ...). The filter conditions are OR'ed facts, not a "needs scanning" judgment. The only reason these are filters at all (rather than the scanner comparing fields client-side) is that scan-relative comparisons like "modified since its last scan by X" are JOIN conditions the scanner can't compose from separate queries — and they need index support server-side.

### D6. Which targets are scannable? (sandbox scanning)

With D1(c)/D5 the scanner already chooses its own scope via filters (`live: true`, `pagetreeTypes`, ...), so this is really: does the CMS **accept and display** scan results for non-live targets?

- [ ] (a) Live/published only.
- [x] **(b) Primary AND sandbox — not archives.** Pre-launch accessibility checks on sandboxes are a core use case.

**Decision: primary and sandbox pagetrees; archives rejected.** Details:

- It is **up to the scanner to realize it's scanning a sandbox** and behave accordingly (fetch the preview render with service credentials rather than a launched URL, choose appropriate filters like `pagetreeTypes` instead of `live: true`, use `modifiedSinceScan` since sandbox content isn't published in the live sense).
- `recordScans` rejects results targeting ARCHIVE pagetrees. Scans already recorded on pages whose pagetree later becomes an archive are kept — harmless history, normal retention applies.
- `scannedVersion` default for sandbox targets falls back to the latest version (there may be no published version).
- **Promotion bonus** (verified: `promotePagetree` only updates `pagetrees.type`; page rows are untouched): sandbox scan rows ride along through promotion, so pre-launch scan results and history automatically become the live pages' scan record. A newly promoted site is NOT "never-scanned" as long as its sandbox was being scanned.
- UI should label scan results with the target's pagetree context so sandbox results aren't mistaken for live-site results.

### D7. Scanner identity & authorization

- [x] **(a) One global grant + load-bearing clientId** — a single new grant on globalrules, but `recordScans` additionally requires the JWT's `client_id` to **match the scanner name**.
- [ ] (b) Per-scanner grants — unnecessary given the clientId rule.

Viewing: piggyback on each target type's view permission (no new grant).

**Decision: one global grant, clientId must equal scanner name.** Details:

- Service tokens already carry `client_id` and the Context exposes it (`ctx.auth.clientId`; the mutation log already records `auth.sub ?? auth.client_id`, so scanner attribution in the audit trail comes free).
- `recordScans(scanner: ...)` validates `scanner === ctx.auth.clientId` (explicit arg kept as a misconfiguration check rather than silently derived). Scanner A's token cannot write or clobber scanner B's results, with zero per-scanner grant administration.
- A human admin holding the grant (a `sub`, no `client_id`) therefore cannot record scans — correct by construction. Registry-management mutations (D8: hide/delete scanner) should require the grant WITHOUT the clientId match, so admins can manage scanners they don't own.
- Sandbox render fetching (D6) can use the same service token — one credential per scanner for both fetching previews and posting results.

### D8. Scanner registry lifecycle

- [x] **(a) Implicit registration** — first `recordScans` with a new name creates the scanner row; `hidden` flag + `deleteScanner`/`clearScans` mutation for retirement.
- [ ] (b) Explicit registration mutation — unnecessary; D7's clientId rule means the name is already authenticated, so there's nothing to vet.

**Decision: (a) implicit.** The scanner row is created on first `recordScans` (name = clientId per D7, so no spoofing concern; `displayName` defaults to the name, and scanner-supplied metadata like `scansPages`/`scansAssets`/`scansData` can be inferred from what it actually submits or set via an update mutation later). Retirement is admin-side: `updateScanner` (rename displayName, hide) and `deleteScanner` (removes scanner + all its scan rows) require the grant without the clientId match.

### D9. Concurrency between scanner instances

- [ ] (a) Punt — duplicate scans are wasted work, not corruption.
- [x] **(b) Atomic claim mutation with scanner-supplied lease duration.**

**Decision: (b).** A `claimScans` mutation atomically claims a batch of targets for a scanner. The caller passes `expectedDuration` (seconds a scan should reasonably take); the claim expires at `now + expectedDuration`, and **expired claims are simply claimable by others** — no cleanup dependency, a crashed instance's claims evaporate on schedule. Details:

- **Flow**: instance queries candidates via the scan-relative filters → `claimScans(scanner, targets, expectedDuration)` → response lists which targets were **granted** (others are already validly claimed by a sibling) → instance scans the granted set → `recordScans` clears each claim as it records.
- **Atomicity per target**: claim tables keyed `PRIMARY KEY (scannerId, targetId)`; grant-or-refuse decided row-by-row in one transaction (insert, or take over only if the existing claim has expired). A batch can be partially granted.
- The scan-relative filters don't need an "unclaimed" condition: the granted list already partitions work between siblings. Racing instances just see fewer grants.
- Claims are ephemeral coordination state — per-scanner (scoped by scannerId; different scanners never block each other), never displayed, not part of scan history. `expectedDuration` gets a sanity cap so a typo can't lock a site for a year.
- Auth: same rule as `recordScans` (grant + clientId match, D7).

### D10. Scan targets — pages, assets, data entries

Scans may apply to assets (e.g. PDF accessibility) and data entries, not just pages. How to model the polymorphic target?

- [ ] **(a) One `scans` table with three nullable FKs** — `pageId` / `assetId` / `dataId` columns, exactly one non-null (app-enforced). One service/upsert/mutation path, but mostly-NULL id columns wreck MySQL's index cardinality estimates.
- [x] **(b) Separate tables per target** (`pagescans`, `assetscans`, `datascans`) — matches the `pagerules`/`assetrules`/`datarules` precedent and allows per-type columns (scannedVersion vs. scannedShasum); more boilerplate but healthy indexes.
- [ ] **(c) `targetType` + `targetId` columns** — compact, but no FK integrity and awkward joins. Not recommended.

Notes regardless of choice:
- **Data entries have no fetchable URL** — a data scanner pulls content via the API rather than fetching a render. `scannedUrl` is null for data; that's fine.
- Scanner registry could declare which target types a scanner handles (`scansPages`/`scansAssets`/`scansData` or a set), so the UI knows not to offer an axe column on assets. Cheap to add; recommended.

**Decision: (b) separate tables.** Mostly-NULL id columns give MySQL trouble counting index cardinality, so avoid tables with multiple ids where only one is non-null. GraphQL layer still presents a single `Scan` type and one `recordScans` mutation; the service routes each result to the right table.

---

## Settled requirements (not decisions)

- **Zero-issue scans get a row** — a clean target is still "recently scanned."
- **Failed scans get a row** — `status` column (SUCCESS / ERROR / PARTIAL) so failures don't retry forever at the front of the queue or masquerade as 0 issues.
- **Scans on deleted/unpublished/orphaned targets** fall out of display and rollups via the standard `deleteStates` / `live` filtering.
- **Batch recording** — one mutation accepts many results; no round trip per target.
- **Partial success** — `recordScans` processes each result independently; invalid entries (archived target per D6, target deleted between fetch and post, malformed input) produce per-result validation messages (ValidatedResponse arg paths) without failing the rest of the batch.
- **Sanitize `detailUrl`** — rendered as a clickable link; reject `javascript:` etc.
- **Record the URL actually fetched** (`scannedUrl`) for debugging where applicable (pages, assets; null for data); `scannedAt` is the content **fetch** time, supplied by the scanner (validated against server clock, defaults to now) — the modifiedAt-vs-scannedAt comparison depends on it.
- **Keep the door open** for a future `scan_issues` child table (scans has its own PK), but per-issue detail stays external for now.

---

## Data model sketch (reflects current recommendations)

```sql
CREATE TABLE scanners (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) CHARACTER SET 'ascii' NOT NULL,  -- machine key sent by the scanner
  displayName VARCHAR(255) NOT NULL,
  hidden TINYINT UNSIGNED NOT NULL DEFAULT 0,
  scansPages TINYINT UNSIGNED NOT NULL DEFAULT 1,    -- D10: which target types this scanner handles
  scansAssets TINYINT UNSIGNED NOT NULL DEFAULT 0,
  scansData TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE INDEX name_UNIQUE (name)
);

-- D10(b): one table per target type. Common columns:
--   scannedAt DATETIME NOT NULL
--   status TINYINT UNSIGNED NOT NULL             -- SUCCESS / ERROR / PARTIAL
--   issueCount SMALLINT UNSIGNED NOT NULL
--   detailUrl VARCHAR(1024)

CREATE TABLE pagescans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,                -- FK pages.id (internal id)
  scannedAt DATETIME NOT NULL,                 -- when the scanner FETCHED the content (D1)
  nextScanAt DATETIME,                         -- D1: scanner-set due date for its next visit
  scannedVersion MEDIUMINT UNSIGNED,           -- D1: provenance — recreate scanned state from
                                               --   versioned storage (all three tables)
  status TINYINT UNSIGNED NOT NULL,
  issueCount SMALLINT UNSIGNED NOT NULL,
  detailUrl VARCHAR(1024),
  scannedUrl VARCHAR(1024),
  current TINYINT UNSIGNED NOT NULL DEFAULT 1, -- D2(b): one current row per (scanner, target),
                                               --   maintained transactionally on insert
  PRIMARY KEY (id),
  INDEX scanner_page (scannerId, pageId, scannedAt),  -- history + latest lookup
  INDEX page_current (pageId, current),               -- dataloader: current scans for a page
  INDEX scanner_time (scannerId, current, scannedAt), -- scannedBefore filter
  INDEX scanner_due (scannerId, current, nextScanAt), -- dueBefore filter
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id)
);

CREATE TABLE assetscans (
  -- same shape, except:
  assetId INT UNSIGNED NOT NULL,               -- FK assets.id
  INDEX scanner_asset (scannerId, assetId, scannedAt)
);

CREATE TABLE datascans (
  -- same shape, except:
  dataId INT UNSIGNED NOT NULL,                -- FK data.id
  -- no scannedUrl: data has no fetchable render
  INDEX scanner_data (scannerId, dataId, scannedAt)
);

-- D9: claim table per target type (shown for pages; assets/data identical).
-- Ephemeral coordination state: rows are taken over when expired, deleted by
-- recordScans. Claim = INSERT, or UPDATE only where expiresAt < NOW(), in one
-- transaction; the granted set is whatever ends up owned by the caller.
CREATE TABLE pagescanclaims (
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,
  expiresAt DATETIME NOT NULL,               -- now + expectedDuration (capped)
  PRIMARY KEY (scannerId, pageId),
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id)
);

-- D4(a): child severity table per scan table (shown for pages; assets/data identical)
CREATE TABLE pagescan_severities (
  pagescanId INT UNSIGNED NOT NULL,
  severity VARCHAR(32) NOT NULL,               -- D3(a): scanner-defined label
  level TINYINT UNSIGNED NOT NULL,             -- normalized 1-5, 5 = most severe
  count SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (pagescanId, severity),
  FOREIGN KEY (pagescanId) REFERENCES pagescans (id)
);
```

## GraphQL sketch (reflects current recommendations)

```graphql
type Scanner {
  id: ID!
  name: String!
  displayName: String!
  scansPages: Boolean!    # D10: UI knows which columns to offer per target type
  scansAssets: Boolean!
  scansData: Boolean!
}

enum ScanStatus { SUCCESS ERROR PARTIAL }

type SeverityCount {
  severity: String!   # scanner's own label
  level: Int!         # normalized 1-5 (5 = most severe) for cross-scanner sorting/coloring
  count: Int!
}

# One Scan type reused from all three parents — the parent provides target
# context, and the fields are identical across target types.
type Scan {
  scanner: Scanner!
  scannedAt: DateTime!   # when the scanner fetched the content
  nextScanAt: DateTime   # D1: scanner's own stated return date, if it set one
  scannedVersion: Int    # version of the target that was scanned (provenance)
  status: ScanStatus!
  issueCount: Int!
  severities: [SeverityCount!]!
  detailUrl: String
  stale: Boolean!        # convenience: target modifiedAt > scannedAt
}

# `scans` returns CURRENT scans (one per scanner) — the common display path.
# `scanHistory` exposes D2(b) history for trend analysis, explicitly scoped
# to one scanner so the common path stays cheap.
extend type Page  {
  scans(scanners: [String!]): [Scan!]!         # dataloaders by parent id
  scanHistory(scanner: String!, since: DateTime): [Scan!]!
}
extend type Asset {
  scans(scanners: [String!]): [Scan!]!
  scanHistory(scanner: String!, since: DateTime): [Scan!]!
}
extend type Data  {
  scans(scanners: [String!]): [Scan!]!
  scanHistory(scanner: String!, since: DateTime): [Scan!]!
}

extend type Query {
  scanners: [Scanner!]!
}

# D5: same scan-relative filter shape added to PageFilter, AssetFilter, and
# DataFilter; composes with each type's existing filters. All comparisons are
# against the scanner's CURRENT scan of the target (D2).
# D1(c): the conditions below are OR'ed facts — the scanner picks which ones
# matter to it and builds its own worklist; the CMS applies no policy.
input ScanFilter {
  scannerName: String!
  neverScanned: Boolean        # no scan row for this scanner yet
  scannedBefore: DateTime      # current scan older than X (time backstop)
  modifiedSinceScan: Boolean   # target modifiedAt > scannedAt (JOIN condition,
                               #   can't be composed by the scanner itself)
  publishedSinceScan: Boolean  # target publishedAt > scannedAt
  dueBefore: DateTime          # scanner-set nextScanAt <= X
}
# pages(filter: { scans: { ... }, live: true })
# assets(filter: { scans: { ... } })
# data(filter: { scans: { ... } })

extend type Mutation {
  # D7: requires the scans grant AND scanner === ctx.auth.clientId.
  # D8: implicitly creates the scanner row on first use.
  recordScans(scanner: String!, results: [ScanResultInput!]!): ValidatedResponse!

  # D9: atomic claim — same auth as recordScans. Returns the subset of targets
  # actually granted; the rest are validly claimed by a sibling instance.
  # expectedDuration in seconds (sanity-capped); claims expire on their own.
  claimScans(scanner: String!, targets: [ScanTargetInput!]!, expectedDuration: Int!): ClaimScansResponse!

  # D8 admin mutations: grant only, no clientId match
  updateScanner(scanner: String!, displayName: String, hidden: Boolean): ValidatedResponse!
  deleteScanner(scanner: String!): ValidatedResponse!   # removes scanner + all its scans
}

input ScanTargetInput {
  pageId: ID       # exactly one of pageId/assetId/dataId (validated)
  assetId: ID
  dataId: ID
}

type ClaimScansResponse {   # extends ValidatedResponse
  granted: [ScanTarget!]!   # echoes the granted targets with their expiresAt
}

input SeverityCountInput { severity: String!, level: Int!, count: Int! }

input ScanResultInput {
  pageId: ID       # exactly one of pageId/assetId/dataId (validated)
  assetId: ID
  dataId: ID
  status: ScanStatus!
  severities: [SeverityCountInput!]!
  detailUrl: String
  scannedUrl: String
  scannedAt: DateTime    # when the content was fetched; defaults to now
  nextScanAt: DateTime   # D1: scanner schedules its own follow-up (e.g. LLM
                         #   staleness scanner books a rescan after a page's due date)
  scannedVersion: Int    # version the scanner fetched; defaults to the target's
                         #   current published version at recording time
}
```

## Open questions / later

- Site/folder-level rollup queries for dashboards (child severity table keeps this a GROUP BY).
- Asset **metadata** edits (alt text, title) trip `modifiedSinceScan` just like binary replacement. If a scanner only cares about binary changes, a `scannedShasum` column on assetscans could return as an additive queue condition later.
- `modifiedAt` lives on `storage.modified` and `publishedAt` on the version `tags` table — verify the scan-relative filter JOINs perform acceptably or add indexes there.
- Trend display UI — the data is there (`scanHistory` field, D2); chart design is a front-end question.
- Editor-facing "request rescan now" button? (Would need a way to signal scanners — out of scope for the pull-based model, but a `rescanRequestedAt` column would be an easy hook.)
