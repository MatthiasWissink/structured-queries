import { expect } from 'vitest'
import { skipToken } from '@tanstack/query-core'
import { createStructuredQuery } from '../../src/index'

/** Standard "tags" fixture — static `all` + dynamic `byId` with a `moreInfo` sub-query */
export const tags = createStructuredQuery('tags', {
  all: {
    queryFn: () => Promise.resolve(['tag1', 'tag2']),
  },
  byId: (id: string) => ({
    params: [id],
    queryFn: () => Promise.resolve({ id, name: `Tag ${id}` }),
    subQueries: {
      moreInfo: {
        queryFn: () => Promise.resolve({ id, details: 'extra info' }),
      },
    },
  }),
})

/** Items fixture — static `all` + dynamic `byId` with `details` sub-query */
export const items = createStructuredQuery('items', {
  all: {
    queryFn: () => Promise.resolve(['a', 'b', 'c']),
  },
  byId: (id: string) => ({
    params: [id],
    queryFn: () => Promise.resolve({ id, name: `Item ${id}` }),
    subQueries: {
      details: {
        queryFn: () => Promise.resolve({ id, extra: 'info' }),
      },
    },
  }),
})

/** Static infinite query fixture */
export const infinitePages = createStructuredQuery('pages', {
  list: {
    queryFn: ({ pageParam }: { pageParam: number }) =>
      Promise.resolve({ items: [`page-${String(pageParam)}`], nextCursor: pageParam + 1 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: { items: string[]; nextCursor: number }) => lastPage.nextCursor,
  },
})

/** Dynamic infinite query factory */
export function createInfiniteSearch(scope: string) {
  return createStructuredQuery(scope, {
    results: (term: string) => ({
      params: [term],
      queryFn: ({ pageParam }: { pageParam: number }) =>
        Promise.resolve({ results: [term], next: pageParam + 1 }),
      initialPageParam: 0,
      getNextPageParam: (lastPage: { results: string[]; next: number }) => lastPage.next,
    }),
  })
}

/** Deep nesting fixture — org → project → issue → comments */
export const org = createStructuredQuery('org', {
  byId: (orgId: string) => ({
    params: [orgId],
    queryFn: () => Promise.resolve({ orgId }),
    subQueries: {
      members: {
        queryFn: () => Promise.resolve([{ name: 'Alice' }]),
        subQueries: {
          active: {
            queryFn: () => Promise.resolve([{ name: 'Alice', active: true }]),
          },
        },
      },
      project: (projectId: number) => ({
        params: [projectId],
        queryFn: () => Promise.resolve({ orgId, projectId }),
        subQueries: {
          tasks: {
            queryFn: () => Promise.resolve([{ task: 'build' }]),
          },
          issue: (issueId: string) => ({
            params: [issueId],
            queryFn: () => Promise.resolve({ orgId, projectId, issueId }),
            subQueries: {
              comments: {
                queryFn: () => Promise.resolve([{ author: 'Bob', body: 'looks good' }]),
              },
            },
          }),
        },
      }),
    },
  }),
})

/** Conditional skipToken fixture — dynamic node with conditional queryFn */
export function createConditionalQuery(scope: string) {
  return createStructuredQuery(scope, {
    byId: (id: string | undefined) => ({
      params: [id ?? ''],
      queryFn: id ? () => Promise.resolve({ id, name: `Item ${id}` }) : skipToken,
    }),
  })
}

/** Assert that a node has the required properties for useQuery/useSuspenseQuery */
export function expectQueryNode(node: object) {
  expect(node).toHaveProperty('queryKey')
  expect(node).toHaveProperty('queryFn')
  expect(typeof (node as Record<string, unknown>).queryFn).toBe('function')
}

/** Assert that a node has the required properties for useInfiniteQuery/useSuspenseInfiniteQuery */
export function expectInfiniteQueryNode(node: object) {
  expectQueryNode(node)
  expect(node).toHaveProperty('initialPageParam')
  expect(node).toHaveProperty('getNextPageParam')
}
