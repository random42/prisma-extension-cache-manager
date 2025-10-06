# Copilot Instructions for prisma-extension-cache-manager

## Quick context
- This package ships a Prisma Client extension that wraps cache-manager caches to memoize model reads.
- Source lives in `src/`, compiled output goes to `dist/` via the TypeScript build.
- Tests and the example rely on SQLite schemas under `test/prisma/` and `example/prisma/`.

## Extension architecture
- `src/index.ts` exports the extension created with `Prisma.defineExtension`, wiring a provided cache into `client.$cache` and intercepting `$allModels` `$allOperations`.
- Supported cached operations are declared in `CACHE_OPERATIONS` (`findUnique*`, `findFirst*`, `findMany`, `count`, `groupBy`, `aggregate`); keep this list and `ModelExtension` typings in sync.
- Queries opt in via `args.cache` accepting `true`, a TTL number, or `{ ttl?, key? }`; `_parseConfig` normalizes this into `{ ttl, key }`.
- Cache keys default to `defaultKeyGenerator`, hashing `{ model, operation, args }` with `object-code`. Decimal fields are intentionally avoided because `v8` serialization cannot handle them.
- Intercepted queries call `cache.wrap(key, () => query(filteredArgs), ttl)`; always strip `cache` from the forwarded arguments.

## Key conventions
- When extending behavior, respect the strict typing in `src/types.ts`—tests assert every operation in `CACHE_OPERATIONS` hits the cache exactly once.
- If you add cacheable operations, update both `REQUIRED_ARGS_OPERATIONS`/`OPTIONAL_ARGS_OPERATIONS` and the coverage tests in `test/main.test.ts`.
- TTL values are milliseconds; tests depend on this when sleeping between calls.
- The package exposes `defaultKeyGenerator` for reuse, but consumers may supply their own via the `keyGenerator` config.

## Build & test workflows
- Minimum runtime is Node 18.18 (see `package.json` engines field).
- `npm run build` cleans `dist/` (via `rimraf`) and runs `tsc` with `declaration` output.
- `npm run test` resets the SQLite schema with `prisma db push --schema=./test/prisma/schema.prisma` before executing Node’s built-in test runner with `ts-node/register`.
- Tests expect Prisma metrics to be enabled; regenerating clients inside tests reinitializes metrics counters.

## Local usage examples
- The example app (`example/index.ts`) builds a memory cache using `cache-manager` + `keyv` and validates `$cache` and query memoization.
- To run the example, build first (so `../dist` exists) and use a SQLite database at `example/prisma/dev.db` generated via `prisma db push`.

## Gotchas & tips
- Cache stores must serialize to strings; the tests configure `cache-manager` with `Keyv` plus custom `serialize`/`deserialize` using Node `v8`.
- When comparing cached vs. uncached behavior, tests rely on Prisma query metrics—use `sleep` helpers similar to `test/main.test.ts` when validating TTL changes.
- Avoid using `Prisma.Decimal` in cached payloads unless your custom key generator understands how to serialize them.
