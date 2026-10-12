# Scan Support — Design

Scans run **externally**. A scanner is a pluggable, independently deployed service (accessibility checker, link checker, LLM staleness reviewer, ...) that examines pages, assets, or data entries and reports results back to the CMS. Each result is a scan summary plus a list of **findings**: individual problems, each pointing at the component it's about, with a short message. Anything deeper than that (screenshots, rule documentation, full reports) stays in the scanner's own system, reachable via an optional link.

The API's responsibilities:

1. **Expose the facts scanners need to build their own worklists** — with indexed queries. Scheduling and prioritization policy belongs entirely to the scanner; the CMS computes no staleness judgment of its own.
2. **Store results** — scanner, time, status, summary counts, and located findings, with history.
3. **Show findings to editors** — badges on pages, an issues list in the admin dashboard, and highlighted components in the page editor, where an editor can mark a finding as still good or dismiss it.
4. **Keep findings stable across rescans** — so an editor's response, and a finding's activation date, survive edits to unrelated parts of the page.
5. **Coordinate concurrent scanner instances** — an atomic claim mechanism so instances of the same scanner don't duplicate work.
6. **Let admins control where scanners run** — exempt a site from one scanner or all of them, and keep expensive scanners off sites that haven't asked for them.

## The motivating case

Broken links and WCAG warnings are the easy cases. The one that shaped most of this design is a **staleness scanner**. After a page is edited (with a 24-hour debounce), it asks an LLM to find content likely to go stale quickly, like step-by-step instructions for third-party software that will eventually get a UI update. The LLM suggests an expiration date for each piece it finds. Once a date passes, the page gets an alert icon and shows up in the dashboard's issues list. In the editor, each flagged component is highlighted until someone marks it as still good or edits it.

Nothing in the API is staleness-specific, though. The same machinery serves explicit-date extraction ("Register by March 1"), annual figures like tuition, mandatory yearly reviews, axe results that need a human to verify them, link checks against sites that block bots, and LLM checks on alt text quality or style guide compliance. We'll come back to the staleness scanner as the running example.

## Principles

- **The scanner owns policy; the CMS owns facts.** The CMS stores what the scanner tells it (when a finding should activate) but never computes a schedule, priority, date, or "needs scanning" judgment. It will compare a stored date to the clock, but that's as far as it goes.
- **Scanners keep no scheduling state.** Everything a scanner needs to decide what to scan next — last scan time, target modification/publish times, its previous findings — is queryable from the CMS, so the simplest scanner can be a cron job with credentials. Scanners may well keep their own state for other purposes, most obviously the detailed reports behind their `detailUrl` pages.
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
  displayName VARCHAR(255) NOT NULL,
  hidden TINYINT UNSIGNED NOT NULL DEFAULT 0,        -- retire from UI without losing history
  scansPages TINYINT UNSIGNED NOT NULL DEFAULT 1,    -- which target types this scanner handles,
  scansAssets TINYINT UNSIGNED NOT NULL DEFAULT 0,   --   so the UI knows where to offer it
  scansData TINYINT UNSIGNED NOT NULL DEFAULT 0,
  keepFindingsScans SMALLINT UNSIGNED NOT NULL DEFAULT 5,   -- retention: how many recent scans per
                                                            --   target keep their findings (min 1)
  keepSummaryMonths SMALLINT UNSIGNED NOT NULL DEFAULT 24,  -- retention: how long scan summaries last
  optIn TINYINT UNSIGNED NOT NULL DEFAULT 0,         -- 1 = runs only on sites that enable it
  PRIMARY KEY (id),
  UNIQUE INDEX name_UNIQUE (name)
);

CREATE TABLE pagescans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,                -- FK pages.id (internal id)
  scannedAt DATETIME NOT NULL,                 -- when the scanner fetched the content
  scannedVersion MEDIUMINT UNSIGNED NOT NULL,  -- provenance: recreate scanned state from versioned storage
  scannedSchemaVersion DATETIME NOT NULL,      -- schemaversion the content was migrated to when fetched
  status TINYINT UNSIGNED NOT NULL,            -- SUCCESS / ERROR / PARTIAL
  issueCount SMALLINT UNSIGNED NOT NULL,       -- summary for trends only, see "Open findings"
  summary VARCHAR(255),                        -- scanner's one-liner, surfaced in the UI
  detailUrl VARCHAR(1024),
  scannedUrl VARCHAR(1024),                    -- the URL the scanner actually fetched
  current TINYINT UNSIGNED NOT NULL DEFAULT 1, -- one current row per (scanner, target),
                                               --   maintained transactionally on insert
  findingsPruned TINYINT UNSIGNED NOT NULL DEFAULT 0, -- findings removed by retention; the
                                               --   summary remains
  PRIMARY KEY (id),
  INDEX scanner_page (scannerId, pageId, scannedAt),  -- history + latest lookup
  INDEX page_current (pageId, current),               -- dataloader: current scans for a page
  INDEX scanner_time (scannerId, current, scannedAt), -- scannedBefore filter
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

-- Located findings, kept for each target's most recent scans (history is
-- useful for debugging a scanner; see retention). Only the current scan's
-- findings are live. datascan_findings is identical.
CREATE TABLE pagescan_findings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pagescanId INT UNSIGNED NOT NULL,
  path TEXT,                                   -- component path in the scanned content; NULL = the
                                               --   page itself. TEXT because deep nesting can pass
                                               --   255 chars; never indexed (matching uses contentHash)
  contentHash CHAR(43) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,  -- the component's own fields, excluding
                                                        --   areas, at scannedSchemaVersion
  category VARCHAR(64) CHARACTER SET 'ascii' NOT NULL DEFAULT '', -- scanner-defined, separates
                                                                  --   problems on one component. Part of
                                                                  --   the identity, so '' rather than NULL
                                                                  --   keeps joins and the responses PK
                                                                  --   simple; the API maps '' <-> null
  severity VARCHAR(32) NOT NULL,               -- scanner-defined label
  level TINYINT UNSIGNED NOT NULL,             -- normalized 1-5, 5 = most severe
  message VARCHAR(1024) NOT NULL,
  activeAt DATETIME,                           -- null = a problem immediately
  firstSeenAt DATETIME NOT NULL,               -- carried forward when the identity matches
                                               --   the previous scan's finding
  allowDismiss TINYINT UNSIGNED NOT NULL DEFAULT 1, -- editors may DISMISS this finding
  verifyDays SMALLINT UNSIGNED,                -- editors may VERIFY it, by default for this many
                                               --   days; NULL = VERIFIED not allowed
  manageUrl VARCHAR(1024),                     -- link into the scanner's own UI for this finding
  PRIMARY KEY (id),
  INDEX scan_active (pagescanId, activeAt),    -- open-findings filter
  FOREIGN KEY (pagescanId) REFERENCES pagescans (id) ON DELETE CASCADE
);

-- Editor responses, keyed by finding identity rather than by finding row, so
-- they outlive any one scan. datafinding_responses is identical with dataId.
CREATE TABLE pagefinding_responses (
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,
  contentHash CHAR(43) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
  category VARCHAR(64) CHARACTER SET 'ascii' NOT NULL DEFAULT '',
  response TINYINT UNSIGNED NOT NULL,          -- VERIFIED / DISMISSED
  until DATETIME,                              -- VERIFIED only (required): suppressed until this time
  respondedBy MEDIUMINT UNSIGNED NOT NULL,     -- users.id, like createdBy/deletedBy elsewhere
  respondedAt DATETIME NOT NULL,
  lastMatchedAt DATETIME NOT NULL,             -- last time a recorded finding had this identity;
                                               --   drives cleanup
  PRIMARY KEY (scannerId, pageId, contentHash, category),
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id),
  FOREIGN KEY (respondedBy) REFERENCES users (id)
);

-- Site controls. sites gains one column:
--   ALTER TABLE sites ADD COLUMN scanExempt TINYINT UNSIGNED NOT NULL DEFAULT 0
-- and per-scanner overrides live here. No row = the scanner's default.
CREATE TABLE sitescanners (
  siteId SMALLINT UNSIGNED NOT NULL,
  scannerId SMALLINT UNSIGNED NOT NULL,
  enabled TINYINT UNSIGNED NOT NULL,           -- 0 = exempt from an opt-out scanner,
                                               -- 1 = enabled for an opt-in scanner
  PRIMARY KEY (siteId, scannerId),
  FOREIGN KEY (siteId) REFERENCES sites (id),
  FOREIGN KEY (scannerId) REFERENCES scanners (id) ON DELETE CASCADE
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
  keepFindingsScans: Int!   # retention: how many recent scans per target keep their findings
  keepSummaryMonths: Int!   # retention: how long scan summaries are kept
  optIn: Boolean!           # runs only on sites that enable it
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
  scannedVersion: Int!   # version of the target that was scanned (provenance)
  scannedSchemaVersion: SchemaVersion  # schemaversion it was migrated to (null for assets)
  status: ScanStatus!
  issueCount: Int!               # summary at scan time: for trends, never for alerts
  severities: [SeverityCount!]!  # same
  summary: String        # scanner's one-liner: what it found / how the scan went
  detailUrl: String
  stale: Boolean!        # convenience: target modifiedAt > scannedAt
  findings(openOnly: Boolean): [ScanFinding!]!
  findingsPruned: Boolean!   # findings were removed by retention, so an empty list means
                             #   "details expired", not "found nothing"
}

type ScanFinding {
  id: ID!
  path: String           # component path in the scanned content (null = the page itself)
  # path of the component with a matching contentHash in the given content (defaults:
  # latest version, current schemaversion); null when that component was edited or removed
  currentPath(version: Int, schemaversion: SchemaVersion): String
  category: String
  severity: String!
  level: Int!
  message: String!
  activeAt: DateTime     # null = a problem immediately
  firstSeenAt: DateTime!
  open: Boolean!         # active, not dismissed, not verified past now
  allowedResponses: [FindingResponseType!]!  # derived from allowDismiss/verifyDays; [] = manage
                         #   it in the scanner
  verifyDays: Int        # default length of the next VERIFIED response: the length of the last
                         #   VERIFIED response for this identity if there is one, otherwise the
                         #   scanner's value; null when VERIFIED isn't allowed
  manageUrl: String      # link into the scanner's own UI for this finding's subject
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
  path: String           # null for the page itself
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

enum SiteScannerStatus { ACTIVE EXEMPT NOT_ENABLED }

type SiteScanner {
  scanner: Scanner!
  override: Boolean      # this site's sitescanners row: true = enabled, false = exempt,
                         #   null = following the scanner's default
  status: SiteScannerStatus!  # the effective answer, including site-wide exemption
}

extend type Site {
  scanExempt: Boolean!         # exempt from all scanning
  scanners: [SiteScanner!]!    # every non-hidden scanner that applies to sites
}
# SitePermissions also gains manageScanning (true for manageScanners holders).

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

  # finding conditions (AND'ed) — for reports and alerts
  hasOpenFindings: Boolean     # true: current scan has open findings; false: it has none
  openFindingMinLevel: Int     # only count open findings with level >= this
                               #   (implies hasOpenFindings: true when set alone)
}
# pages(filter: { scans: [{ ... }], live: true, modifiedBefore: ... })
# assets(filter: { scans: [{ ... }] })
# data(filter: { scans: [{ ... }] })
# PageFilter already has modifiedBefore/modifiedAfter; AssetFilter and
# DataFilter gain the same pair, for scanners that debounce edits.

extend type Mutation {
  # Requires a registered scanner AND scanner === ctx.auth.clientId.
  recordScans(scanner: String!, results: [ScanResultInput!]!): ValidatedResponse!

  # Atomic claim — same auth as recordScans. Returns the subset of targets
  # actually granted; the rest are validly claimed by a sibling instance.
  claimScans(scanner: String!, targets: [ScanTargetInput!]!, expectedDuration: Int!): ClaimScansResponse!

  # Admin mutations: manageScanners grant, no clientId match.
  createScanner(name: String!, displayName: String!, scansPages: Boolean!, scansAssets: Boolean!, scansData: Boolean!, keepFindingsScans: Int, keepSummaryMonths: Int, optIn: Boolean): ValidatedResponse!
  updateScanner(scanner: String!, displayName: String, scansPages: Boolean, scansAssets: Boolean, scansData: Boolean, hidden: Boolean, keepFindingsScans: Int, keepSummaryMonths: Int): ValidatedResponse!
  # Its own mutation because it inverts every site's sitescanners row so no site's
  # effective status changes; see "Site controls".
  setScannerOptIn(scanner: String!, optIn: Boolean!): ValidatedResponse!
  deleteScanner(scanner: String!): ValidatedResponse!   # removes scanner + all its scans and findings

  # Site controls: manageScanners grant.
  setSiteScanExempt(siteId: ID!, exempt: Boolean!): ValidatedResponse!
  # enabled: false exempts, true enables an opt-in scanner, null resets to the scanner's default
  setSiteScanner(siteId: ID!, scanner: String!, enabled: Boolean): ValidatedResponse!

  # Editor responses: update permission on each finding's target, and the finding
  # must allow the response type. Stored by finding identity, so they apply to
  # future matching findings too.
  # until: VERIFIED only, defaults to now + the finding's verifyDays.
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
  allowDismiss: Boolean  # editors may DISMISS this finding; defaults to true
  verifyDays: Int        # editors may mark it VERIFIED, by default for this many days;
                         #   omit (or 0) to offer no VERIFIED response
  manageUrl: String      # optional link into the scanner's UI, shown in place of respond buttons
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
- `detailUrl` and each finding's `manageUrl` are sanitized (they render as clickable links — no `javascript:` etc.).

### Findings point at components

A finding points at a **component**, which is any object in the data with a `templateKey` (the same test `validateRecurse` uses), or at the page itself with a null path. It never points at a field inside a component. The component is the unit we hash, the unit we highlight in the editor, and, for an LLM scanner, the unit the model judges. Keeping those three the same is what makes everything below hold together.

If a scanner sends a path that goes deeper, like `areas.main.1.links.2.href`, `recordScans` trims segments until it lands on an object with a `templateKey` and stores that. It's an easy mistake and there's no reason to reject the finding over it.

Scanners shouldn't have to build paths at all, though. `components(version, schemaversion)` returns every component in that exact content with its path, template name, and hash.

**LLM scanners:** label the components `c1…cN`, send each one's own fields to the model under its label, and constrain the model's output to that set of labels with a JSON-schema `enum`. The model never writes a dot-path, so it can't miscount an index or invent a component, and you never need a correction round. Map the labels back to paths afterward.

**DOM-based scanners** (axe) see rendered HTML, so they need the render to tag each component's root element with a `data-path`, and then map a failing node to its nearest tagged ancestor. That's render-server work and is listed under Deferred.

### Finding identity

When `recordScans` stores a finding, it resolves the path against the content the scanner actually saw (`scannedVersion` migrated to `scannedSchemaVersion`), serializes that component's own fields with stable key order, **leaving out `areas`**, and hashes the result with SHA-256. The hash is stored as unpadded base64url, 43 characters, the same format and column definition as `binaries.shasum` (`CHAR(43)`, `ascii_bin`). The binary collation matters: base64url is case-sensitive, and under a case-insensitive collation two different hashes could compare equal and silently share a finding identity. The finding's identity is:

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

- **VERIFIED until a date** — "still good, check again on X". The finding is suppressed until X, then it's open again.
- **DISMISSED** — not a problem, suppressed for good. Either it's a false positive, or a human has confirmed something the scanner couldn't.

There's no "fixed" response. Editing the component changes its hash, and the finding closes on the next scan.

A verification with no end date would just be a dismissal, so VERIFIED always has one. The scanner offers VERIFIED by sending `verifyDays` on a finding, and the UI defaults X to now + `verifyDays`; the editor can change it. The right length depends on the kind of problem, so it's the scanner's call and it's per finding:

- The staleness scanner sends the LLM's estimate of how long the content stays good after a review, which can differ from finding to finding.
- A mandatory-review scanner sends 365.
- axe omits it for results that need a human to look. Once someone has confirmed the contrast over a background image is fine, there's no reason to ask again until the component changes, so DISMISSED is the right response, and editing the component resets it anyway.

The scanner's number is only a first guess, though. If the LLM gave a 30-day shelf life to a tuition table that changes once a year, the editor will push the date out to a year when they verify it, and they shouldn't have to do that again every time. So once a finding has been verified, the default for the next verification is the length the editor chose last time (`until` − `respondedAt` on the expired response), and the scanner's `verifyDays` only applies the first time. We can't write the editor's choice into the finding's `verifyDays`, because the next scan replaces it with the scanner's value. The response row already outlives scans and already holds both dates, so it needs no new column. `ScanFinding.verifyDays` returns the effective default, so the UI and `respondToFindings` share one rule.

Editing the component drops the response along with the editor's preference, since it's new content. A staleness scanner that wants to keep the preference can read the old finding's `response` when it sends a changed component to the LLM, and use it to inform the new estimate.

### Note about findings the CMS shouldn't let you respond to

Responses belong to one component on one page, and that's the wrong scope for some scanners. Consider the link checker. When it flags a link to a site that blocks bots, the false positive is about the **URL**, and that URL might appear on two hundred pages. Dismissing it on one page leaves the other 199 flagged, and the next unrelated edit to that component drops even the one dismissal.

We could teach the CMS to dismiss by URL everywhere, but then the CMS would have to decide whether `http://x.com/a` and `https://x.com/a/` are the same link, and whether an editor on one site should be able to silence findings on a site they can't edit. Those are the link checker's questions. So the link checker keeps its own allow list of domains and links, behind its own management UI with whatever authorization rules make sense there, and simply doesn't report the links on it.

That only works if editors don't take the easy way out, so the scanner controls which responses the CMS offers on each finding:

- `allowDismiss` and `verifyDays` on each finding say which buttons the editor gets. The link checker sends `allowDismiss: false` and no `verifyDays`, so editors get neither. The staleness scanner sends a `verifyDays` and leaves dismissal on, for content the LLM wrongly thought would go stale. axe leaves dismissal on and omits `verifyDays` for results that need a human to look.
- `manageUrl` links to the scanner's UI for this finding ("Manage this link in Link Checker"), and the editor sees it in place of the buttons. Without it, a finding with no responses would be a dead end, and a dead end is exactly what sends people looking for a workaround.
- Only responses the current finding allows count when deciding whether it's open, and `respondToFindings` refuses a response type the finding doesn't allow. That way a scanner that stops allowing dismissals isn't stuck with its findings hidden forever by old ones.

Responses are stored by finding identity, not by finding row, and path is **not** part of the key. So if you dismiss a warning and then reorder components, the dismissal stays put: the next scan's finding has the same hash and picks up the same response. Editing the component, or moving it to a different page, drops the response, because your judgment was about content that no longer exists there. Identical components on one page share a response, which seems right, since identical content deserves the same judgment.

Responding requires update permission on the target, since it's an editorial judgment about the content. We record the responder's `users.id`, like `createdBy`/`deletedBy` elsewhere; the mutation log covers impersonation forensics.

### Open findings vs. the scan summary

A finding is **open** when all of these hold:

- `activeAt` is null or in the past
- it has no DISMISSED response
- it has no VERIFIED response with `until` in the future

(Counting only responses the finding allows; see the note about findings you can't respond to.)

That's computed at query time. All badges, the admin issues list, editor highlights, and the `hasOpenFindings`/`openFindingMinLevel` filters run on open findings from current scans. The filter is a join through the current scan to its findings, left-joined to responses, using the `(pagescanId, activeAt)` index.

`issueCount` and `severities` on the scan are the scanner's summary **at scan time**, and they are for trend analysis only. **Never filter, badge, or alert on them** — they can't reflect editor responses or findings that activate later, so a page an editor has fully reviewed would still look broken, and a staleness finding would never appear at all. The consequence for scanner authors: if you want your results to alert, report findings. A scanner with nothing specific to point at reports page-level findings with no path.

### Site controls

Some sites shouldn't be scanned, or shouldn't be scanned by a particular scanner. A site full of archived PDFs is a waste of an LLM scanner's budget. A site whose content syncs from an external system will collect findings nobody can fix. A test site just clutters the dashboard. So admins with `manageScanners` can:

- **Exempt a site from all scanning** (`sites.scanExempt`).
- **Exempt a site from one scanner**, or **enable an opt-in scanner** for it (`sitescanners`).

Most scanners are opt-out: they run everywhere unless a site is exempted. That's the right default for compliance scanners like axe, which nobody should have to remember to turn on. A scanner marked `optIn`, like the LLM staleness scanner, runs only on sites that have enabled it, because the default should be not spending money.

Putting it together, a scanner runs on a site when the site isn't `scanExempt`, and either the site has enabled it or there's no override and the scanner isn't opt-in. Exemption always wins. Global data, which has no site, follows the scanner's default: opt-out scanners scan it and opt-in scanners don't.

Overrides go in one table with an `enabled` flag rather than separate exemption and enable tables, so a site can never hold contradictory rows for one scanner, and switching a scanner between opt-in and opt-out never leaves old rows meaning something unclear.

**The CMS enforces this itself**, so scanners need no changes:

- The worklist filters never match a target on a site where the named scanner isn't enabled, so those sites just don't show up in its candidate list.
- `claimScans` doesn't grant those targets, with a per-target message saying why.
- `recordScans` rejects results for them with a per-result warning, which covers a scan that was already running when someone set the exemption.

**Existing results are hidden, not deleted.** A site's findings for a scanner that's no longer enabled drop out of badges, the issues list, the open-findings filters, and editor highlights, but the rows stay. Removing the exemption brings them back, and retention ages them out otherwise. `scanHistory` still shows them, since exempting a site doesn't make its past scans untrue. A target that isn't scanned shows **no badge at all**, not a clean one, so an exemption never looks like a pass.

**In the admin UI**, the site detail page gets a "Scanning" panel next to "Authorized Templates", built the same way. It has a site-wide "Exempt from all scanning" toggle, then each non-hidden scanner with its status on this site (Active, Exempt, or Not enabled) and an Exempt, Enable, or Reset to default action. With the site-wide exemption on, the per-scanner rows show as exempt and their controls are disabled. Site managers can see the panel, but only `manageScanners` holders can change it: accessibility scanning is a compliance tool, and a site shouldn't be able to waive it for itself. The new global Scanners page lists each scanner's exempt (or, for opt-in scanners, enabled) sites alongside its registry and retention settings, with opt-in as its own control whose confirmation explains that existing sites keep their status.

### Note about changing a scanner's opt-in flag

What should happen to existing sites when an opt-out scanner becomes opt-in? If we just flipped the flag, every site without a row would silently stop being scanned and lose its results from view, all at once. That's almost never what the admin meant.

So changing the flag has its own mutation, `setScannerOptIn`, and it **inverts the site rows** so that no site's effective status changes:

- **Opt-out → opt-in:** every site with no row was active by default, so it gets an `enabled = 1` row. Then the `enabled = 0` rows are deleted, since exempt is now the default.
- **Opt-in → opt-out:** the mirror image. Sites with no row get `enabled = 0`, then the `enabled = 1` rows go.

All of it happens in one transaction with the scanner row locked (`FOR UPDATE`), so a `setSiteScanner` call can't land halfway through. Rows are written for every site, deleted ones included, so an undeleted site comes back the way it was.

The only thing the flip changes is the default for sites without a row, which in practice means **sites created from now on**. If you want an expensive scanner off across existing sites, flip it to opt-in and then remove the enables you don't want. It's an extra step, but it keeps the flip itself from ever being destructive. A release migration that changes `optIn` has to do the same inversion, so it's worth putting the inversion in a function both can call.

### Claiming

- `expiresAt = now + expectedDuration` (seconds, sanity-capped so a typo can't lock a site for a year).
- Grant-or-refuse is decided row-by-row in one transaction: insert the claim, or take it over only if the existing claim has expired. A batch can be partially granted.
- Expired claims need no cleanup — they're simply claimable by the next caller.
- Claims are scoped per scanner: different scanners never block each other. Never displayed; not part of scan history.

### Provenance

`scannedVersion` and `scannedSchemaVersion` together pin the exact content the scanner saw: stored version N migrated to schemaversion S, which the existing `getData(target, N, published, S)` path reproduces. Version alone isn't enough, because a software update adds migrations, and the same stored version can then migrate to differently shaped data, with different paths. Asset version data includes the shasum, so the exact binary is recoverable too; assets have no schemaversion.

Both are **required** in `recordScans`, with no server-side default. A guessed version ("current at recording time") is silently wrong if the target changed mid-scan, and a guessed schemaversion is wrong for any scanner that fetched through the render server, which has its own build-time schemaversion. Scanners that fetch from the API know both from their query; scanners that fetch a render need the render server to expose them (deferred below). Versioned storage's retention policy deletes old untagged versions, so reconstruction is best-effort: **if the scanned version has been pruned, the recreate code falls back to the oldest version still retained.** Scanned versions are not pinned/tagged — version retention stays intact. The UI should indicate when it's showing the fallback rather than the exact scanned version, and that a finding's path may not line up with it.

### History & retention

Scan history is kept per (scanner, target), with a `current` flag marking the latest row. Retention has two tiers, because findings are where the bulk of the data is, but they're only useful for recent runs, while the summary numbers stay useful for trends over a long time:

- **Details.** Findings are kept for each target's last `keepFindingsScans` scans, default **5**, so we can see exactly what a scanner reported on recent runs when debugging it. After that, a scan loses its findings but keeps its summary, and is marked `findingsPruned` so the UI can say "details expired" instead of suggesting the scan found nothing. With the 500-finding cap, the worst case is 2,500 findings per (scanner, target) at the default.
- **Summaries.** The scan row and its severity counts are kept for `keepSummaryMonths`, default **24**. That's enough for year-over-year trends. Severity and any remaining finding rows cascade-delete with the scan row.
- **The current scan is never pruned or deleted**, however old it is. The worklist filters (`neverScanned`, `scannedBefore`, `modifiedSinceScan`) and the open findings all read it, so losing it would make a target look never-scanned and silently clear its alerts. That's also why `keepFindingsScans` can't go below 1.

Both settings are per scanner, set with `createScanner`/`updateScanner` or in a release migration. A nightly link checker might keep fewer detail scans; an LLM scanner whose findings help us tune its prompts might keep more.

- The same job deletes editor responses whose `lastMatchedAt` is more than a year old, meaning no recorded finding has had that identity for a year.
- Enforced by a scheduled cleanup job (existing scheduler: `src/util/scheduler.ts`), per scanner and in batches. Finding pruning ranks each target's scans with `ROW_NUMBER() OVER (PARTITION BY scannerId, pageId ORDER BY scannedAt DESC)` using the `scanner_page` index, and skips scans already marked `findingsPruned`. Summary deletion uses the `scanner_time` index (`current = 0 AND scannedAt < cutoff`).

### Scanner registry

Scanners are registered on purpose. A scanner's name is its JWT `client_id`, and there are two ways to add one:

- **By an admin** holding the new `manageScanners` global grant, on the Scanners admin page (`createScanner`). The admin enters the client id, a display name, and which target types it scans.
- **By a software release.** A project that ships a scanner alongside a release (say, dosgato-txstate) registers it with a migration through the existing `moreMigrations` hook, so every environment picks it up on upgrade with no human step:

  ```ts
  { id: 20261101120000, description: 'register the staleness scanner', run: async db => {
    await db.insert('INSERT INTO scanners (name, displayName, scansPages, scansAssets, scansData, optIn) VALUES (?, ?, 1, 0, 1, 1)', ['dg-staleness', 'Content Staleness'])
  } }
  ```

Why not let a scanner register itself on its first `recordScans`? Its client id is authenticated, so it can't impersonate another scanner. But being authenticated isn't the same as being approved, and since findings put alert icons in front of editors, we want a person (or a release) to have decided a scanner belongs here. Otherwise any service with client credentials could start posting alerts.

`updateScanner` changes the display name, target types, retention settings, and `hidden` flag (the opt-in flag has its own mutation, see "Site controls"); hiding keeps a retired scanner's history out of the UI. `deleteScanner` removes the scanner along with all its scans, findings, responses, claims, and per-site settings, so the admin page should confirm with a count first. To cut a misbehaving scanner off immediately without losing its history, disable its user account. The server's `send403` hook already rejects every request whose user is missing or disabled, so its token stops working for both reading and recording.

### Authorization

- **A scanner's token carries two identities, and each authorizes a different job.** `username` (the token's `sub`) gets read access to pages, assets, and data through that user's roles, exactly like a person. `clientId` (the token's `client_id`) gets the ability to record scans and findings, by being in the scanner list. For a scanner they're the same string.
- **Recording/claiming**: there's no grant for scanners. The scanner must be registered, the token's `client_id` must equal the scanner name, and **`username` must equal `client_id`**. That last check matters more than it looks: a person's OAuth token also carries a `client_id`, the id of the app they logged in through, so if someone ever registered a scanner under the admin UI's client id by mistake, every admin UI user could post scans. Requiring the two to match shuts that out, and it also stops an admin who is impersonating a scanner's user from recording as it. Real scanners using client credentials have matching `sub` and `client_id` anyway. Scanner A's token cannot write or clobber scanner B's results, and an unregistered client gets a clear error naming its client id, so a misconfigured scanner is easy to spot. The mutation log already records the login, so audit attribution comes free. The scanner's user must also exist and be enabled, but nothing new is needed for that: `send403` already rejects tokens whose user is missing or disabled.
- **Registry management and site controls**: the `manageScanners` global grant, held by human admins. Site managers can see their site's scanning status but not change it. Scanners hold no admin permission, so a scanner's token can't manage other scanners.
- `manageScanners` is a new column on `globalrules`. The migration that adds it also sets it on the existing `superuser` role, matched by name since role names are unique. `seeddb` stays as it is, because fresh installs run every migration after the initial seed, so the superuser gets the grant either way.
- **Reading content**: a scanner still needs a user record with ordinary roles to read what it scans (its login is its `username`): view access to the sites it scans, plus preview access for sandboxes. That's normal account setup, not a scanning permission. The same token serves both halves of a scanner's job: fetching content and posting results.
- **Viewing** scans, findings, and the component outline: piggybacks on each target type's existing view permissions — no new grant.
- **Responding to findings**: update permission on the target. The response stores the responder's `users.id`.

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
