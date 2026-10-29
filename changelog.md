# Changelog

## 2.0.8

### Fixes a reindex crash introduced in 2.0.7

**If you deployed 2.0.7, upgrade to 2.0.8.** 2.0.7 started indexing external link URLs as fulltext so phraseSearch could find them, and it ships a migration that reindexes every page. Rich text stores links as serialized LinkDefinitions, so an old image pasted in as a data URI looks like `{"type":"url","url":"data:image/png;base64,..."}`. 2.0.7 turned every one of those into hundreds of thousands of n-grams. The reindex would spend minutes inserting them while holding the global index lock, so editors saving pages got `Lock wait timeout exceeded`, and then the API ran out of memory and got killed. The page never got marked as indexed, so the next reindex run tried it again, over and over.

Now only URLs with a real hostname, plus `mailto:` addresses, are indexed as fulltext. Words longer than 50 characters are also skipped, both when indexing and when building a phraseSearch query, so no other long token can do the same thing. That means phraseSearch can no longer find a single word longer than 50 characters, but I can't think of a real word that long.

## 2.0.7

Deploy 2.0.8 instead of this release. See above.

### phraseSearch finds link URLs and page names

Say an editor needs to find every page that emails `webmaster@example.com` or links to an old vendor's site. Before, phraseSearch only looked at visible text, so it didn't help. Now a page matches when the phrase appears in:

- **external link URLs**, without the query string and hash. Those are mostly tracking ids that would bloat the index, so `trackingid=...` still won't match anything.
- **`mailto:` addresses**, so `@example.com` works.
- **the page's name.** Names aren't versioned, so they match regardless of the entry's `published` setting.

A migration resets the page reindex target, so every page gets reindexed in the background, 1000 pages per run of the `reindexPages` task. On a large site that takes a while, and until a page gets its turn, its links aren't searchable.

### New filters

- `PageFilter`: `modifiedBefore`/`modifiedAfter` on the latest version, and `publishActivityBefore`/`publishActivityAfter` for pages that were published, republished or unpublished in a time window. When you use both publish activity bounds, a single publish or unpublish has to fall inside the window. You can't satisfy one bound with one event and the other bound with a different event. Publish history only goes back to March 2026.
- `AssetFilter`: `modifiedBefore`/`modifiedAfter`, plus `mimes` (`image/*` wildcards work) and `extensions`. Extensions come from the detected mime type, so `jpeg` also finds `.jpg` files. If you use both `mimes` and `extensions`, an asset only has to match one of them.
- `DataFilter`: `modifiedBefore`/`modifiedAfter`.

### Smaller changes

- Deleting a published page now records an unpublish in its publish history, so it shows up in `publishActivity` filters.
- When adding a team member, the user lookup is now case-insensitive, and it confirms the user was found even before any roles are selected.

## 2.0.6

### Current schema version is derived from migrations

The API no longer reads `/.builddate` to decide its current schema version. It is now the `createdAt` of the newest migration registered across all page, component and data templates, computed when the server starts. Things to know:

- **Remove the `/.builddate` step from your API Dockerfile.** The file is ignored. Render and admin still set their own schema version at build time; only the API changes.
- **No more freezing the build date on maintenance branches.** An emergency build from an older branch automatically stores data at that branch's newest migration date, so migrations written since then still run when they ship. Previously a stale frozen date could sit behind existing migrations, and every save would run those migrations' `down` functions against production data.
- If no template defines a migration, the current version falls back to server startup time, where it cannot affect anything.
- **Startup fails if any migration is dated in the future.** Such a migration would make the current schema version jump ahead of real time, and would be skipped for anything saved between now and its date.
- **Expedited releases that include a migration need care with its date.** It must be later than the newest migration in production and earlier than every unreleased migration on the main branch, or one side or the other is skipped for data saved in between. See "Dating migrations" in the README. Expedited releases without a migration need nothing.
- Stored `savedAtVersion` tags will now be migration dates rather than build dates. Existing data tagged later than the newest migration is re-tagged on its next save with no data change.

### Forward migrations now run oldest first

The registry's forward and backward migration lists were the same array, sorted descending, because the sort helper sorts in place. Forward migrations were therefore applied newest first. Migrations on the same template that depend on each other's output ran in the wrong order.

### Migration range boundaries

A schema version equal to a migration's `createdAt` now consistently means "after that migration" in both directions: moving from version A to B runs the migrations in (A, B] forward or (B, A] backward. Previously the backward range included the target and excluded the start, and the forward data range excluded the target. These were latent inconsistencies that became reachable once stored data is routinely tagged exactly at a migration date.

## 2.0.1

### Analytics endpoint replaces hand-rolled user event routes

`DGServer` now registers fastify-txstate's analytics plugin automatically, so the admin UI can report user interaction events to `POST /analytics`. Things to know:

- **`NODE_ENV` must be set** (`development` or `production`) or startup will fail.
- By default, events are stored in elasticsearch when `ELASTICSEARCH_URL` is set, printed to the console in development, and sent to the server log otherwise.
- Unauthenticated event submissions are rejected with a 401 by default.
- If you previously added your own route for collecting UI events, you can remove it and use the new `analytics` option on `server.start()` to customize behavior:

```typescript
await server.start({
  analytics: {
    appName: 'my-cms-admin', // identifies the reporting app in stored events, default 'dosgato-admin'
    analyticsClient: myCustomClient, // extend AnalyticsClient from fastify-txstate to store events elsewhere
    authorize: req => true // e.g. accept events from unauthenticated visitors
  }
})
```

## 2.0.0

This release upgrades to `@txstate-mws/graphql-server` v3, which brings fastify 5, type-graphql 2, and a reorganized authentication model. Most of the breaking changes below flow from that upgrade. The database schema is unchanged — no new migrations run on upgrade, and downgrading remains possible.

### Breaking: you must provide an `authenticate` function

JWT verification is no longer built into the graphql-server `Context`. Authentication now happens in fastify-txstate, and you must pass an `authenticate` function to the `DGServer` constructor:

```typescript
import { jwtAuthenticate } from 'fastify-txstate'
import { DGServer } from '@dosgato/api'

const server = new DGServer({ authenticate: jwtAuthenticate({ authenticateAll: true }) })
```

`jwtAuthenticate` validates JWTs from the `Authorization: Bearer` header or a session cookie and is configured entirely through environment variables. At least one trusted issuer must be configured:

- `UA_URL` — a TxState Unified Auth service
- `OAUTH_URLS` — comma-separated OAuth/OIDC issuer URLs (JWKS auto-discovery)
- `JWT_SECRET` — symmetric HMAC secret; tokens must carry `iss: 'jwt-secret'`
- `JWT_PUBLIC_KEY` — PEM-encoded public key; tokens must carry `iss: 'jwt-public-key'`
- `JWT_TRUSTED_ISSUERS` — JSON array for advanced/multi-issuer setups

Note that `JWT_SECRET` alone is no longer enough for tokens without a matching `iss` claim — if you mint your own service tokens, they must now include `iss: 'jwt-secret'` (or an issuer you define in `JWT_TRUSTED_ISSUERS`). See the fastify-txstate README for full details, or write your own `authenticate` function for custom schemes.

### Breaking: auth payload shape changed from `sub`/`client_id` to `username`/`clientId`

The API resolves the acting user from `ctx.auth.username ?? ctx.auth.clientId` instead of `ctx.auth.sub ?? ctx.auth.client_id`. `jwtAuthenticate` maps the `sub` claim onto `username` for you, but:

- If you wrote a custom `authenticate` function, it must return a `FastifyTxStateAuthInfo`-shaped object (`username`, `sessionId`, `token`, optional `clientId`).
- Any of your own code reading `ctx.auth.sub` or `ctx.auth.client_id` must be updated.
- The `DosGatoService` base class's auth type is now `FastifyTxStateAuthInfo`.

### Breaking: context creation and prefetching

- `templateRegistry.getCtx(req)` is now **async**. If you register custom routes that create a context from the request, add an `await`.
- `ctx.waitForAuth()` is gone. Token validation happens before the request reaches your code, so `ctx.auth` is populated synchronously; the role/permission prefetch that used to live in `waitForAuth` now runs in `ctx.prefetch()`, which `getCtx` and the GraphQL server call for you. If you were calling `waitForAuth()` in custom routes, simply remove the call (and make sure you `await getCtx`).
- Constructing a mock context with `new MockContext({ sub: 'login' })` no longer works. Use the exported helpers instead:

```typescript
import { systemContext, userContext } from '@dosgato/api'

const ctx = await userContext('su01')   // acts as the given login
const sysCtx = await systemContext()    // acts as the system user
```

### Breaking: pagination types moved to @txstate-mws/graphql-server

The pagination machinery was upstreamed into graphql-server 3.1 and is no longer exported from `@dosgato/api`:

- `Pagination`, `SortEntry`, `PaginationResponse`, and `PageInformation` must now be imported from `@txstate-mws/graphql-server`.
- `ctx.executePaginated(queryType, pagination, work)` changed signature to `ctx.executePaginated(queryType, { pagination, sort }, work)`.
- `ctx.getPaginationInfo(queryType)` still exists but is now provided by the library context.
- The `PageInformationResolver` export was renamed to `DGPageInformationResolver`; the name `PageInformationResolver` now refers to the library's generic resolver that provides the top-level `pageInfo` query.
- Schema note for API clients: the `pageInfo { pages, scheduledPublishes }` fields are now nullable.

### Breaking: ESM, fastify 5, and toolchain requirements

- `@txstate-mws/graphql-server` v3 is ESM-only. Your project should use `"type": "module"` and `"module": "NodeNext"` / `"moduleResolution": "NodeNext"` in tsconfig. Node 24+ is recommended.
- Fastify was upgraded from 4.x to 5.x. Any plugins or routes you register on `server.app` must be fastify 5 compatible. If you pass a logger instance in the `DGServer` constructor config, use the `loggerInstance` option (fastify 5 renamed it from `logger`).
- type-graphql was upgraded to 2.x (and is no longer a direct dependency of `@dosgato/api` — it arrives via graphql-server).
- Other dependency bumps you may share: `@fastify/multipart` 9.x (no longer a direct dependency — it comes via graphql-server), `archiver` 8.x, `mysql2-async` 2.0.4+.

### Non-breaking additions

- New `pageReferenced` filter on the `pages` query — find pages whose content links to a given page.
- Numerous previously skipped automated tests were unskipped and several related bugs fixed along the way.
