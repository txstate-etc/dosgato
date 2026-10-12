# Scan Support — Design Plan

Scans run **externally** (pluggable scanners: accessibility, link checking, etc.) and may target **pages, assets, or data entries** (see D10). The API's job is:

1. Help scanners find targets that need (re)scanning.
2. Store summary results: scanner name, issue count, severity breakdown, optional detail link.
3. Display those summaries to editors.

Issues can be reported as located findings with a dot-separated content path, a short message, an optional future activation date, and editor responses that survive rescans (D11, D12); full per-issue detail stays in the external system behind `detailUrl`.

Each decision below has options and a recommendation. Mark decisions as they're made.

---

## Decisions

### D1. Staleness definition — what makes a target "need scanning"?

- [ ] (a) Time only — rescan when `scannedAt` older than a cutoff.
- [ ] (b) Content marker + time — record `scannedVersion`/`scannedShasum`; rescan when content changed since last scan OR past the time cutoff.
- [x] **(c) Scanner decides; CMS provides facts + indexed queries** — scheduling and prioritization are the scanner's job. The CMS exposes the queryable facts (`scannedAt`, `modifiedAt`, `publishedAt`, and scanner-set `nextScanAt`) and indexed filters over them, but computes no staleness policy of its own.

**Decision: (c).** Consequences:

- **`nextScanAt`** — nullable DATETIME on each scan row, set by the scanner in `recordScans`. Lets scanners be stateless (a scan result can schedule the follow-up, e.g. an LLM staleness scanner that sees a due date on the page and books a rescan for the day after) and gives the UI a "next scheduled scan" display. Guardrail against overengineering: the CMS **stores** the date, it never **computes** one — no recurrence rules, priorities, or default schedules. Richer scanner state stays in the scanner. Display it as scanner-provided intent, not a CMS promise.
- **`scannedVersion` + `scannedSchemaVersion` — required, for provenance, not policy.** Staleness queries stay timestamp-based (`modifiedAt > scannedAt`). The pair pins the exact content the scanner saw: stored version N migrated to schemaversion S, which `getData(target, N, published, S)` already reproduces. Version alone isn't enough — a software update adds migrations, so the same stored version can migrate to differently-shaped data (and different D11 paths). For assets, the version data includes the shasum, so the binary is recoverable too; assets have no schemaversion. **Both are required in `recordScans`** — no server-side default, since a guessed version (e.g. "current at recording time") is silently wrong if the target changed mid-scan, and a guessed schemaversion is wrong for any scanner that fetched through the render server (which has its own build-time schemaversion). No `scannedShasum` needed — the version covers it. Versioned storage's retention policy deletes old untagged versions, so reconstruction is best-effort: **if `scannedVersion` has been pruned, the recreate code falls back to the oldest version still retained** (the closest surviving approximation). No pinning/tagging of scanned versions — retention stays intact.
- Scanners must report `scannedAt` as the time they **fetched** the content, not when they posted results.
- **Scan-relative filters are OR-able facts** (see GraphQL sketch): never scanned, scanned before X, modified/published since last scan, `nextScanAt` due. "Modified since its last scan" is a JOIN condition, so it must be a filter — scanners can't compose it from separate queries.
- `modifiedAt`/`publishedAt` already exist on Page (from `storage.modified` and the `published` version tag) but are display-only today — the scan-relative filters make them queryable relative to scans.

### D2. History vs. latest-only

- [ ] (a) Latest-only — unique index per (scanner, target), `recordScans` is an upsert. Simple, bounded.
- [x] **(b) Keep history** — enables trend analysis ("40 → 12 → 3 issues over the semester").

**Decision: (b) keep history.** Consequences:

- No unique (scanner, target) index. `recordScans` inserts a new row and maintains a **`current` flag** in the same transaction (clear the old current row, insert the new one with current=1). The flag keeps dataloaders ("current scans for these pages") and the scan-relative filter JOINs (comparisons run against the current scan only) simple and indexed — no window functions in hot paths.
- `nextScanAt` is meaningful on the current row only.
- **Retention is two-tier and configurable per scanner** (revised from the original "last 10 scans or 1 year, whichever is greater"):
  - **Details (findings)**: kept for the last `keepFindingsScans` scans per (scanner, target), default **5**. Older scans lose their finding rows but keep their summary, and are flagged `findingsPruned = 1` so the UI can say "details expired" rather than implying the scan found nothing.
  - **Summaries (scan row + severities)**: kept for `keepSummaryMonths`, default **24** (2 years). Older scan rows are deleted, severities cascading.
  - The **current** scan is never deleted or pruned, however old: worklist facts (`neverScanned`, `scannedBefore`, `modifiedSinceScan`) and open findings all depend on it. `keepFindingsScans` therefore has a minimum of 1.
  - Set via `createScanner`/`updateScanner` (`manageScanners`) or a release migration (D8). A chatty nightly scanner might keep fewer detail scans; an expensive LLM scanner whose history is useful for tuning prompts might keep more.
  - Enforced by a scheduled cleanup job (existing scheduler at `src/util/scheduler.ts`), per scanner and in batches. Finding pruning ranks scans with `ROW_NUMBER() OVER (PARTITION BY scannerId, pageId ORDER BY scannedAt DESC)` (fine on Percona 8.4) using the `scanner_page` index, skipping scans already marked `findingsPruned`. Summary deletion uses `scanner_time` (`current = 0 AND scannedAt < cutoff`).
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
- Sandbox scanners report the version they actually fetched (usually the latest; there may be no published version) — same as everyone else, since `scannedVersion` is required (D1).
- **Promotion bonus** (verified: `promotePagetree` only updates `pagetrees.type`; page rows are untouched): sandbox scan rows ride along through promotion, so pre-launch scan results and history automatically become the live pages' scan record. A newly promoted site is NOT "never-scanned" as long as its sandbox was being scanned.
- UI should label scan results with the target's pagetree context so sandbox results aren't mistaken for live-site results.

### D7. Scanner identity & authorization

- [ ] (a) One global grant + load-bearing clientId — a new grant on globalrules held by scanner tokens, plus `recordScans` requires the JWT's `client_id` to match the scanner name.
- [ ] (b) Per-scanner grants — unnecessary given the clientId rule.
- [x] **(c) The scanner registry is the authorization** — no grant for scanners at all. A token may record or claim for scanner X only if a registered scanner named X exists and X equals its `client_id`. Registration is explicit (D8), done by `manageScanners` holders (D13f).

Viewing: piggyback on each target type's view permission (no new grant).

**Decision: (c).** Originally (a), revised once D8 became explicit: with a human-maintained registry, a scanner grant would only duplicate the registry. Details:

- Service tokens already carry `client_id` and the Context exposes it (`ctx.auth.clientId`; the mutation log already records `auth.sub ?? auth.client_id`, so scanner attribution in the audit trail comes free).
- `recordScans(scanner: ...)` / `claimScans` validate that `scanner === ctx.auth.clientId` (explicit arg kept as a misconfiguration check rather than silently derived) and that the scanner is registered. Scanner A's token cannot write or clobber scanner B's results, and an unregistered client can't post anything.
- **Two identities, two jobs.** A token carries `username` (from `sub`) and `clientId` (from `client_id`). **Reading** pages, assets, and data is authorized by the roles of `username`, like any user. **Recording and claiming** is authorized by `clientId` being in the scanner list.
- **`username` must equal `clientId` to record or claim.** A person's OAuth token also carries a `client_id` — that of the app they logged in through (e.g. the admin UI) — with their own login as `sub`. Without this check, registering a scanner under an interactive app's client id by mistake would let every user of that app post scans. Client-credentials tokens for a scanner have matching `sub` and `client_id`, so the check costs real scanners nothing. It also blocks recording while impersonating the scanner's user from the admin UI (`sub` = scanner, `client_id` = the admin app).
- Scanners hold no admin permission at all, so a scanner's token can't manage other scanners.
- A scanner still needs a user record (login = its `username`, which equals its client id) with ordinary roles to **read** what it scans: view rules for the sites it scans, and preview access for sandboxes (D6). That's normal account setup, not a scanning grant.
- Sandbox render fetching (D6) can use the same service token — one credential per scanner for both fetching previews and posting results.
- To cut a scanner off immediately, disable its user (`users.disabledAt`) or delete the scanner (D8). The server's `send403` hook already rejects any request whose user is missing or disabled, so nothing scan-specific is needed.

### D8. Scanner registry lifecycle

- [ ] (a) Implicit registration — first `recordScans` with a new name creates the scanner row.
- [x] **(b) Explicit registration** — scanners are added by people with `manageScanners` (D13f), or shipped by a software release as a DB migration.

**Decision: (b).** Originally (a), on the reasoning that the name is already authenticated so there's nothing to vet. But an authenticated client isn't an approved scanner, and with D12 findings driving editor alerts, approval matters. Any service with client credentials could otherwise register itself and start posting alerts. Details:

- `createScanner(name, displayName, scansPages, scansAssets, scansData)`: `name` is the scanner's `client_id`. The target-type flags are set by the admin up front instead of being inferred from submissions.
- **Release-shipped scanners**: a project (e.g. dosgato-txstate) that deploys a scanner alongside a release can register it with a migration through the existing `moreMigrations` hook: `INSERT INTO scanners (name, displayName, scansPages, ...) VALUES (...)`. No human step, and every environment gets it on upgrade.
- `updateScanner` (display name, target types, hide) and `deleteScanner` (removes scanner + all its scan rows, findings, responses, claims, and exemptions) require `manageScanners`, no clientId match.
- `recordScans`/`claimScans` from an unregistered `client_id` fail with a clear message naming the client id, so a misconfigured scanner is easy to diagnose.
- `hidden` stays display-only (keeps history out of the UI). Stopping a scanner is deleting it or disabling its user (D7).

### D9. Concurrency between scanner instances

- [ ] (a) Punt — duplicate scans are wasted work, not corruption.
- [x] **(b) Atomic claim mutation with scanner-supplied lease duration.**

**Decision: (b).** A `claimScans` mutation atomically claims a batch of targets for a scanner. The caller passes `expectedDuration` (seconds a scan should reasonably take); the claim expires at `now + expectedDuration`, and **expired claims are simply claimable by others** — no cleanup dependency, a crashed instance's claims evaporate on schedule. Details:

- **Flow**: instance queries candidates via the scan-relative filters → `claimScans(scanner, targets, expectedDuration)` → response lists which targets were **granted** (others are already validly claimed by a sibling) → instance scans the granted set → `recordScans` clears each claim as it records.
- **Atomicity per target**: claim tables keyed `PRIMARY KEY (scannerId, targetId)`; grant-or-refuse decided row-by-row in one transaction (insert, or take over only if the existing claim has expired). A batch can be partially granted.
- The scan-relative filters don't need an "unclaimed" condition: the granted list already partitions work between siblings. Racing instances just see fewer grants.
- Claims are ephemeral coordination state — per-scanner (scoped by scannerId; different scanners never block each other), never displayed, not part of scan history. `expectedDuration` gets a sanity cap so a typo can't lock a site for a year.
- Auth: same rule as `recordScans` (registered scanner + clientId match, D7).

### D10. Scan targets — pages, assets, data entries

Scans may apply to assets (e.g. PDF accessibility) and data entries, not just pages. How to model the polymorphic target?

- [ ] **(a) One `scans` table with three nullable FKs** — `pageId` / `assetId` / `dataId` columns, exactly one non-null (app-enforced). One service/upsert/mutation path, but mostly-NULL id columns wreck MySQL's index cardinality estimates.
- [x] **(b) Separate tables per target** (`pagescans`, `assetscans`, `datascans`) — matches the `pagerules`/`assetrules`/`datarules` precedent and allows per-type columns (scannedVersion vs. scannedShasum); more boilerplate but healthy indexes.
- [ ] **(c) `targetType` + `targetId` columns** — compact, but no FK integrity and awkward joins. Not recommended.

Notes regardless of choice:
- **Data entries have no fetchable URL** — a data scanner pulls content via the API rather than fetching a render. `scannedUrl` is null for data; that's fine.
- Scanner registry could declare which target types a scanner handles (`scansPages`/`scansAssets`/`scansData` or a set), so the UI knows not to offer an axe column on assets. Cheap to add; recommended.

**Decision: (b) separate tables.** Mostly-NULL id columns give MySQL trouble counting index cardinality, so avoid tables with multiple ids where only one is non-null. GraphQL layer still presents a single `Scan` type and one `recordScans` mutation; the service routes each result to the right table.

### D11. Located findings — dot-separated paths into page/data content

**Requirement (settled):** scanners must be able to flag *where* in the content an issue is, using the existing dot-separated path convention (`areas.main.1.areas.content.0`, same as `updateComponent`'s `path` arg and `ValidationFeedback.path`). This partially reverses "per-issue detail stays external" — the `scan_issues` door left open in the settled requirements. Each located issue is a **finding**; D12 gives findings a lifecycle that outlives any single scan.

Constraint discovered: `ComponentData` has **no stable component ids**. Paths are positional, so any edit that inserts/moves/deletes a component above the flagged one shifts indexes. A path is only exact relative to the content it was recorded against: `scannedVersion` migrated to `scannedSchemaVersion` (D1). Migrations from software updates can also restructure areas, so the schemaversion matters as much as the version.

#### D11a. Storage granularity

- [x] **(a) Per-finding child table** (`pagescan_findings`, `datascan_findings`): `{ path, contentHash, category, severity, level, message, activeAt, firstSeenAt }` (D12 explains the identity and lifecycle columns). Editors get "what's wrong here" inline, not just a count. D4 severity rows stay as the scan's **summary** — scanner-reported counts at scan time, used for history and trends. Live alerting uses open findings (D12e), not the summary.
- [ ] (b) Add `path` to the severity rows — counts per (path, severity). One table, rollups unchanged, but no message and no per-finding lifecycle, so it can't support D12.

**Decision: (a).** Cap findings per result (e.g. 500, truncate with a validation warning) so one pathological page can't explode the table.

#### D11b. Finding retention

- [ ] (a) Current scan only — finding rows are deleted when their scan stops being `current`. Smallest table, but loses the record of what each past scan reported.
- [x] **(b) Keep findings on past scans too, under a retention policy.**

**Decision: (b) keep findings on past scans, for debugging.** Being able to see exactly what a scanner reported on recent past scans (alongside `scannedVersion`/`scannedSchemaVersion` to recreate the content it saw) is worth the table size. Consequences:

- Findings follow D2's **detail** tier: kept for the last `keepFindingsScans` scans per (scanner, target), default 5, then pruned while the scan's summary lives on. They also cascade-delete if the scan row itself is deleted.
- Continuity across scans still comes from D12b carry-forward (matched findings copy `firstSeenAt`/`activeAt` onto the new rows), so nothing ever needs to read old finding rows except for debugging/history.
- Everything live — open findings, badges, editor highlights, the D12c scanner query — reads only the **current** scan's findings. Older rows are history.
- The per-result cap (D11a) bounds growth: worst case is 500 × `keepFindingsScans` per (scanner, target), so 2,500 at the default.

#### D11c. Locating a finding in content that has changed since the scan

- [x] **(a) Content-hash lookup** — the finding stores the `contentHash` of its component (D12a). To locate it in the viewer's content, hash every component there and highlight the one whose hash matches (tie-break duplicates by nearest path). This survives edits elsewhere on the page **and moves of the flagged component**. If no component matches, the flagged content itself was edited: show the finding unlocated, marked "content changed since scan". Hashes only compare at the same schemaversion: if a registered migration with `createdAt` between `scannedSchemaVersion` and the viewer's schemaversion applies to a templateKey on the page, migrate the scanned content to the viewer's schemaversion and re-hash before comparing (the registry already holds migrations sorted with `createdAt` and `templateKey`, so the check is cheap and the re-migration is rare). Exposed as `ScanFinding.currentPath(version, schemaversion)` (defaults: latest version, current schemaversion) so the admin UI asks with its own schemaversion and scanners ask about the exact content they're scanning (D12c).
- [ ] (b) Version-gated display — exact only when current version == `scannedVersion` and no relevant migration intervened. Version changes on every save, so almost never exact on an actively edited page.
- [ ] (c) Translate paths forward through the version history's patches. Accurate across moves, but nontrivial and fragile.
- [ ] (d) Introduce stable component ids in page data. The right long-term fix for many features, but a migration across all templates; far out of scope here.

**Decision: (a).**

#### D11d. Paths refer to whole components

Findings attach to **whole components** (or the page/data entry itself), never to fields inside one. The component is the unit that gets hashed (D12a), highlighted in the editor, and — for LLM scanners — judged. Keeping all three the same unit keeps identity stable and lets an LLM scanner send exactly the hashed content to the model.

- A **component** is any object in the data with a `templateKey` property (the same check `validateRecurse` makes). Valid paths: null or omitted (page-level / data-entry-level, hashing the root's own fields; an empty string is treated the same) or a path that resolves to an object with a `templateKey`.
- DOM-based scanners get component paths naturally: they map a node to its nearest ancestor `data-path` (see the open question below).
- `recordScans` resolves each path against `scannedVersion` migrated to `scannedSchemaVersion` (exactly what the scanner saw). A path that doesn't resolve to a component drops that finding with a per-result warning; the scan itself still records.
- Paths that go deeper than a component:
  - [x] **(a) Normalize** — strip trailing segments until the path resolves to an object with a `templateKey`, and accept. Lenient, and no retry round just because a scanner went one level too deep.
  - [ ] (b) Reject like a nonexistent path. Stricter contract, but punishes a harmless mistake.

  **Decision: (a).** The stored `path` is always the normalized component path.
- Assets: no paths (binary content). Unlocated asset findings could reuse the same table shape later; no `assetscan_findings` for now.

**Component outline for scanners.** The CMS exposes the component list for a given version/schemaversion: `{ path, templateKey, templateName, contentHash }` per component, page-level entry first. Generated by walking the data and collecting every object with a `templateKey`, the same walk `validatePage`/`validateRecurse` already do.

- An LLM scanner labels components with short handles (`c1…cN`), sends each one's own fields under its handle, and constrains the model's output to that handle set (JSON-schema `enum` / structured output). The model never writes a dot-path, so invalid or miscounted paths can't happen and no correction rounds are needed. The scanner maps handles back to paths.
- Together with `ScanFinding.currentPath(version, schemaversion)`, the outline lets the scanner match new findings to previous ones before calling the LLM (D12c).
- `templateName` gives the model context ("Callout", "Rich Text") without leaking template internals.

#### Open: how does a rendering scanner learn paths?

Data/LLM scanners working from the API's JSON get paths for free. A DOM-based scanner (axe) sees rendered HTML and needs a DOM-node → path mapping. Edit-mode renders already emit paths in edit bars, but the published render probably doesn't. Likely needs a render mode (e.g. preview with a flag, using the D6 service token) that adds `data-path` attributes to each component's root element **and exposes the version and schemaversion it rendered** (e.g. a meta tag), since D1 requires the scanner to report both and the render server's build-time schemaversion generally differs from the API's. Ideally the scanner can also request a specific version, so it can pin the version from its candidate query rather than racing an edit. That's rendering-server work and a dependency for the axe use case. Verify before committing.

### D12. Finding lifecycle — future activation, carry-forward, editor responses

**Motivating case: dynamic staleness scanner.** After a page is edited (24h debounce), an LLM identifies content likely to go stale quickly (e.g. step-by-step instructions for third-party software) and recommends an expiration date for each. Past that date, the page gets an alert icon and appears in the admin issues list; in the editor, each flagged component is highlighted until an editor marks it still good or edits it.

**General form:** findings that (1) may become active at a future date and (2) can be resolved by a human, with both surviving rescans. Nothing below is staleness-specific. Other scanners on the same pattern:

- Future activation: explicit-date extraction ("Register by March 1", "Fall 2026 schedule"), annually changing figures (tuition, fees, catalog-year requirements), mandatory review cycles (one page-level finding, `activeAt` = last confirmation + 1 year), contact info checked against the directory.
- Immediate but dismissible: axe "incomplete" results needing human verification (e.g. contrast over a background image), link checks against bot-blocking sites, LLM content quality (meaningless alt text, plain language, brand style, inclusive language), sensitive data (student IDs, SSNs) with false positives.
- Doesn't fit: cross-page contradictions (one finding, two targets). Deferred.

**The core problem:** `modifiedAt` exists only for the whole page. A page edited daily for a month in an unrelated area gets rescanned daily, and a naive scanner re-emits "stale in 6 months" each time, pushing the date out forever. Matching a new finding to the previous one by path fails because version (and often path) changes on every save.

#### D12a. Finding identity

- [x] **(a) CMS-computed content hash + scanner category** — at `recordScans`, the CMS resolves the finding's path in the scanned content, takes the **component's own fields excluding `areas`** (paths are whole components, D11d), serializes with stable key order, and hashes it with SHA-256, stored as unpadded base64url in `CHAR(43)` `ascii_bin` (same as `binaries.shasum`; base64url is case-sensitive, so the collation must be binary). Identity = `(scanner, target, contentHash, category)`. `category` is an optional short scanner-defined string (`software-instructions`, `color-contrast`) distinguishing different problems on the same component.
  - Component-only paths (D11d) keep the hashed unit big enough to be meaningful and the same unit an LLM scanner judges.
  - Excluding `areas` means editing a child component doesn't reset findings on its parent.
  - Page-level findings hash the page's own fields, also excluding `areas`.
  - Identical components (a repeated "contact us" block) collide; carry-forward pairs them by nearest path.
- [ ] (b) Scanner-supplied fingerprint — flexible, but every scanner must reinvent stable hashing over content it may only see as HTML, and an LLM scanner can't produce one reliably.
- [ ] (c) Path — breaks on every insert/move above the component.

**Decision: (a).** The CMS hashes automatically at the component level; scanners never compute or send hashes. This is effectively a per-component "modified since" signal, derived from versioned content at scan time, without storing per-component timestamps.

#### D12b. Carry-forward on rescan

- [x] **(a) Unreported findings close; the scanner owns continuity.** Only the current scan's findings are live, so a previous finding the scanner does **not** report again is closed (its row remains in history per D11b). Edited content hashes differently, so it can't match an old finding — matching "edit it" as one of the two ways an editor resolves a finding.
- [ ] (b) Unchanged-content findings persist unless the scanner explicitly resolves them. Protects against LLM nondeterminism silently dropping findings, but wrong for deterministic scanners: axe output can change with no data change (a template fix in a software update), and the finding should then close.

**Decision: (a), with continuity as the scanner's responsibility.** The CMS records `activeAt` exactly as sent; it never overrides it. Specifically, the scanner decides:

- **Which `activeAt` a re-reported finding gets** — the previous one (untouched or cosmetically edited content, so the date isn't pushed out) or a new one (substantive change, or a scanner that wants to reset it). That judgment is policy, so it stays in the scanner.
- **Whether to re-report previous findings that didn't turn up this time** — e.g. an LLM scanner echoes findings on unchanged components instead of re-asking the model. Anything not re-reported closes.

The CMS still carries `firstSeenAt` forward on an identity match (D12a): that's a fact about history, not policy, and the scanner doesn't need to track it.

#### D12c. How the scanner matches new findings to previous ones

To exercise D12b, the scanner must know which of its new findings correspond to previous ones. Matching is by identity (D12a), and the CMS computes the hash — so the scanner can't match on its own using raw paths: the previous findings' paths are relative to the previous scan's content, and positional paths shift between versions.

- [x] **(a) Server translates previous findings into the content being scanned, on read.** Before (or while) scanning version N at schemaversion S, the scanner fetches, in one GraphQL request, the component outline for (N, S) (D11d) and its current findings with `currentPath(version: N, schemaversion: S)` — the path of the component in that exact content whose hash matches the finding (D11c lookup, including re-hashing across relevant migrations), or null if that component was edited or removed. A new finding then matches a previous one iff `path == previous.currentPath` and `category` matches. No write round trip, no server-side state between steps.
  - Paths in the scanner's hands are already component paths: LLM scanners pick handles from the outline, and DOM scanners map nodes to the nearest `data-path`. A scanner that has a deeper path can normalize it against the outline itself (longest outline path that's a prefix), so server-side normalization (D11d) is a backstop, not something the scanner has to wait on.
  - Identical components are disambiguated by the server's nearest-path tie-break, so each previous finding gets at most one `currentPath`.
- [ ] (b) Multi-step write: `recordScans(validateOnly: true)` with the draft findings returns which ones match previous findings (and which previous findings went unreported); the scanner resolves `activeAt` and re-reports, then calls `recordScans` for real. Uses the existing validateOnly pattern and handles any path the scanner sends, but costs an extra round trip per batch, and the matches must be recomputed on the real call anyway.

**Decision: (a).** The scanner's inputs (outline + translated previous findings) are both derived from the content it is about to scan, so matching is decided before the LLM is even called. That's also what makes the cost saving work: findings whose `currentPath` is non-null sit on unchanged components, so the scanner can echo them without sending those components to the model. Only changed or new components go to the LLM, optionally with the old finding and old/new text so it can judge substantive vs. cosmetic edits.

The admin UI uses the same `currentPath` field (with no version argument, meaning latest) for editor highlighting, so this adds no scanner-specific API surface.

#### D12d. Editor responses

- [x] **(a) Separate response table keyed by finding identity** — `(scannerId, targetId, contentHash, category)` → `{ response: VERIFIED | DISMISSED, until, respondedBy, respondedAt }`. Independent of any scan row, so it survives retention cleanup and attaches automatically to any future finding with the same identity.
  - **VERIFIED until X**: "still good, check again at X". The UI can default X to now + (`activeAt` − `firstSeenAt`), reusing the scanner's original shelf life; the editor can change it. The finding is suppressed until X, then active again.
  - **DISMISSED**: false positive, suppressed for good for that identity.
  - **Fixed**: no response needed — the edit changes the hash and the finding closes on the next scan.
  - Auth: update permission on the target (it's an editorial judgment about the content). Record the actor as `users.id` (`respondedBy`), matching the `createdBy`/`deletedBy` convention. No separate impersonator column; the mutation log covers that level of forensics.
  - Cleanup: `recordScans` bumps `lastMatchedAt` on a response whenever it records a finding with that identity; the D2 retention job deletes responses whose `lastMatchedAt` is over a year old.
- [ ] (b) Response columns on the finding row, copied forward on each match. One fewer table, but responses are lost if a single scan fails to re-report the finding.

**Decision: (a).** Path is **not** part of the response key, so responses follow content, not position:

- Reordering or moving components within the target keeps every response: the hash is unchanged, so the next scan's findings match the same response.
- Editing the component drops it (new hash) — intended, since the editor's judgment was about the old content.
- Moving a component to a different page/data entry drops it (target is in the key).
- Path is only a tiebreaker for *locating* a finding among identical components (D11c, D12c). Identical components on the same target share one identity, so a response on one applies to all of them — reasonable, since identical content warrants the same judgment.

#### D12e. Open findings vs. scan summary

A finding is **open** when `activeAt` is null or ≤ now, AND there is no DISMISSED response, AND no VERIFIED response with `until` > now — counting only response types the finding allows (D14). Computed at query time — the CMS compares stored dates to the clock; it computes no dates of its own (D1 guardrail holds).

- [x] **(a) Two distinct concepts.** `Scan.issueCount`/`severities` stay the scanner-reported summary at scan time. Alerting — page badges, the admin issues list, editor highlights — runs on open findings.
- [ ] (b) Derive the summary from findings whenever a scan has findings. One number to show, but it changes over time without a rescan, which muddles trend history and makes the summary mean different things for different scanners.

**Decision: (a), with a strict split:**

- **Summary numbers are for trend analysis only** (`scanHistory`, trend charts). They are never used to filter, badge, or alert, because they can't reflect editor responses or future activation.
- **Findings drive all filtering and alerting.** The summary-based `hasIssues` / `minLevel` filters are dropped; the scan filters are `hasOpenFindings` / `openFindingMinLevel`. Badge counts and the admin issues list count open findings.
- Consequence: a scanner that wants its results to alert must report findings. One with nothing to point at reports page-level findings (null path). A summary-only scanner still contributes to trends and the "scanned/not scanned" worklist facts.
- The open-findings filter is a JOIN through the current scan to its findings, left-joined to responses; index findings on `(pagescanId, activeAt)`.

#### D12f. Worklist support for edit-triggered scanning

The 24h debounce is scanner policy, expressible as "modified since my last scan AND modified more than 24h ago". PageFilter now has `modifiedBefore`/`modifiedAfter` (on `storage.modified`) and `publishActivityBefore`/`publishActivityAfter` (on `scheduledpublishes` history) from master. DataFilter and AssetFilter still need `modifiedBefore`/`modifiedAfter` for data and asset scanners that debounce.

### D13. Site exemptions — admin controls over where scanners run

**Requirement:** admins can exempt a site from a specific scanner, or from all scanning. Examples: a site full of archived PDFs that an expensive LLM scanner shouldn't spend money on, a site whose content is synced from an external system editors can't fix, or a test site that would pollute the dashboard. This is an admin decision rather than scanner policy, so the CMS enforces it (D1's "scanner owns policy" is about scheduling, not about whether a site participates).

#### D13a. Granularity

- [x] **(a) Site-level only** — exempt a site from all scanners, or from specific scanners. Covers pages, assets, and site-scoped data in that site. Global data (no site) can't be exempted; hiding/deleting the scanner (D8) is the tool there.
- [ ] (b) Site and pagetree — e.g. "don't run the LLM scanner on sandboxes". More flexible, but the pagetree list churns (sandboxes come and go), and scanners can already skip sandboxes with `pagetreeTypes`.
- [ ] (c) Down to pages/folders. Overkill for "basic controls"; a page-level opt-out is better handled by DISMISSED responses (D12d).

**Decision: (a).**

#### D13b. Storage

- [x] **(a) `sites.scanExempt` column + a per-(site, scanner) table.** "All scanning" is a property of the site; per-scanner exemptions are rows. Both are plain FKs, no nullable ids.
- [ ] (b) One table with `scannerId` NULL meaning "all scanners". One fewer place to look, but NULL can't sit in the primary key, and it's the mostly-NULL-id pattern we've been avoiding.

**Decision: (a).** With D13c(b) adding opt-in scanners, the per-scanner table holds **overrides in both directions** rather than only exemptions: `sitescanners (siteId, scannerId, enabled)`, PK `(siteId, scannerId)`. `enabled = 0` exempts the site from an opt-out scanner; `enabled = 1` enables an opt-in scanner there; no row means the scanner's default. One table instead of separate exemption and enable tables means a site can't hold contradictory rows for one scanner, and flipping a scanner between opt-in and opt-out never makes existing rows ambiguous. Deleting a scanner (D8) cascades its rows.

#### D13c. Opt-out vs. opt-in

- [ ] **(a) Opt-out only (exemptions)** — every scanner runs everywhere unless a site is exempted. Matches the request, and is the right default for compliance scanners like axe.
- [x] **(b) Also give scanners an `optIn` flag,** so an expensive scanner (the LLM staleness scanner) only runs on sites that explicitly enable it (stored in the D13b override table).

**Decision: (b).** `scanners.optIn` (default 0), set at registration (`createScanner` or a release migration) and changed afterward only through a dedicated `setScannerOptIn` mutation (below). A scanner runs on a site when:

- the site isn't `scanExempt` (site-wide exemption always wins), AND
- there's a `sitescanners` row with `enabled = 1`, OR there's no row and the scanner isn't `optIn`.

Global data (no site) follows the scanner's default: opt-out scanners scan it, opt-in scanners don't.

**Changing `optIn` inverts the site rows**, so no site's effective status changes; only the default for sites without a row (including sites created later) does. In one transaction, with the scanner row locked (`FOR UPDATE`) so a concurrent `setSiteScanner` can't interleave:

- Opt-out → opt-in: insert `enabled = 1` for every site with no row (they were active by default), then delete the `enabled = 0` rows (exempt is now the default).
- Opt-in → opt-out: insert `enabled = 0` for every site with no row, then delete the `enabled = 1` rows.
- No-op if the flag already has the requested value.

Rows are written for every site, including deleted ones, so an undeleted site comes back with the status it had. A release migration that flips `optIn` must do the same inversion. To actually turn an expensive scanner off across existing sites, flip it to opt-in and then remove the enables you don't want; the flip alone deliberately changes nothing that's running.

#### D13d. Enforcement

- [x] **(a) CMS-enforced at every scanner touchpoint:**
  - Worklist facts in `ScanFilter` never match a target on a site where the named scanner (`scannerNames`) isn't enabled (D13c's rule), so exempt and not-opted-in sites simply never show up in a scanner's candidate list. Scanners need no changes.
  - `claimScans` doesn't grant exempt targets (reported like a target claimed by a sibling, with a per-target message saying why).
  - `recordScans` rejects results for exempt targets with a per-result warning, which covers a scan that was in flight when the exemption was set.
- [ ] (b) Advisory — expose `exempt` on targets and trust scanners to check. Every scanner reimplements it, and one that forgets keeps posting results.

**Decision: (a).** "Exempt" throughout means "not enabled under D13c's rule", covering both exemptions and opt-in scanners a site hasn't enabled.

#### D13e. Existing results on an exempted site

- [x] **(a) Hide, don't delete.** Exempt targets' findings are left out of badges, the admin issues list, the open-findings filters, and editor highlights; the data stays. Removing the exemption brings them back, and normal D2 retention eventually ages them out. Trend views (`scanHistory`) still show history, since the exemption doesn't make past scans untrue.
- [ ] (b) Delete the site's scans for that scanner when exempting. Simpler mental model, but an accidental click is unrecoverable.

**Decision: (a).**

#### D13f. Authorization — `manageScanners`

All human-side scanner administration needs a permission: the registry (D8: create, update, delete) and exemptions (this decision). Scanners themselves hold no grant (D7).

- [x] **(a) New `manageScanners` global grant.**
- [ ] (b) Reuse an existing global grant. There's no `manageSites`; the candidates are `manageTemplates` (closest in spirit: an admin deciding what's allowed on which sites, and its holders already work in the site detail page's "Authorized Templates" panel) or `createSites`. Saves a column and a checkbox in the role editor, but stretches a grant's meaning, so a role that should manage templates but not scanning (or vice versa) can't be expressed.

**Decision: (a).** The grant name says what it does. Exemptions stay with global admins rather than site managers (e.g. the site `governance` grant): accessibility scanning is a compliance tool, and a site shouldn't be able to waive it for itself. Site managers can still **see** the exemption status on their site.

Adding it means a column on `globalrules`, a checkbox in the admin UI's global rule editor, and a database migration:

- `ALTER TABLE globalrules ADD COLUMN manageScanners TINYINT UNSIGNED NOT NULL DEFAULT 0` (same shape as the existing grant columns).
- `UPDATE globalrules g INNER JOIN roles r ON r.id = g.roleId SET g.manageScanners = 1 WHERE r.name = 'superuser'` (role names are unique).
- Leave `seeddb` alone: fresh installs run every migration after the initial seed, so this migration covers new and existing databases alike.

#### D13g. UI

- **Site detail page** (`dosgato-admin` `src/routes/sites/[id]`): a new "Scanning" `DetailPanel` alongside "Authorized Templates", following the same pattern. It lists each non-hidden scanner that applies to sites (`scansPages`/`scansAssets`/`scansData`) with its status on this site — Active, Exempt, or Not enabled (opt-in scanners without an enable) — and an Exempt/Enable/Reset-to-default action, plus a site-wide "Exempt from all scanning" toggle at the top. With site-wide exemption on, the per-scanner rows show as exempt and their controls are disabled. Actions are gated by `site.permissions.manageScanning` (true for `manageScanners` holders).
- **Scanners admin page** (new, global): lists scanners with client id, display name, target types, opt-in flag, and exempt- or enabled-site count; adds a scanner (client id, display name, target types, opt-in, retention); edits those plus the hidden flag (with opt-in as its own control, since changing it inverts site rows; the confirmation can explain that existing sites keep their status); deletes a scanner (with a confirmation naming how many scans will go); and shows/edits each scanner's exempt (or, for opt-in scanners, enabled) sites. This gives D8's mutations a home they don't have yet.
- **Badges/dashboard**: exempt targets show no scan badge at all rather than "clean", so an exemption isn't mistaken for a pass.

### D14. Scanner-controlled responses and per-finding management links

**Problem:** D12d responses attach to one component's content on one target. That's right for staleness or axe, but wrong for a link checker. A false positive there is about a **URL**, which may appear on hundreds of pages. Dismissing it on page A leaves page B flagged, and an unrelated edit to the component on page A drops the dismissal even though the link is unchanged.

- [ ] (a) CMS-side subject-scoped responses: scanner supplies a `subject` key (e.g. normalized URL), and a response can apply to every finding with that subject. Pulls two things into the CMS it shouldn't own: the subject's semantics (is `http://x.com/a` the same as `https://x.com/a/`? does it cover the domain? is a redirect fine?) and authorization (an editor on site A would suppress findings on site B they have no rights to).
- [x] **(b) Scanner owns cross-target suppression; the CMS lets the scanner control responses per finding and link to its own UI.** The link checker keeps its own domain/link allow list, behind its own management UI with its own authorization rules, and simply doesn't report suppressed links. The CMS adds:
  - **`allowedResponses` per finding** in `ScanFindingInput` (omitted = all). The link checker sends `[]`, so editors can't respond in the CMS and aren't tempted to dismiss one page's finding instead of fixing the allow list. Staleness sends `[VERIFIED]` (dismissing a staleness warning makes no sense). axe "incomplete" results send both. Per finding rather than a per-scanner admin setting: it's scanner policy, and it lets one scanner treat categories differently.
  - **Only allowed responses count.** Open-finding computation (D12e) ignores a stored response the current finding doesn't allow, and `respondToFindings` rejects a response type the finding doesn't allow. Otherwise a scanner that stops allowing dismissals would have its findings hidden forever by old dismissals.
  - **`manageUrl` per finding**: an optional link into the scanner's own UI for this finding's subject ("Manage this link in Link Checker"). The editor UI shows it where the respond buttons would be, so a finding without CMS responses is never a dead end. The per-scan `detailUrl` can't do this because it can't point at one link. Sanitized like `detailUrl`.
- [ ] (c) Like (b), but the scanner reads CMS dismissals and promotes them into its own allow list, so it needs no management UI. Possible later with no CMS change beyond a "responses for my scanner since X" query, but every editor's single dismissal becomes a decision for every site. Workable for a small trusted group, not as a default.

**Decision: (b).** Storage: `allowVerify` and `allowDismiss` flags (default 1) and `manageUrl VARCHAR(1024)` on the findings tables.

---

## Settled requirements (not decisions)

- **Zero-issue scans get a row** — a clean target is still "recently scanned."
- **Failed scans get a row** — `status` column (SUCCESS / ERROR / PARTIAL) so failures don't retry forever at the front of the queue or masquerade as 0 issues.
- **Scans on deleted/unpublished/orphaned targets** fall out of display and rollups via the standard `deleteStates` / `live` filtering.
- **Batch recording** — one mutation accepts many results; no round trip per target.
- **Partial success** — `recordScans` processes each result independently; invalid entries (archived target per D6, target deleted between fetch and post, malformed input) produce per-result validation messages (ValidatedResponse arg paths) without failing the rest of the batch.
- **Sanitize `detailUrl`** — rendered as a clickable link; reject `javascript:` etc.
- **Record the URL actually fetched** (`scannedUrl`) for debugging where applicable (pages, assets; null for data); `scannedAt` is the content **fetch** time, supplied by the scanner (validated against server clock, defaults to now) — the modifiedAt-vs-scannedAt comparison depends on it.
- **Located findings** — scanners can flag dot-separated content paths per finding (D11), with future activation and editor responses that survive rescans (D12). Full per-issue detail beyond path/severity/message still lives behind `detailUrl`.

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
  keepFindingsScans SMALLINT UNSIGNED NOT NULL DEFAULT 5,   -- D2: detail tier (min 1)
  keepSummaryMonths SMALLINT UNSIGNED NOT NULL DEFAULT 24,  -- D2: summary tier
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
  scannedVersion MEDIUMINT UNSIGNED NOT NULL,  -- D1: provenance — recreate scanned state from
                                               --   versioned storage (all three tables)
  scannedSchemaVersion DATETIME NOT NULL,      -- D1: schemaversion the content was migrated to
                                               --   when fetched (pagescans + datascans only)
  status TINYINT UNSIGNED NOT NULL,
  issueCount SMALLINT UNSIGNED NOT NULL,
  detailUrl VARCHAR(1024),
  scannedUrl VARCHAR(1024),
  current TINYINT UNSIGNED NOT NULL DEFAULT 1, -- D2(b): one current row per (scanner, target),
                                               --   maintained transactionally on insert
  findingsPruned TINYINT UNSIGNED NOT NULL DEFAULT 0, -- D2: findings removed by retention
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

-- D11a: located findings, full history (D11b). Pages shown; datascan_findings
-- identical. No assetscan_findings for now.
CREATE TABLE pagescan_findings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pagescanId INT UNSIGNED NOT NULL,
  path TEXT,                                   -- D11d: component path; NULL = page-level. TEXT since
                                               --   deep nesting can pass 255; not indexed (D12a)
  contentHash CHAR(43) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,  -- D12a: the component's own fields,
                                                        --   excluding areas, at scannedSchemaVersion
  category VARCHAR(64) CHARACTER SET 'ascii' NOT NULL DEFAULT '', -- D12a: scanner-defined; '' not
                                                                  --   NULL since it's in the identity
                                                                  --   (responses PK, join equality);
                                                                  --   the API maps '' <-> null
  severity VARCHAR(32) NOT NULL,               -- D3(a): scanner-defined label
  level TINYINT UNSIGNED NOT NULL,             -- normalized 1-5, 5 = most severe
  message VARCHAR(1024) NOT NULL,
  activeAt DATETIME,                           -- D12: null = active immediately
  firstSeenAt DATETIME NOT NULL,               -- D12b: carried forward on identity match
  allowVerify TINYINT UNSIGNED NOT NULL DEFAULT 1,  -- D14: scanner-controlled responses
  allowDismiss TINYINT UNSIGNED NOT NULL DEFAULT 1,
  manageUrl VARCHAR(1024),                     -- D14: link into the scanner's own UI
  PRIMARY KEY (id),
  INDEX scan_active (pagescanId, activeAt),    -- D12e: open-findings filter
  FOREIGN KEY (pagescanId) REFERENCES pagescans (id) ON DELETE CASCADE
);

-- D12d: editor responses, keyed by finding identity so they outlive scan rows.
-- datafinding_responses identical with dataId.
CREATE TABLE pagefinding_responses (
  scannerId SMALLINT UNSIGNED NOT NULL,
  pageId INT UNSIGNED NOT NULL,
  contentHash CHAR(43) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
  category VARCHAR(64) CHARACTER SET 'ascii' NOT NULL DEFAULT '',
  response TINYINT UNSIGNED NOT NULL,          -- VERIFIED / DISMISSED
  until DATETIME,                              -- VERIFIED only: suppressed until this time
  respondedBy MEDIUMINT UNSIGNED NOT NULL,     -- users.id, like createdBy/deletedBy elsewhere
  respondedAt DATETIME NOT NULL,
  lastMatchedAt DATETIME NOT NULL,             -- D12d: drives cleanup
  PRIMARY KEY (scannerId, pageId, contentHash, category),
  FOREIGN KEY (scannerId) REFERENCES scanners (id),
  FOREIGN KEY (pageId) REFERENCES pages (id),
  FOREIGN KEY (respondedBy) REFERENCES users (id)
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
  keepFindingsScans: Int!   # D2 retention: scans per target that keep their findings
  keepSummaryMonths: Int!   # D2 retention: months scan summaries are kept
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
  scannedVersion: Int!   # version of the target that was scanned (provenance)
  scannedSchemaVersion: SchemaVersion  # schemaversion it was migrated to (null for assets)
  status: ScanStatus!
  issueCount: Int!
  severities: [SeverityCount!]!
  detailUrl: String
  stale: Boolean!        # convenience: target modifiedAt > scannedAt
  # D11/D12: located findings reported by this scan (history kept, D11b)
  findings(openOnly: Boolean): [ScanFinding!]!
  findingsPruned: Boolean!  # D2: findings removed by retention ("details expired")
}

# D11d: component outline for scanners (Data gets the same field)
type ComponentOutline {
  path: String            # null for the page itself
  templateKey: String!
  templateName: String!
  contentHash: String!    # D12a: own fields excluding areas, at the requested schemaversion
}
extend type Page {
  components(version: Int, published: Boolean, schemaversion: SchemaVersion): [ComponentOutline!]!
}

enum FindingResponseType { VERIFIED DISMISSED }

type FindingResponse {
  response: FindingResponseType!
  until: DateTime         # VERIFIED only
  respondedBy: User!
  respondedAt: DateTime!
}

type ScanFinding {
  id: ID!
  path: String            # D11d: component path relative to the scanned content; null = page-level
  # D11c/D12c: path of the component with a matching contentHash in the given content
  # (defaults: latest version, current schemaversion); null when it was edited or removed
  currentPath(version: Int, schemaversion: SchemaVersion): String
  category: String
  severity: String!
  level: Int!
  message: String!
  activeAt: DateTime      # D12: null = active immediately
  firstSeenAt: DateTime!
  open: Boolean!          # D12e: active, not dismissed, not verified past now
  allowedResponses: [FindingResponseType!]!  # D14: set by the scanner; [] = manage in the scanner
  manageUrl: String       # D14: link into the scanner's own UI for this finding's subject
  response: FindingResponse
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
  hasOpenFindings: Boolean     # D12e: current scan has open findings (AND'ed, for reports)
  openFindingMinLevel: Int     # D12e: only count open findings with level >= this
}
# D12f: PageFilter already has modifiedBefore/modifiedAfter; DataFilter/AssetFilter gain them
# pages(filter: { scans: { ... }, live: true })
# assets(filter: { scans: { ... } })
# data(filter: { scans: { ... } })

extend type Mutation {
  # D7: scanner must be registered (D8) AND scanner === ctx.auth.clientId.
  recordScans(scanner: String!, results: [ScanResultInput!]!): ValidatedResponse!

  # D9: atomic claim — same auth as recordScans. Returns the subset of targets
  # actually granted; the rest are validly claimed by a sibling instance.
  # expectedDuration in seconds (sanity-capped); claims expire on their own.
  claimScans(scanner: String!, targets: [ScanTargetInput!]!, expectedDuration: Int!): ClaimScansResponse!

  # D8 admin mutations: manageScanners grant (D13f), no clientId match
  createScanner(name: String!, displayName: String!, scansPages: Boolean!, scansAssets: Boolean!, scansData: Boolean!): ValidatedResponse!
  updateScanner(scanner: String!, displayName: String, scansPages: Boolean, scansAssets: Boolean, scansData: Boolean, hidden: Boolean): ValidatedResponse!
  deleteScanner(scanner: String!): ValidatedResponse!   # removes scanner + all its scans

  # D12d: editor responses. Requires update permission on each finding's target.
  # Stored by finding identity, so it applies to future matching findings too.
  respondToFindings(findingIds: [ID!]!, response: FindingResponseType!, until: DateTime): ValidatedResponse!
  clearFindingResponses(findingIds: [ID!]!): ValidatedResponse!
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

input ScanFindingInput {
  path: String           # D11d: whole-component path (deeper is normalized); omit for page-level
  category: String       # D12a: distinguishes different problems on the same component
  severity: String!
  level: Int!
  message: String!
  activeAt: DateTime     # D12: when this becomes a problem; omit for immediately. Recorded as
                         #   sent; the scanner chooses whether to reuse a previous value (D12b)
  allowedResponses: [FindingResponseType!]  # D14: omit for all; [] = no CMS responses
  manageUrl: String      # D14: link into the scanner's UI, shown in place of respond buttons
}

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
  scannedVersion: Int!   # version the scanner fetched (required, D1)
  scannedSchemaVersion: SchemaVersion  # schemaversion the fetched content was migrated to;
                                       #   required for pages/data, rejected for assets (D1)
  findings: [ScanFindingInput!]  # D11: pages/data only; capped per result
}
```

## Open questions / later

- Site/folder-level rollup queries for dashboards (child severity table keeps this a GROUP BY).
- Asset **metadata** edits (alt text, title) trip `modifiedSinceScan` just like binary replacement. If a scanner only cares about binary changes, a `scannedShasum` column on assetscans could return as an additive queue condition later.
- `modifiedAt` lives on `storage.modified` and `publishedAt` on the version `tags` table — verify the scan-relative filter JOINs perform acceptably or add indexes there.
- Trend display UI — the data is there (`scanHistory` field, D2); chart design is a front-end question.
- Editor-facing "request rescan now" button? (Would need a way to signal scanners — out of scope for the pull-based model, but a `rescanRequestedAt` column would be an easy hook.)
