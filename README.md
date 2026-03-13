<h1 align="center">structured-queries</h1>

<p align="center">
  Type-safe, hierarchical query options factories for <a href="https://tanstack.com/query">TanStack Query</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/structured-queries"><img src="https://img.shields.io/npm/v/structured-queries" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/structured-queries"><img src="https://img.shields.io/npm/dm/structured-queries" alt="npm downloads"></a>
  <a href="https://bundlephobia.com/package/structured-queries"><img src="https://img.shields.io/bundlephobia/minzip/structured-queries" alt="bundle size"></a>
  <a href="https://github.com/MatthiasWissink/structured-queries/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/structured-queries" alt="license"></a>
</p>

<p align="center">
  Define and organise your queries as a structured, composable tree. Each node is directly compatible with <code>useQuery</code>, <code>useInfiniteQuery</code>, <code>fetchQuery</code>, and friends — no wrappers needed.
</p>

---

## Why?

Inspired by [query-key-factory](https://github.com/lukemorales/query-key-factory) by Luke Morales. `structured-queries` takes the idea further with hierarchical sub-queries, parameterised nodes, infinite query support, and a single tree that produces ready-to-use query options.

## Features

- **Hierarchical query keys** — built automatically from the tree structure
- **Parameterised nodes** — closure-based `queryFn` with type-safe parameters
- **Deep nesting** — arbitrarily nested sub-queries via `$sub`
- **Infinite queries** — first-class `useInfiniteQuery` / `fetchInfiniteQuery` support
- **Partial keys** — uncalled dynamic nodes expose `.queryKey` for invalidation
- **Type-safe cache** — `DataTag`-branded keys for typed `getQueryData`
- **`skipToken` support** — conditional queries with full type narrowing
- **`inferQueryKeys`** — extract the union of all possible key tuples
- **Options passthrough** — `staleTime`, `gcTime`, `retry`, and all other TanStack Query options
- **Zero runtime dependencies** — only `@tanstack/query-core >=5` as a peer dep
- **ESM + CJS** — dual output, tree-shakeable

## Install

```sh
npm install structured-queries
```

> **Peer dependency:** `@tanstack/query-core >=5.0.0`, satisfied by any TanStack Query v5 package (`@tanstack/react-query`, `@tanstack/vue-query`, etc.).

## Quick Start

```ts
import { createStructuredQuery } from 'structured-queries'
import { useQuery } from '@tanstack/react-query'

const todos = createStructuredQuery('todos', {
  all: {
    queryFn: () => fetch('/api/todos').then((r) => r.json()),
  },
  byId: (id: string) => ({
    params: [id],
    queryFn: () => fetch(`/api/todos/${id}`).then((r) => r.json()),
  }),
})

// Fetch all todos
const { data } = useQuery(todos.all)

// Fetch a single todo
const { data: todo } = useQuery(todos.byId('abc'))

// Invalidate everything under "todos"
queryClient.invalidateQueries({ queryKey: todos.queryKey })

// Invalidate all "byId" queries regardless of param
queryClient.invalidateQueries({ queryKey: todos.byId.queryKey })
```

## API Reference

### `createStructuredQuery(scope, definition)`

Creates a structured query tree for a single domain scope.

```ts
const tags = createStructuredQuery('tags', {
  // Static leaf — queryFn required
  all: {
    queryFn: () => api.getTags(),
    staleTime: 60_000,
  },

  // Dynamic (parameterised) node — function returning params + queryFn
  byId: (id: string) => ({
    params: [id],
    queryFn: () => api.getTag(id),
    subQueries: {
      posts: {
        queryFn: () => api.getTagPosts(id),
      },
    },
  }),

  // Scope node — groups children, optionally has its own queryFn
  filters: {
    subQueries: {
      active: {
        queryFn: () => api.getActiveTags(),
      },
    },
  },
})
```

**Resolved query keys:**

| Access                      | `queryKey`                                     |
| --------------------------- | ---------------------------------------------- |
| `tags`                      | `["tags"]`                                     |
| `tags.all`                  | `["tags", "all"]`                              |
| `tags.byId`                 | `["tags", "byId"]` (partial, for invalidation) |
| `tags.byId("1")`            | `["tags", "byId", "1"]`                        |
| `tags.byId("1").$sub.posts` | `["tags", "byId", "1", "posts"]`               |
| `tags.filters`              | `["tags", "filters"]`                          |
| `tags.filters.$sub.active`  | `["tags", "filters", "active"]`                |

Every node with a `queryFn` is directly compatible with `useQuery`, `fetchQuery`, etc.

### Combining Multiple Domains

Use plain objects to combine multiple query trees into a single namespace:

```ts
import { createStructuredQuery } from 'structured-queries'

const tags = createStructuredQuery('tags', {
  /* ... */
})
const news = createStructuredQuery('news', {
  /* ... */
})
const users = createStructuredQuery('users', {
  /* ... */
})

const api = { tags, news, users }

api.tags.all // { queryKey: ["tags", "all"], queryFn: ... }
api.news.latest // { queryKey: ["news", "latest"], queryFn: ... }
api.users.me // { queryKey: ["users", "me"], queryFn: ... }
```

### `inferQueryKeys<T>`

Type helper that extracts the union of all possible query key tuples from a tree.

```ts
import type { inferQueryKeys } from 'structured-queries'

type TagKeys = inferQueryKeys<typeof tags>
// readonly ["tags"]
// | readonly ["tags", "all"]
// | readonly ["tags", "byId"]
// | readonly ["tags", "byId", string]
// | readonly ["tags", "byId", string, "posts"]
// | readonly ["tags", "filters"]
// | readonly ["tags", "filters", "active"]
```

## Guide

### Node Types

<details>
<summary><strong>Static Leaf</strong> — a node with a <code>queryFn</code> and no children</summary>

```ts
{
  queryFn: () => fetch('/api/items').then(r => r.json()),
  staleTime: 30_000,
  gcTime: 300_000,
}
```

</details>

<details>
<summary><strong>Dynamic (Parameterised) Node</strong> — a function returning a node definition with <code>params</code></summary>

```ts
;(id: string) => ({
  params: [id],
  queryFn: () => fetch(`/api/items/${id}`).then((r) => r.json()),
})
```

Multi-segment keys are supported:

```ts
;(p: { owner: string; name: string }) => ({
  params: [p.owner, p.name],
  queryFn: () => fetch(`/api/repos/${p.owner}/${p.name}`).then((r) => r.json()),
})
```

</details>

<details>
<summary><strong>Scope Node</strong> — groups children under a namespace, optionally has its own <code>queryFn</code></summary>

```ts
{
  queryFn: () => fetch('/api/items/summary').then(r => r.json()),  // optional
  subQueries: {
    active: {
      queryFn: () => fetch('/api/items?status=active').then(r => r.json()),
    },
  },
}
```

</details>

<details>
<summary><strong>Infinite Query Node</strong> — paginated queries with <code>initialPageParam</code> and <code>getNextPageParam</code></summary>

Works on both static and dynamic nodes. Directly compatible with `useInfiniteQuery` / `fetchInfiniteQuery`.

```ts
const pages = createStructuredQuery('pages', {
  // Static infinite query
  list: {
    queryFn: ({ pageParam }) => fetch(`/api/pages?cursor=${pageParam}`).then((r) => r.json()),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  },

  // Dynamic infinite query
  search: (term: string) => ({
    params: [term],
    queryFn: ({ pageParam }) =>
      fetch(`/api/search?q=${term}&cursor=${pageParam}`).then((r) => r.json()),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  }),
})

const { data } = useInfiniteQuery(pages.list)
const { data: searchData } = useInfiniteQuery(pages.search('hello'))
```

`getPreviousPageParam` and `maxPages` are also supported.

</details>

### Deep Nesting

Sub-queries can be nested to arbitrary depth — including parameterised nodes inside other parameterised nodes:

```ts
const org = createStructuredQuery('org', {
  byId: (orgId: string) => ({
    params: [orgId],
    queryFn: () => api.getOrg(orgId),
    subQueries: {
      members: {
        queryFn: () => api.getMembers(orgId),
        subQueries: {
          active: { queryFn: () => api.getActiveMembers(orgId) },
        },
      },
      project: (projectId: number) => ({
        params: [projectId],
        queryFn: () => api.getProject(orgId, projectId),
        subQueries: {
          tasks: { queryFn: () => api.getTasks(orgId, projectId) },
          issue: (issueId: string) => ({
            params: [issueId],
            queryFn: () => api.getIssue(orgId, projectId, issueId),
            subQueries: {
              comments: { queryFn: () => api.getComments(orgId, projectId, issueId) },
            },
          }),
        },
      }),
    },
  }),
})

// Chain through $sub at every level
const data = await queryClient.fetchQuery(
  org.byId('acme').$sub.project(42).$sub.issue('ISS-1').$sub.comments,
)
// queryKey → ["org", "byId", "acme", "project", 42, "issue", "ISS-1", "comments"]

// Invalidate at any level — cascades to all children
queryClient.invalidateQueries({
  queryKey: org.byId('acme').$sub.project(42).queryKey,
})
```

### The `$sub` Namespace

Children of a node are accessible via the `$sub` property. This keeps query options objects clean — when you pass a node to `useQuery` or `fetchQuery`, only standard TanStack Query options are present as top-level properties.

```ts
// ✅ useQuery receives { queryKey, queryFn, staleTime } — no child properties mixed in
useQuery(todos.byId('123'))

// Access children explicitly via $sub
const comments = todos.byId('123').$sub.comments
```

`$sub` is an enumerable property, so children are visible in IDE autocomplete and included in `Object.keys()` and spread operations. Nodes without `subQueries` have no `$sub` property.

### `skipToken` Support

`structured-queries` supports TanStack Query's `skipToken` for conditional queries. When `skipToken` is used as the `queryFn`, the resolved type correctly includes `SkipToken` in the union, preventing accidental calls:

```ts
import { skipToken } from '@tanstack/react-query'
import { createStructuredQuery } from 'structured-queries'

const todos = createStructuredQuery('todos', {
  byId: (id: string | undefined) => ({
    params: [id ?? 'none'] as const,
    queryFn: id ? () => fetch(`/api/todos/${id}`).then((r) => r.json()) : skipToken,
  }),
})

// useQuery handles skipToken natively — the query is disabled when id is undefined
const { data } = useQuery(todos.byId(undefined))
```

> **Note:** Nodes with `skipToken` in their `queryFn` are not compatible with `useSuspenseQuery`, which requires a real `queryFn`. Use the `enabled` option instead if you need suspense support.

### Type-Safe Cache Access

Query keys are branded with `DataTag`, so `getQueryData` returns the correct type without a manual generic:

```ts
await queryClient.fetchQuery(tags.all)

// data is inferred as string[] (from the queryFn return type)
const data = queryClient.getQueryData(tags.all.queryKey)
```

For infinite queries the data type is automatically `InfiniteData<TData, TPageParam>`.

### Query Options Passthrough

All standard TanStack Query options are supported on any node:

```ts
{
  queryFn: () => api.getTags(),
  staleTime: 60_000,
  gcTime: 300_000,
  retry: 3,
  retryDelay: 1000,
  networkMode: 'offlineFirst',
  enabled: true,
  refetchOnWindowFocus: false,
  meta: { source: 'api' },
}
```

## TypeScript

### Exported Types

| Type                     | Description                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| `QueryNodeOptions`       | Query options attachable to any node (everything except `queryKey`) |
| `LeafDefinition`         | Static leaf node definition (requires `queryFn`)                    |
| `InfiniteLeafDefinition` | Infinite query leaf definition (`queryFn` + pagination params)      |
| `ScopeDefinition`        | Scope node definition (has `subQueries`, optional `queryFn`)        |
| `DynamicDefinition`      | Dynamic node definition (function returning a node)                 |
| `NodeDefinition`         | Union of all node definition shapes                                 |
| `DynamicQueryNode`       | Resolved dynamic node in the output tree (callable + `.queryKey`)   |
| `StructuredQuery`        | Root output type of `createStructuredQuery`                         |
| `BuildTree`              | Recursive mapped type that builds the output tree                   |
| `inferQueryKeys`         | Extracts the union of all query key tuples from a tree              |

### Requirements

- TypeScript 5.4+
- `strict: true` recommended

## License

[MIT](LICENSE)
