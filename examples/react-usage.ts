/**
 * Real-world usage examples for structured-queries with React and TanStack Query v5.
 *
 * This file is type-checked but not executed. It demonstrates how structured-queries
 * integrates with useQuery, useSuspenseQuery, useInfiniteQuery, useSuspenseInfiniteQuery,
 * prefetchQuery, ensureQueryData, and mergeQueryOptions.
 */

import {
  QueryClient,
  useQuery,
  useSuspenseQuery,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'
import { createQueryOptions, mergeQueryOptions } from '../src/index'

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

const todos = createQueryOptions('todos', {
  all: {
    queryFn: (): Promise<Todo[]> => fetch('/api/todos').then((r) => r.json() as Promise<Todo[]>),
    staleTime: 30_000,
  },
  byId: (id: string) => ({
    queryKey: [id] as const,
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

const feed = createQueryOptions('feed', {
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

const search = createQueryOptions('search', {
  results: (term: string) => ({
    queryKey: [term] as const,
    queryFn: ({ pageParam }: { pageParam: number }): Promise<SearchPage> =>
      fetch(`/api/search?q=${term}&page=${String(pageParam)}`).then(
        (r) => r.json() as Promise<SearchPage>,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage: SearchPage) => lastPage.nextPage,
  }),
})

// ---------------------------------------------------------------------------
// 2. Merge multiple domains into a single namespace
// ---------------------------------------------------------------------------

const api = mergeQueryOptions(todos, feed, search)

// Access via namespace: api.todos.all, api.feed.timeline, etc.
void api

// ---------------------------------------------------------------------------
// 3. useQuery — basic queries
// ---------------------------------------------------------------------------

function TodoList() {
  // Static query — spread the options object directly
  const { data: allTodos } = useQuery(todos.all)

  // Parameterised query
  const { data: todo } = useQuery(todos.byId('123'))

  // Nested sub-query
  const { data: comments } = useQuery(todos.byId('123').$sub.comments)

  return { allTodos, todo, comments }
}

// ---------------------------------------------------------------------------
// 4. useSuspenseQuery — guaranteed data in Suspense boundaries
// ---------------------------------------------------------------------------

function TodoDetail({ id }: { id: string }) {
  // useSuspenseQuery guarantees `data` is defined (no loading state)
  const { data: todo } = useSuspenseQuery(todos.byId(id))

  const { data: comments } = useSuspenseQuery(todos.byId(id).$sub.comments)

  return { todo, comments }
}

// ---------------------------------------------------------------------------
// 5. useInfiniteQuery — paginated / cursor-based queries
// ---------------------------------------------------------------------------

function FeedTimeline() {
  // Static infinite query
  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery(feed.timeline)

  return { data, fetchNextPage, hasNextPage }
}

function SearchResults({ term }: { term: string }) {
  // Dynamic (parameterised) infinite query
  const { data, fetchNextPage } = useInfiniteQuery(search.results(term))

  return { data, fetchNextPage }
}

// ---------------------------------------------------------------------------
// 6. useSuspenseInfiniteQuery — suspense + infinite
// ---------------------------------------------------------------------------

function SuspenseFeed() {
  const { data } = useSuspenseInfiniteQuery(feed.timeline)

  return { data }
}

// ---------------------------------------------------------------------------
// 7. Server-side / loader patterns (prefetchQuery, ensureQueryData)
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
// 8. Cache management — invalidation by scope
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
void TodoList
void TodoDetail
void FeedTimeline
void SearchResults
void SuspenseFeed
void loader
void invalidationExamples
