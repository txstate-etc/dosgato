# Scan Support — Design

Scans run **externally**. A scanner is a pluggable, independently deployed service (accessibility checker, link checker, LLM staleness reviewer, ...) that examines pages, assets, or data entries and reports results back to the CMS. Each result is a scan summary plus a list of **findings**: individual problems, each pointing at the component it's about, with a short message. Anything deeper than that (screenshots, rule documentation, full reports) stays in the scanner's own system, reachable via an optional link.

The API's responsibilities:

1. **Expose the facts scanners need to build their own worklists** — with indexed queries. Scheduling and prioritization policy belongs entirely to the scanner; the CMS computes no staleness judgment of its own.
2. **Store results** — scanner, time, status, summary counts, and located findings, with history.
3. **Show findings to editors** — badges on pages, an issues list in the admin dashboard, and highlighted components in the page editor, where an editor can mark a finding as still good or dismiss it.
4. **Keep findings stable across rescans** — so an editor's response, and a finding's activation date, survive edits to unrelated parts of the page.
5. **Coordinate concurrent scanner instances** — an atomic claim mechanism so instances of the same scanner don't duplicate work.

## The motivating case

Broken links and WCAG warnings are the easy cases. The one that shaped most of this design is a **staleness scanner**. After a page is edited (with a 24-hour debounce), it asks an LLM to find content likely to go stale quickly, like step-by-step instructions for third-party software that will eventually get a UI update. The LLM suggests an expiration date for each piece it finds. Once a date passes, the page gets an alert icon and shows up in the dashboard's issues list. In the editor, each flagged component is highlighted until someone marks it as still good or edits it.

Nothing in the API is staleness-specific, though. The same machinery serves explicit-date extraction ("Register by March 1"), annual figures like tuition, mandatory yearly reviews, axe results that need a human to verify them, link checks against sites that block bots, and LLM checks on alt text quality or style guide compliance. We'll come back to the staleness scanner as the running example.

## Principles

- **The scanner owns policy; the CMS owns facts.** The CMS stores what the scanner tells it (its next-visit date, when a finding should activate) but never computes a schedule, priority, date, or "needs scanning" judgment. It will compare a stored date to the clock, but that's as far as it goes.
- **Scanners keep no scheduling state.** Everything a scanner needs to decide what to scan next — last scan time, target modification/publish times, its own scheduled follow-ups, its previous findings — is queryable from the CMS, so the simplest scanner can be a cron job with credentials. Scanners may well keep their own state for other purposes, most obviously the detailed reports behind their `detailUrl` pages.
- **Scan targets are pages, assets, and data entries**, in **primary and sandbox** pagetrees. Pre-launch checking of sandboxes is a core use case; it is up to the scanner to realize it's scanning a sandbox and behave accordingly (fetch the preview render with its service credentials, filter by `pagetreeTypes` rather than `live`). Archives are not scannable.
- **Severity vocabularies belong to scanners.** Each scanner reports its own labels (axe: critical/serious/moderate/minor; linkcheck: broken/redirect) plus a normalized level for cross-scanner sorting. The CMS doesn't validate vocabulary; consistency across a scanner's submissions is the scanner's responsibility.
- **Findings follow content, not position.** Page data has no stable component ids, and a positional path like `areas.main.1` shifts whenever someone inserts a component above it. So a finding's identity is a hash of the component's content, and paths are just a way to say where that content sits in one particular version.

## Data model

Separate tables per target type (no polymorphic multi-FK tables — mostly-NULL id columns wreck MySQL's index cardinality estimates). Page tables are shown in full; the asset and data tables are identical except for the target column, with these differences:

- `datascans` has no `scannedUrl` (data has no fetchable render).
- `assetscans` has no `scannedSchemaVersion` (binaries aren't migrated).
- There are no asset findings or responses yet. Binary content has no components to point at.

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
  scannedVersion MEDIUMINT UNSIGNED NOT NULL,  -- provenance: recreate scanned state from versioned storage
  scannedSchemaVersion DATETIME NOT NULL,      -- schemaversion the content was migrated to when fetched
  status TINYINT UNSIGNED NOT NULL,            -- SUCCESS / ERROR / PARTIAL
  issueCount SMALLINT UNSIGNED NOT NULL,       -- summary for trends only, see "Open findings"
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
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id)
);

-- Severity breakdown of the scan summary, for trend analysis. Child table per
-- scan table (pagescan_severities, assetscan_severities, datascan_severities).
CREATE TABLE pagescan_severities (
  pagescanId INT UNSIGNED NOT NULL,
  severity VARCHAR(32) NOT NULL,               -- scanner-defined label
  level TINYINT UNSIGNED NOT NULL,             -- normalized 1-5, 5 = most severe
  count SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (pagescanId, severity),
  FOREIGN KEY (pagescanId) REFERENCES pagescans (id) ON DELETE CASCADE
);

-- Located findings, kept for every scan (history is useful for debugging a
-- scanner). Only the current scan's findings are live. datascan_findings is
-- identical.
CREATE TABLE pagescan_findings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pagescanId INT UNSIGNED NOT NULL,
  path VARCHAR(255) CHARACTER SET 'ascii' NOT NULL DEFAULT '', -- component path in the scanned
                                                               --   content; '' = the page itself
  contentHash CHAR(32) CHARACTER SET 'ascii' NOT NULL,  -- the component's own fields, excluding
                                                        --   areas, at scannedSchemaVersion
  category VARCHAR(64) CHARACTER SET 'ascii' NOT NULL DEFAULT '', -- scanner-defined, separates
                                                                  --   problems on one component
  severity VARCHAR(32) NOT NULL,               -- scanner-defined label
  level TINYINT UNSIGNED NOT NULL,             -- normalized 1-5, 5 = most severe
  message VARCHAR(1024) NOT NULL,
  activeAt DATETIME,                           -- null = a problem immediately
  firstSeenAt DATETIME NOT NULL,               -- carried forward when the identity matches
                                               --   the previous scan's finding
  PRIMARY KEY (id),
  INDEX scan_active (pagescanId, activeAt),    -- open-findings filter
  FOREIGN KEY (pagescanId) REFERENCES pagescans (id) ON DELETE CASCADE
);

-- Editor responses, keyed by finding identity rather than by finding row, so
-- they outlive any one scan. datafinding_responses is identical with dataId.
CREATE TABLE pagefinding_responses (
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,
  contentHash CHAR(32) CHARACTER SET 'ascii' NOT NULL,
  category VARCHAR(64) CHARACTER SET 'ascii' NOT NULL DEFAULT '',
  response TINYINT UNSIGNED NOT NULL,          -- VERIFIED / DISMISSED
  until DATETIME,                              -- VERIFIED only: suppressed until this time
  respondedBy VARCHAR(255) NOT NULL,
  respondedByImpersonator VARCHAR(255),
  respondedAt DATETIME NOT NULL,
  lastMatchedAt DATETIME NOT NULL,             -- last time a recorded finding had this identity;
                                               --   drives cleanup
  PRIMARY KEY (scannerId, pageId, contentHash, category),
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id)
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
  scannedVersion: Int!   # version of the target that was scanned (provenance)
  scannedSchemaVersion: SchemaVersion  # schemaversion it was migrated to (null for assets)
  status: ScanStatus!
  issueCount: Int!               # summary at scan time: for trends, never for alerts
  severities: [SeverityCount!]!  # same
  summary: String        # scanner's one-liner: what it found / how the scan went
  detailUrl: String
  stale: Boolean!        # convenience: target modifiedAt > scannedAt
  findings(openOnly: Boolean): [ScanFinding!]!
}

type ScanFinding {
  id: ID!
  path: String!          # component path in the scanned content ('' = the page itself)
  # path of the component with a matching contentHash in the given content (defaults:
  # latest version, current schemaversion); null when that component was edited or removed
  currentPath(version: Int, schemaversion: SchemaVersion): String
  category: String!
  severity: String!
  level: Int!
  message: String!
  activeAt: DateTime     # null = a problem immediately
  firstSeenAt: DateTime!
  open: Boolean!         # active, not dismissed, not verified past now
  response: FindingResponse
}

enum FindingResponseType { VERIFIED DISMISSED }

type FindingResponse {
  response: FindingResponseType!
  until: DateTime        # VERIFIED only
  respondedBy: User!
  respondedAt: DateTime!
}

# A flat list of every component in one version of the content, so scanners
# can refer to components without constructing paths themselves.
type ComponentOutline {
  path: String!          # '' for the page itself
  templateKey: String!
  templateName: String!
  contentHash: String!   # same hash recordScans will compute
}

# `scans` returns CURRENT scans (one per scanner) — the common display path.
# `scanHistory` serves trend analysis, explicitly scoped to one scanner.
extend type Page {
  scans(scanners: [String!]): [Scan!]!
  scanHistory(scanner: String!, since: DateTime): [Scan!]!
  components(version: Int, published: Boolean, schemaversion: SchemaVersion): [ComponentOutline!]!
}
extend type Asset {
  scans(scanners: [String!]): [Scan!]!
  scanHistory(scanner: String!, since: DateTime): [Scan!]!
}
extend type Data {
  scans(scanners: [String!]): [Scan!]!
  scanHistory(scanner: String!, since: DateTime): [Scan!]!
  components(version: Int, published: Boolean, schemaversion: SchemaVersion): [ComponentOutline!]!
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
# the finding conditions are AND'ed with that group and each other. Entries in
# the filter array are AND'ed together, so "has open axe findings AND never
# link-checked" is expressible.
input ScanFilter {
  scannerNames: [String!]      # limit to these scanners' scans; omit for any scanner

  # worklist facts (OR'ed)
  neverScanned: Boolean        # no scan row (by the named scanners / by anyone)
  scannedBefore: DateTime      # current scan older than X (time backstop)
  modifiedSinceScan: Boolean   # target modifiedAt > scannedAt
  publishedSinceScan: Boolean  # target publishedAt > scannedAt
  dueBefore: DateTime          # scanner-set nextScanAt <= X

  # finding conditions (AND'ed) — for reports and alerts
  hasOpenFindings: Boolean     # true: current scan has open findings; false: it has none
  openFindingMinLevel: Int     # only count open findings with level >= this
                               #   (implies hasOpenFindings: true when set alone)
}
# pages(filter: { scans: [{ ... }], live: true, modifiedBefore: ... })
# assets(filter: { scans: [{ ... }] })
# data(filter: { scans: [{ ... }] })
# PageFilter, AssetFilter, and DataFilter also gain modifiedBefore: DateTime,
# for scanners that debounce edits.

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

  # Editor responses: update permission on each finding's target. Stored by
  # finding identity, so they apply to future matching findings too.
  respondToFindings(findingIds: [ID!]!, response: FindingResponseType!, until: DateTime): ValidatedResponse!
  clearFindingResponses(findingIds: [ID!]!): ValidatedResponse!
}

input SeverityCountInput { severity: String!, level: Int!, count: Int! }

input ScanFindingInput {
  path: String           # component path; deeper paths are trimmed to the component; omit for
                         #   the page itself
  category: String       # separates different problems on the same component
  severity: String!
  level: Int!
  message: String!
  activeAt: DateTime     # when this becomes a problem; omit for immediately. Recorded as sent:
                         #   whether to reuse a previous finding's date is the scanner's call
}

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
  scannedVersion: Int!   # version the scanner fetched
  scannedSchemaVersion: SchemaVersion  # schemaversion the fetched content was migrated to;
                                       #   required for pages/data, rejected for assets
  findings: [ScanFindingInput!]  # pages/data only; capped at 500 per result
}

type ClaimScansResponse {   # extends ValidatedResponse
  granted: [ScanTarget!]!   # echoes the granted targets with their expiresAt
}
```

## Behavior

### Scanner flow

1. Query candidates: `pages(filter: { scans: [{ scannerNames: ["me"], ...facts }], live: true })` (or assets/data). The staleness scanner asks for pages modified since its last scan but at least 24 hours ago, using `modifiedSinceScan` together with `modifiedBefore`.
2. `claimScans(scanner, targets, expectedDuration)` — scan the granted subset; siblings hold the rest.
3. For each target, fetch the content plus, in the same GraphQL request, the component outline for that version and the scanner's current findings with `currentPath` for that version (see "Carrying findings across scans").
4. Scan it.
5. `recordScans(scanner, results)` — records results and findings, flips the `current` flag, clears claims.

### Recording

- **Every attempt gets a row.** A clean target records with no findings (that's the "recently scanned" signal); a fetch failure or timeout records with `status: ERROR` so failures neither retry forever nor masquerade as clean.
- **`summary`** is the scanner's optional one-liner — the kinds of problems found ("3 broken links, 2 redirect chains"), or anything useful about how the scan went (especially with `status: ERROR`, e.g. "render timed out after 30s"). Plain text, max 255 chars, truncated not rejected.
- **`scannedAt` is content fetch time.** The `modifiedSinceScan` comparison depends on this, so it must not drift toward posting time. Scanners may supply it (validated against server clock); when omitted, the server uses the target's **claim time** — the natural fetch-time approximation, since fetching happens right after claiming while results may be posted in a batch much later. If there's no live claim, it falls back to now.
- **Partial success**: each result in a batch is processed independently; invalid entries (archived target, target deleted between fetch and post, malformed input) produce per-result validation messages without failing the rest of the batch. The same goes for individual findings: a finding whose path doesn't resolve is dropped with a warning, and the rest of the scan still records.
- **Findings are capped at 500 per result**, truncated with a warning, so one pathological page can't blow up the table.
- **Archives rejected.** Results targeting ARCHIVE pagetrees are refused. Scans already recorded on pages whose pagetree later becomes an archive are kept as harmless history.
- Each insert clears the previous `current` row for that (scanner, target) in the same transaction.
- `detailUrl` is sanitized (it renders as a clickable link — no `javascript:` etc.).

### Findings point at components

A finding points at a **component**, which is any object in the data with a `templateKey` (the same test `validateRecurse` uses), or at the page itself with an empty path. It never points at a field inside a component. The component is the unit we hash, the unit we highlight in the editor, and, for an LLM scanner, the unit the model judges. Keeping those three the same is what makes everything below hold together.

If a scanner sends a path that goes deeper, like `areas.main.1.links.2.href`, `recordScans` trims segments until it lands on an object with a `templateKey` and stores that. It's an easy mistake and there's no reason to reject the finding over it.

Scanners shouldn't have to build paths at all, though. `components(version, schemaversion)` returns every component in that exact content with its path, template name, and hash.

**LLM scanners:** label the components `c1…cN`, send each one's own fields to the model under its label, and constrain the model's output to that set of labels with a JSON-schema `enum`. The model never writes a dot-path, so it can't miscount an index or invent a component, and you never need a correction round. Map the labels back to paths afterward.

**DOM-based scanners** (axe) see rendered HTML, so they need the render to tag each component's root element with a `data-path`, and then map a failing node to its nearest tagged ancestor. That's render-server work and is listed under Deferred.

### Finding identity

When `recordScans` stores a finding, it resolves the path against the content the scanner actually saw (`scannedVersion` migrated to `scannedSchemaVersion`), serializes that component's own fields with stable key order, **leaving out `areas`**, and hashes the result. The finding's identity is:

```
(scanner, target, contentHash, category)
```

`category` is an optional short string from the scanner, like `software-instructions` or `color-contrast`, so two different problems on one component stay separate.

This hash is effectively a per-component "modified since" signal, and we get it without storing a timestamp on every component. Some consequences worth spelling out:

- Editing elsewhere on the page, reordering components, or moving this one into another area changes nothing about its identity.
- Editing the component changes its hash, so it becomes a different finding. That's intended: it's one of the two ways an editor resolves a finding.
- Leaving `areas` out of the hash means editing a child component doesn't disturb findings on its parent.
- Identical components on the same page (a repeated "contact us" block) share an identity. When we need to tell them apart for display, the nearest path breaks the tie.

### Locating a finding in newer content

A finding's `path` is only accurate for the version it was recorded against. To find where that component lives now, `currentPath(version, schemaversion)` hashes every component in the requested content and returns the path of the one that matches, or null if none does (it was edited or removed).

Schema migrations complicate this slightly, because a migration can change a component's shape, and therefore its hash, without anyone editing it. Hashes only compare at the same schemaversion. If a registered migration dated between `scannedSchemaVersion` and the requested schemaversion applies to a template on the page, we migrate the scanned content forward and re-hash before comparing. The registry already keeps migrations sorted by `createdAt` with their `templateKey`, so the check is cheap, and the re-migration is rare.

The editor uses `currentPath` with its own schemaversion to decide which component to highlight. A finding with a null `currentPath` still shows up in the list, marked "content changed since scan".

### Carrying findings across scans

This is where the staleness scanner gets interesting. Say the scanner flags a block of software instructions as stale in six months. Then someone edits a different part of the page every day for a month. Each edit triggers a rescan, and a naive scanner asks the LLM again and gets "stale in six months" again, pushing the date out forever.

The rule in the CMS is simple: **only the current scan's findings are live, and `activeAt` is recorded exactly as sent.** Any previous finding the scanner doesn't report again is closed. Continuity is the scanner's job, and the CMS gives it what it needs to do that job before it calls the LLM.

In step 3 of the scanner flow, the scanner fetches its current findings with `currentPath(version: N, schemaversion: S)` for the version it's about to scan. A previous finding with a non-null `currentPath` sits on a component that hasn't changed. A new finding matches a previous one when its path equals the previous finding's `currentPath` and the categories match. So the staleness scanner:

- **Echoes back findings on unchanged components** with their original `activeAt`, without sending those components to the LLM at all. That stops the date from creeping, and it's cheaper too: after the first scan, the model only sees what actually changed.
- **Sends changed or new components to the LLM**, optionally with the old finding and the old and new text, so the model can judge whether the edit was substantive (new date) or cosmetic (keep the old one). A typo fix shouldn't reset a staleness date, but that judgment is policy, so it lives in the scanner.

A deterministic scanner like axe can ignore all of this and report what it sees. If a template fix in a software update makes an axe violation go away without any data change, the finding simply isn't reported and it closes. That case is why the CMS doesn't keep unreported findings alive on its own.

The CMS does carry `firstSeenAt` forward when a recorded finding's identity matches one from the previous scan. That's a fact about history, not a judgment, and the scanner shouldn't have to track it.

### Editor responses

An editor can respond to a finding in two ways:

- **VERIFIED until a date** — "still good, check again on X". The UI defaults X to now + (`activeAt` − `firstSeenAt`), reusing the scanner's original shelf life, and the editor can change it. The finding is suppressed until X, then it's open again.
- **DISMISSED** — a false positive, suppressed for good.

There's no "fixed" response. Editing the component changes its hash, and the finding closes on the next scan.

Responses are stored by finding identity, not by finding row, and path is **not** part of the key. So if you dismiss a warning and then reorder components, the dismissal stays put: the next scan's finding has the same hash and picks up the same response. Editing the component, or moving it to a different page, drops the response, because your judgment was about content that no longer exists there. Identical components on one page share a response, which seems right, since identical content deserves the same judgment.

Responding requires update permission on the target, since it's an editorial judgment about the content. We record the actor following our activity-logging conventions, including the impersonator when there is one.

### Open findings vs. the scan summary

A finding is **open** when all of these hold:

- `activeAt` is null or in the past
- it has no DISMISSED response
- it has no VERIFIED response with `until` in the future

That's computed at query time. All badges, the admin issues list, editor highlights, and the `hasOpenFindings`/`openFindingMinLevel` filters run on open findings from current scans. The filter is a join through the current scan to its findings, left-joined to responses, using the `(pagescanId, activeAt)` index.

`issueCount` and `severities` on the scan are the scanner's summary **at scan time**, and they are for trend analysis only. **Never filter, badge, or alert on them** — they can't reflect editor responses or findings that activate later, so a page an editor has fully reviewed would still look broken, and a staleness finding would never appear at all. The consequence for scanner authors: if you want your results to alert, report findings. A scanner with nothing specific to point at reports page-level findings with an empty path.

### Claiming

- `expiresAt = now + expectedDuration` (seconds, sanity-capped so a typo can't lock a site for a year).
- Grant-or-refuse is decided row-by-row in one transaction: insert the claim, or take it over only if the existing claim has expired. A batch can be partially granted.
- Expired claims need no cleanup — they're simply claimable by the next caller.
- Claims are scoped per scanner: different scanners never block each other. Never displayed; not part of scan history.

### Scheduling facts, not policy

`nextScanAt` lets a scan result schedule the scanner's own follow-up — e.g. an LLM staleness scanner that notices "applications due March 1" on a page and books a rescan for March 2. The CMS stores and displays the date and exposes it via the `dueBefore` filter; it never computes one. The UI presents it as the scanner's stated intent, not a CMS promise. Richer scanner state than one date belongs in the scanner.

`nextScanAt` and a finding's `activeAt` are different tools. `activeAt` makes a finding turn into an alert on its own date without anyone rescanning. `nextScanAt` asks the scanner to come back and look again.

### Provenance

`scannedVersion` and `scannedSchemaVersion` together pin the exact content the scanner saw: stored version N migrated to schemaversion S, which the existing `getData(target, N, published, S)` path reproduces. Version alone isn't enough, because a software update adds migrations, and the same stored version can then migrate to differently shaped data, with different paths. Asset version data includes the shasum, so the exact binary is recoverable too; assets have no schemaversion.

Both are **required** in `recordScans`, with no server-side default. A guessed version ("current at recording time") is silently wrong if the target changed mid-scan, and a guessed schemaversion is wrong for any scanner that fetched through the render server, which has its own build-time schemaversion. Scanners that fetch from the API know both from their query; scanners that fetch a render need the render server to expose them (deferred below). Versioned storage's retention policy deletes old untagged versions, so reconstruction is best-effort: **if the scanned version has been pruned, the recreate code falls back to the oldest version still retained.** Scanned versions are not pinned/tagged — version retention stays intact. The UI should indicate when it's showing the fallback rather than the exact scanned version, and that a finding's path may not line up with it.

### History & retention

- Full scan history is kept per (scanner, target), with a `current` flag marking the latest row. Findings are kept with every scan, not just the current one, so we can see exactly what a scanner reported on any past run when debugging it.
- **Retention: last 10 scans or 1 year, whichever is greater.** A row is deleted only when it is BOTH older than 1 year AND not among the 10 most recent for its (scanner, target). An infrequent scanner keeps its full last-10 however old; a nightly scanner keeps a year's worth; the current row is never eligible. Severity and finding rows cascade-delete with their scan row. With the 500-finding cap, the worst case is 500 findings per retained scan.
- The same job deletes editor responses whose `lastMatchedAt` is more than a year old, meaning no recorded finding has had that identity for a year.
- Enforced by a scheduled cleanup job (existing scheduler: `src/util/scheduler.ts`).

### Authorization

- **Recording/claiming**: one new global grant, plus the JWT's `client_id` must equal the scanner name. Scanner A's token cannot write or clobber scanner B's results, with zero per-scanner grant administration. Service tokens already carry `client_id`, and the mutation log already records it, so audit attribution comes free. A human admin holding the grant (a `sub`, no `client_id`) cannot record scans — correct by construction.
- **Registry management** (`updateScanner`/`deleteScanner`): the grant alone, no clientId match, so admins can manage scanners they don't own.
- **Viewing** scans, findings, and the component outline: piggybacks on each target type's existing view permissions — no new grant.
- **Responding to findings**: update permission on the target.
- The same service token serves both halves of a scanner's job: fetching sandbox preview renders and posting results.

### Scanner registry

Registration is implicit: the first `recordScans` from a new clientId creates the scanner row (no spoofing concern — the name is the authenticated clientId). `displayName` defaults to the name; the `scansPages`/`scansAssets`/`scansData` flags can be inferred from what the scanner submits or set via `updateScanner`. Retirement: `updateScanner(hidden: true)` keeps history out of the UI; `deleteScanner` removes the scanner and all its scan rows.

### Pagetree semantics

Pagetree promotion only changes the pagetree's `type` — page rows are untouched — so **sandbox scan history rides along through promotion**: pre-launch scan results, findings, and editor responses automatically become the live pages' record. Scans on deleted/orphaned targets fall out of display and rollups via the standard `deleteStates` filtering. The UI should label scan results with the target's pagetree context so sandbox results aren't mistaken for live-site results.

## Deferred

- **Render-server support for DOM-based scanners.** A render mode (preview with a flag, using the scanner's service token) that adds `data-path` to each component's root element, exposes the version and schemaversion it rendered (e.g. a meta tag), and ideally accepts a requested version so the scanner can pin the version from its candidate query instead of racing an edit. The axe use case depends on this; verify it's feasible before committing.
- Site/folder-level rollup queries for dashboards (a GROUP BY over open findings on current scans).
- Trend display UI — the data is there (`scanHistory`); chart design is a front-end question.
- Findings that span targets, like two pages giving different deadlines for the same thing. A finding belongs to exactly one target in this design.
- Findings on assets. Binary content has no components, but unlocated asset findings could reuse the same table shape.
- Asset metadata edits (alt text, title) trip `modifiedSinceScan` just like binary replacement; if a scanner ever cares only about binary changes, a `scannedShasum` column on assetscans could be added as another filterable fact.
- `modifiedAt` lives on `storage.modified` and `publishedAt` on the version `tags` table — verify the scan-relative filter JOINs perform acceptably or add indexes there.
- Editor-facing "request rescan now" button — would need a signal to scanners; a `rescanRequestedAt` column would be an easy hook if wanted.
