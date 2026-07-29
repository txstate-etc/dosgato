# Changelog

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
