# Scan Support — Design

Scans run **externally**. A scanner is a pluggable, independently deployed service (accessibility checker, link checker, LLM staleness reviewer, ...) that examines rendered pages, assets, or data entries and reports summary results back to the CMS. Per-issue detail stays in the scanner's own system, reachable via an optional link.

The API's responsibilities:

1. **Expose the facts scanners need to build their own worklists** — with indexed queries. Scheduling and prioritization policy belongs entirely to the scanner; the CMS computes no staleness judgment of its own.
2. **Store summary results** — scanner, time, status, issue count, severity breakdown, optional detail link.
3. **Display results to editors** — current results on each page/asset/data entry, plus history for trend analysis.
4. **Coordinate concurrent scanner instances** — an atomic claim mechanism so instances of the same scanner don't duplicate work.

## Principles

- **The scanner owns policy; the CMS owns facts.** The CMS stores what the scanner tells it (including the scanner's own stated next-visit date) but never computes a schedule, priority, or "needs scanning" judgment.
- **Scanners keep no scheduling state.** Everything a scanner needs to decide what to scan next — last scan time, target modification/publish times, its own scheduled follow-ups — is queryable from the CMS, so the simplest scanner can be a cron job with credentials. Scanners may well keep their own state for other purposes, most obviously a record of each scan's detailed findings backing the `detailUrl` pages.
- **Scan targets are pages, assets, and data entries**, in **primary and sandbox** pagetrees. Pre-launch checking of sandboxes is a core use case; it is up to the scanner to realize it's scanning a sandbox and behave accordingly (fetch the preview render with its service credentials, filter by `pagetreeTypes` rather than `live`). Archives are not scannable.
- **Severity vocabularies belong to scanners.** Each scanner reports its own labels (axe: critical/serious/moderate/minor; linkcheck: broken/redirect) plus a normalized level for cross-scanner sorting. The CMS doesn't validate vocabulary; consistency across a scanner's submissions is the scanner's responsibility.

## Data model

Separate tables per target type (no polymorphic multi-FK tables — mostly-NULL id columns wreck MySQL's index cardinality estimates). `pagescans` shown in full; `assetscans` and `datascans` are identical except for the target column, and `datascans` has no `scannedUrl` (data has no fetchable render).

```sql
CREATE TABLE scanners (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) CHARACTER SET 'ascii' NOT NULL,  -- machine key = the scanner's JWT client_id
  displayName VARCHAR(255) NOT NULL,                 -- defaults to name
  hidden TINYINT UNSIGNED NOT NULL DEFAULT 0,        -- retire from UI without losing history
  scansPages TINYINT UNSIGNED NOT NULL DEFAULT 1,    -- which target types this scanner handles,
  scansAssets TINYINT UNSIGNED NOT NULL DEFAULT 0,   --   so the UI knows where to offer it
  scansData TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE INDEX name_UNIQUE (name)
);

CREATE TABLE pagescans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,                -- FK pages.id (internal id)
  scannedAt DATETIME NOT NULL,                 -- when the scanner fetched the content
  nextScanAt DATETIME,                         -- scanner-set due date for its next visit
  scannedVersion MEDIUMINT UNSIGNED,           -- provenance: recreate scanned state from versioned storage
  status TINYINT UNSIGNED NOT NULL,            -- SUCCESS / ERROR / PARTIAL
  issueCount SMALLINT UNSIGNED NOT NULL,
  summary VARCHAR(255),                        -- scanner's one-liner, surfaced in the UI
  detailUrl VARCHAR(1024),
  scannedUrl VARCHAR(1024),                    -- the URL the scanner actually fetched
  current TINYINT UNSIGNED NOT NULL DEFAULT 1, -- one current row per (scanner, target),
                                               --   maintained transactionally on insert
  PRIMARY KEY (id),
  INDEX scanner_page (scannerId, pageId, scannedAt),  -- history + latest lookup
  INDEX page_current (pageId, current),               -- dataloader: current scans for a page
  INDEX scanner_time (scannerId, current, scannedAt), -- scannedBefore filter
  INDEX scanner_due (scannerId, current, nextScanAt), -- dueBefore filter
  INDEX scanner_issues (scannerId, current, issueCount), -- hasIssues report filter
                                               -- (minLevel probes the severity child
                                               --   table via its primary key)
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id)
);

-- Severity breakdown: child table per scan table (pagescan_severities,
-- assetscan_severities, datascan_severities) so site-level rollups and
-- severity-level trends stay plain SQL.
CREATE TABLE pagescan_severities (
  pagescanId INT UNSIGNED NOT NULL,
  severity VARCHAR(32) NOT NULL,               -- scanner-defined label
  level TINYINT UNSIGNED NOT NULL,             -- normalized 1-5, 5 = most severe
  count SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (pagescanId, severity),
  FOREIGN KEY (pagescanId) REFERENCES pagescans (id) ON DELETE CASCADE
);

-- Claims: ephemeral coordination between instances of the same scanner.
-- One claim table per target type (pagescanclaims, assetscanclaims,
-- datascanclaims). Rows are taken over when expired and deleted when the
-- scan is recorded; a crashed instance's claims evaporate on their own.
CREATE TABLE pagescanclaims (
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,
  claimedAt DATETIME NOT NULL,                 -- also the default scannedAt when the
                                               --   scanner omits it in recordScans
  expiresAt DATETIME NOT NULL,                 -- claimedAt + expectedDuration (sanity-capped)
  PRIMARY KEY (scannerId, pageId),
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id)
);
```

## GraphQL schema

```graphql
type Scanner {
  id: ID!
  name: String!
  displayName: String!
  scansPages: Boolean!
  scansAssets: Boolean!
  scansData: Boolean!
}

enum ScanStatus { SUCCESS ERROR PARTIAL }

type SeverityCount {
  severity: String!   # scanner's own label
  level: Int!         # normalized 1-5 (5 = most severe) for cross-scanner sorting/coloring
  count: Int!
}

# One Scan type serves all three parents — the parent provides target context.
type Scan {
  scanner: Scanner!
  scannedAt: DateTime!   # when the scanner fetched the content
  nextScanAt: DateTime   # scanner's own stated return date, if it set one
  scannedVersion: Int    # version of the target that was scanned (provenance)
  status: ScanStatus!
  issueCount: Int!
  severities: [SeverityCount!]!
  summary: String        # scanner's one-liner: what it found / how the scan went
  detailUrl: String
  stale: Boolean!        # convenience: target modifiedAt > scannedAt
}

# `scans` returns CURRENT scans (one per scanner) — the common display path.
# `scanHistory` serves trend analysis, explicitly scoped to one scanner.
extend type Page  {
  scans(scanners: [String!]): [Scan!]!
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

# Scan-relative conditions, added to PageFilter, AssetFilter, and DataFilter
# and composing with each type's existing filters (live, siteIds,
# pagetreeTypes...). Serves two audiences: scanners building worklists, and
# the admin UI building reports ("pages with serious accessibility issues").
# These exist as filters (rather than client-side comparisons) because
# scan-relative conditions are JOIN conditions a caller cannot compose from
# separate queries, and they need index support.
#
# Each entry matches targets against the CURRENT scans of the named scanners
# (any scanner when scannerNames is omitted). Within an entry, the worklist
# facts are OR'ed (each is a "reason" a scanner might care about a target);
# the issue conditions are AND'ed with that group and each other. Entries in
# the filter array are AND'ed together, so "has axe issues AND never
# link-checked" is expressible.
input ScanFilter {
  scannerNames: [String!]      # limit to these scanners' scans; omit for any scanner

  # worklist facts (OR'ed)
  neverScanned: Boolean        # no scan row (by the named scanners / by anyone)
  scannedBefore: DateTime      # current scan older than X (time backstop)
  modifiedSinceScan: Boolean   # target modifiedAt > scannedAt
  publishedSinceScan: Boolean  # target publishedAt > scannedAt
  dueBefore: DateTime          # scanner-set nextScanAt <= X

  # issue conditions (AND'ed) — for reports
  hasIssues: Boolean           # true: current scan has issueCount > 0;
                               #   false: scanned and clean (issueCount = 0)
  minLevel: Int                # only count severities with level >= this
                               #   (implies hasIssues: true when set alone)
}
# pages(filter: { scans: [{ ... }], live: true })
# assets(filter: { scans: [{ ... }] })
# data(filter: { scans: [{ ... }] })

extend type Mutation {
  # Requires the scans grant AND scanner === ctx.auth.clientId.
  # Implicitly creates the scanner row on first use.
  recordScans(scanner: String!, results: [ScanResultInput!]!): ValidatedResponse!

  # Atomic claim — same auth as recordScans. Returns the subset of targets
  # actually granted; the rest are validly claimed by a sibling instance.
  claimScans(scanner: String!, targets: [ScanTargetInput!]!, expectedDuration: Int!): ClaimScansResponse!

  # Admin mutations: grant only, no clientId match.
  updateScanner(scanner: String!, displayName: String, hidden: Boolean): ValidatedResponse!
  deleteScanner(scanner: String!): ValidatedResponse!   # removes scanner + all its scans
}

input SeverityCountInput { severity: String!, level: Int!, count: Int! }

input ScanTargetInput {
  pageId: ID       # exactly one of pageId/assetId/dataId (validated)
  assetId: ID
  dataId: ID
}

input ScanResultInput {
  pageId: ID       # exactly one of pageId/assetId/dataId (validated)
  assetId: ID
  dataId: ID
  status: ScanStatus!
  severities: [SeverityCountInput!]!
  summary: String        # optional one-liner (<255 chars): types of problems found,
                         #   or anything useful about how the scan went
  detailUrl: String
  scannedUrl: String
  scannedAt: DateTime    # when the content was fetched; defaults to the claim time
                         #   for this (scanner, target), or now if unclaimed
  nextScanAt: DateTime   # scanner schedules its own follow-up (e.g. an LLM staleness
                         #   scanner books a rescan for the day after a due date it noticed)
  scannedVersion: Int    # version the scanner fetched; defaults to the target's current
                         #   published version (latest version for sandbox targets)
}

type ClaimScansResponse {   # extends ValidatedResponse
  granted: [ScanTarget!]!   # echoes the granted targets with their expiresAt
}
```

## Behavior

### Scanner flow

1. Query candidates: `pages(filter: { scans: [{ scannerNames: ["me"], ...facts }], live: true })` (or assets/data).
2. `claimScans(scanner, targets, expectedDuration)` — scan the granted subset; siblings hold the rest.
3. Fetch and scan each target's rendered content.
4. `recordScans(scanner, results)` — records results, flips the `current` flag, clears claims.

### Recording

- **Every attempt gets a row.** A clean target records with `issueCount: 0` (that's the "recently scanned" signal); a fetch failure or timeout records with `status: ERROR` so failures neither retry forever nor masquerade as clean.
- **`summary`** is the scanner's optional one-liner, displayed alongside the counts — the kinds of problems found ("3 broken links, 2 redirect chains"), or anything useful about how the scan went (especially with `status: ERROR`, e.g. "render timed out after 30s"). Plain text, max 255 chars, truncated not rejected.
- **`scannedAt` is content fetch time.** The `modifiedSinceScan` comparison depends on this, so it must not drift toward posting time. Scanners may supply it (validated against server clock); when omitted, the server uses the target's **claim time** — the natural fetch-time approximation, since fetching happens right after claiming while results may be posted in a batch much later. If there's no live claim, it falls back to now.
- **Partial success**: each result in a batch is processed independently; invalid entries (archived target, target deleted between fetch and post, malformed input) produce per-result validation messages without failing the rest of the batch.
- **Archives rejected.** Results targeting ARCHIVE pagetrees are refused. Scans already recorded on pages whose pagetree later becomes an archive are kept as harmless history.
- Each insert clears the previous `current` row for that (scanner, target) in the same transaction.
- `detailUrl` is sanitized (it renders as a clickable link — no `javascript:` etc.).

### Claiming

- `expiresAt = now + expectedDuration` (seconds, sanity-capped so a typo can't lock a site for a year).
- Grant-or-refuse is decided row-by-row in one transaction: insert the claim, or take it over only if the existing claim has expired. A batch can be partially granted.
- Expired claims need no cleanup — they're simply claimable by the next caller.
- Claims are scoped per scanner: different scanners never block each other. Never displayed; not part of scan history.

### Scheduling facts, not policy

`nextScanAt` lets a scan result schedule the scanner's own follow-up — e.g. an LLM staleness scanner that notices "applications due March 1" on a page and books a rescan for March 2. The CMS stores and displays the date and exposes it via the `dueBefore` filter; it never computes one. The UI presents it as the scanner's stated intent, not a CMS promise. Richer scanner state than one date belongs in the scanner.

### Provenance

`scannedVersion` records which version of the target was scanned so the scanned state can be recreated from versioned storage (asset version data includes the shasum, so the exact binary is recoverable too). Versioned storage's retention policy deletes old untagged versions, so reconstruction is best-effort: **if the scanned version has been pruned, the recreate code falls back to the oldest version still retained.** Scanned versions are not pinned/tagged — version retention stays intact. The UI should indicate when it's showing the fallback rather than the exact scanned version.

### History & retention

- Full scan history is kept per (scanner, target) for trend analysis, with a `current` flag marking the latest row.
- **Retention: last 10 scans or 1 year, whichever is greater.** A row is deleted only when it is BOTH older than 1 year AND not among the 10 most recent for its (scanner, target). An infrequent scanner keeps its full last-10 however old; a nightly scanner keeps a year's worth; the current row is never eligible. Severity child rows cascade-delete with their scan row (`ON DELETE CASCADE`). Enforced by a scheduled cleanup job (existing scheduler: `src/util/scheduler.ts`).

### Authorization

- **Recording/claiming**: one new global grant, plus the JWT's `client_id` must equal the scanner name. Scanner A's token cannot write or clobber scanner B's results, with zero per-scanner grant administration. Service tokens already carry `client_id`, and the mutation log already records it, so audit attribution comes free. A human admin holding the grant (a `sub`, no `client_id`) cannot record scans — correct by construction.
- **Registry management** (`updateScanner`/`deleteScanner`): the grant alone, no clientId match, so admins can manage scanners they don't own.
- **Viewing**: piggybacks on each target type's existing view permissions — no new grant.
- The same service token serves both halves of a scanner's job: fetching sandbox preview renders and posting results.

### Scanner registry

Registration is implicit: the first `recordScans` from a new clientId creates the scanner row (no spoofing concern — the name is the authenticated clientId). `displayName` defaults to the name; the `scansPages`/`scansAssets`/`scansData` flags can be inferred from what the scanner submits or set via `updateScanner`. Retirement: `updateScanner(hidden: true)` keeps history out of the UI; `deleteScanner` removes the scanner and all its scan rows.

### Pagetree semantics

Pagetree promotion only changes the pagetree's `type` — page rows are untouched — so **sandbox scan history rides along through promotion**: pre-launch scan results automatically become the live pages' scan record. Scans on deleted/orphaned targets fall out of display and rollups via the standard `deleteStates` filtering. The UI should label scan results with the target's pagetree context so sandbox results aren't mistaken for live-site results.

## Deferred

- Site/folder-level rollup queries for dashboards (severity child tables keep this a GROUP BY over `current` rows).
- Trend display UI — the data is there (`scanHistory`); chart design is a front-end question.
- Asset metadata edits (alt text, title) trip `modifiedSinceScan` just like binary replacement; if a scanner ever cares only about binary changes, a `scannedShasum` column on assetscans could be added as another filterable fact.
- `modifiedAt` lives on `storage.modified` and `publishedAt` on the version `tags` table — verify the scan-relative filter JOINs perform acceptably or add indexes there.
- Editor-facing "request rescan now" button — would need a signal to scanners; a `rescanRequestedAt` column would be an easy hook if wanted.
