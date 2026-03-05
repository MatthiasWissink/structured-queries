# structured-queries

Type-safe, hierarchical query options factories for [TanStack Query](https://tanstack.com/query) — define and organise your queries as a structured, composable tree.

Inspired by [query-key-factory](https://github.com/lukemorales/query-key-factory) by Luke Morales. `structured-queries` takes the idea further with hierarchical sub-queries, parameterised nodes, and a single tree that is directly compatible with `useQuery`, `fetchQuery`, and friends — no wrappers needed.

## Features

- Hierarchical query keys built automatically from the tree structure
- Parameterised (dynamic) nodes with closure-based `queryFn`
- Sub-queries via `$sub` namespace for deep nesting
- Partial keys on uncalled dynamic nodes for easy invalidation
- `mergeQueryOptions` to combine multiple domain trees into one namespace
- `inferQueryKeys` type helper to extract the union of all possible key tuples
- Full `QueryOptions` passthrough (`staleTime`, `gcTime`, `retry`, etc.)
- Zero runtime dependencies — only `@tanstack/query-core >=5` as a peer dep
- ESM + CJS dual output

## Install

```sh
npm install structured-queries @tanstack/react-query
```

> `@tanstack/query-core >=5.0.0` is a peer dependency, satisfied by any TanStack Query v5 package (`@tanstack/react-query`, `@tanstack/vue-query`, etc.).

## Quick Start

### Define a query tree

```ts
import { createQueryOptions } from 'structured-queries'

const todos = createQueryOptions('todos', {
  all: {
    queryFn: () => fetch('/api/todos').then((r) => r.json()),
  },
  byId: (id: string) => ({
    queryKey: [id],
    queryFn: () => fetch(`/api/todos/${id}`).then((r) => r.json()),
  }),
})
```

### Use with TanStack Query

```tsx
import { useQuery } from '@tanstack/react-query'

// Fetch all todos
const { data } = useQuery(todos.all)

// Fetch a single todo
const { data } = useQuery(todos.byId('abc'))

// Invalidate everything under "todos"
queryClient.invalidateQueries({ queryKey: todos.queryKey })
// → matches ["todos", "all"], ["todos", "byId", "abc"], etc.

// Invalidate all "byId" queries regardless of param
queryClient.invalidateQueries({ queryKey: todos.byId.queryKey })
// → matches ["todos", "byId", *]
```

## API

### `createQueryOptions(scope, definition)`

Creates a structured query tree for a single domain scope.

```ts
const tags = createQueryOptions('tags', {
  // Static leaf — queryFn required
  all: {
    queryFn: () => api.getTags(),
    staleTime: 60_000,
  },

  // Dynamic (parameterised) node — function returning queryKey + queryFn
  byId: (id: string) => ({
    queryKey: [id],
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

The returned object exposes:

| Access                      | `queryKey`                                     |
| --------------------------- | ---------------------------------------------- |
| `tags`                      | `["tags"]`                                     |
| `tags.all`                  | `["tags", "all"]`                              |
| `tags.byId`                 | `["tags", "byId"]` (partial, for invalidation) |
| `tags.byId("1")`            | `["tags", "byId", "1"]`                        |
| `tags.byId("1").$sub.posts` | `["tags", "byId", "1", "posts"]`               |
| `tags.filters`              | `["tags", "filters"]`                          |
| `tags.filters.$sub.active`  | `["tags", "filters", "active"]`                |

Every node with a `queryFn` is directly spreadable into `useQuery`, `fetchQuery`, etc.

### `mergeQueryOptions(...queries)`

Merges multiple query trees into a single namespace object. Duplicate scope names produce a compile-time error.

```ts
import { createQueryOptions, mergeQueryOptions } from 'structured-queries'

const tags = createQueryOptions('tags', {
  /* ... */
})
const news = createQueryOptions('news', {
  /* ... */
})
const users = createQueryOptions('users', {
  /* ... */
})

const queries = mergeQueryOptions(tags, news, users)

queries.tags.all // { queryKey: ["tags", "all"], queryFn: ... }
queries.news.latest // { queryKey: ["news", "latest"], queryFn: ... }
queries.users.me // { queryKey: ["users", "me"], queryFn: ... }
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

## Node Types

### Static Leaf

A node with a `queryFn` and no children.

```ts
{
  queryFn: () => fetch('/api/items').then(r => r.json()),
  staleTime: 30_000,
  gcTime: 300_000,
}
```

### Dynamic (Parameterised) Node

A function that receives a parameter and returns a node definition with a `queryKey` segment.

```ts
;(id: string) => ({
  queryKey: [id],
  queryFn: () => fetch(`/api/items/${id}`).then((r) => r.json()),
})
```

Multi-segment keys are supported:

```ts
;(p: { owner: string; name: string }) => ({
  queryKey: [p.owner, p.name],
  queryFn: () => fetch(`/api/repos/${p.owner}/${p.name}`).then((r) => r.json()),
})
```

### Scope Node

Groups children under a namespace. Optionally has its own `queryFn`.

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

## Query Options Passthrough

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

## License

MIT
