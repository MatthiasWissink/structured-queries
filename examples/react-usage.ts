/**
 * Real-world usage examples for structured-queries with TanStack Query v5.
 *
 * This file is type-checked but not executed. It demonstrates how structured-queries
 * integrates with QueryClient methods (fetchQuery, prefetchQuery, ensureQueryData,
 * fetchInfiniteQuery, invalidateQueries) and can be used with any framework adapter.
 *
 * Framework hooks (useQuery, useSuspenseQuery, etc.) are shown in comments since
 * this library is framework-agnostic and doesn't depend on any specific adapter.
 */

import { QueryClient } from '@tanstack/query-core'
import { createStructuredQuery } from '../src/index'

// ---------------------------------------------------------------------------
// 1. Define structured query trees for your domains
// ---------------------------------------------------------------------------

interface Todo {
  id: string
  title: string
  completed: boolean
}

interface Comment {
  id: string
  body: string
  author: string
}

const todos = createStructuredQuery('todos', {
  all: {
    queryFn: (): Promise<Todo[]> => fetch('/api/todos').then((r) => r.json() as Promise<Todo[]>),
    staleTime: 30_000,
  },
  byId: (id: string) => ({
    params: [id],
    queryFn: (): Promise<Todo> => fetch(`/api/todos/${id}`).then((r) => r.json() as Promise<Todo>),
    staleTime: 60_000,
    subQueries: {
      comments: {
        queryFn: (): Promise<Comment[]> =>
          fetch(`/api/todos/${id}/comments`).then((r) => r.json() as Promise<Comment[]>),
      },
    },
  }),
})

interface FeedItem {
  id: string
  content: string
}

interface FeedPage {
  items: FeedItem[]
  nextCursor: number | null
}

const feed = createStructuredQuery('feed', {
  timeline: {
    queryFn: ({ pageParam }: { pageParam: number }): Promise<FeedPage> =>
      fetch(`/api/feed?cursor=${String(pageParam)}`).then((r) => r.json() as Promise<FeedPage>),
    initialPageParam: 0,
    getNextPageParam: (lastPage: FeedPage) => lastPage.nextCursor,
    staleTime: 10_000,
  },
})

interface SearchResult {
  id: string
  title: string
  score: number
}

interface SearchPage {
  results: SearchResult[]
  nextPage: number | null
}

const search = createStructuredQuery('search', {
  results: (term: string) => ({
    params: [term],
    queryFn: ({ pageParam }: { pageParam: number }): Promise<SearchPage> =>
      fetch(`/api/search?q=${term}&page=${String(pageParam)}`).then(
        (r) => r.json() as Promise<SearchPage>,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage: SearchPage) => lastPage.nextPage,
  }),
})

// ---------------------------------------------------------------------------
// 2. Combine multiple domains with plain objects (v2 pattern)
// ---------------------------------------------------------------------------

const api = { todos, feed, search }

// Access via namespace: api.todos.all, api.feed.timeline, etc.
void api

// ---------------------------------------------------------------------------
// 3. Framework-agnostic usage with QueryClient
// ---------------------------------------------------------------------------

// With any TanStack Query adapter, pass structured options directly:
//   React:  useQuery(todos.all)
//   Vue:    useQuery(todos.all)
//   Solid:  createQuery(() => todos.all)
//   Angular: injectQuery(() => todos.all)

// ---------------------------------------------------------------------------
// 4. Server-side / loader patterns (prefetchQuery, ensureQueryData)
// ---------------------------------------------------------------------------

async function loader(queryClient: QueryClient) {
  // Prefetch for upcoming navigation — returns void, primes the cache
  await queryClient.prefetchQuery(todos.all)

  // Ensure data exists — returns the data (fetches if not cached)
  const todo = await queryClient.ensureQueryData(todos.byId('456'))

  // Prefetch nested sub-query
  await queryClient.prefetchQuery(todos.byId('456').$sub.comments)

  return { todo }
}

// ---------------------------------------------------------------------------
// 5. Infinite query integration
// ---------------------------------------------------------------------------

async function infiniteExamples(queryClient: QueryClient) {
  // Static infinite query
  const feedData = await queryClient.fetchInfiniteQuery(feed.timeline)

  // Dynamic (parameterised) infinite query
  const searchData = await queryClient.fetchInfiniteQuery(search.results('hello'))

  return { feedData, searchData }
}

// ---------------------------------------------------------------------------
// 6. Cache management — invalidation by scope
// ---------------------------------------------------------------------------

async function invalidationExamples(queryClient: QueryClient) {
  // Invalidate ALL todo queries (all, byId('x'), byId('x').$sub.comments, etc.)
  await queryClient.invalidateQueries({ queryKey: todos.queryKey })

  // Invalidate all byId queries (any parameter)
  await queryClient.invalidateQueries({ queryKey: todos.byId.queryKey })

  // Invalidate a specific todo and its sub-queries
  await queryClient.invalidateQueries({ queryKey: todos.byId('123').queryKey })

  // Remove a specific query from the cache entirely
  queryClient.removeQueries({ queryKey: todos.byId('123').queryKey })

  // Get cached data with type-safe queryKey
  const cached = queryClient.getQueryData(todos.byId('123').queryKey)
  void cached
}

// Suppress unused variable warnings — this file is for type-checking only
void loader
void infiniteExamples
void invalidationExamples
