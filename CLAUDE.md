# structured-queries Development Guidelines

Type-safe, hierarchical query options factories for TanStack Query.

## Tech Stack

- **TypeScript 5.4+** — strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true
- **@tanstack/query-core >=5.0.0** — peer dependency only (devDep for tests)
- **Build:** tsup (ESM + CJS dual output)
- **Test:** vitest
- **Lint:** eslint (typescript-eslint strict-type-checked) + prettier

## Project Structure

```text
src/
  index.ts          — public API re-exports
  create.ts         — createQueryOptions factory
  merge.ts          — mergeQueryOptions utility
  types.ts          — shared types (inferQueryKeys)
tests/
  unit/
  integration/
```

## Commands

```sh
npm test              # vitest run
npm run test:watch    # vitest (watch mode)
npm run typecheck     # tsc --noEmit
npm run lint          # eslint + prettier --check
npm run format        # prettier --write
npm run build         # tsup
```

## Code Style

- ESLint strict-type-checked config; `@typescript-eslint/no-explicit-any` is warn, not error
- Unused vars prefixed with `_` are allowed
- ESM module syntax (verbatimModuleSyntax, type: "module")
- Node >=18

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
