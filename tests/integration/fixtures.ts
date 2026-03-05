import { expect } from 'vitest'
import { createQueryOptions } from '../../src/index'

/** Standard "tags" fixture — static `all` + dynamic `byId` with a `moreInfo` sub-query */
export const tags = createQueryOptions('tags', {
  all: {
    queryFn: () => Promise.resolve(['tag1', 'tag2']),
  },
  byId: (id: string) => ({
    queryKey: [id],
    queryFn: () => Promise.resolve({ id, name: `Tag ${id}` }),
    subQueries: {
      moreInfo: {
        queryFn: () => Promise.resolve({ id, details: 'extra info' }),
      },
    },
  }),
})

/** Items fixture — static `all` + dynamic `byId` with `details` sub-query */
export const items = createQueryOptions('items', {
  all: {
    queryFn: () => Promise.resolve(['a', 'b', 'c']),
  },
  byId: (id: string) => ({
    queryKey: [id],
    queryFn: () => Promise.resolve({ id, name: `Item ${id}` }),
    subQueries: {
      details: {
        queryFn: () => Promise.resolve({ id, extra: 'info' }),
      },
    },
  }),
})

/** Static infinite query fixture */
export const infinitePages = createQueryOptions('pages', {
  list: {
    queryFn: ({ pageParam }: { pageParam: number }) =>
      Promise.resolve({ items: [`page-${String(pageParam)}`], nextCursor: pageParam + 1 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: { items: string[]; nextCursor: number }) => lastPage.nextCursor,
  },
})

/** Dynamic infinite query factory */
export function createInfiniteSearch(scope: string) {
  return createQueryOptions(scope, {
    results: (term: string) => ({
      queryKey: [term],
      queryFn: ({ pageParam }: { pageParam: number }) =>
        Promise.resolve({ results: [term], next: pageParam + 1 }),
      initialPageParam: 0,
      getNextPageParam: (lastPage: { results: string[]; next: number }) => lastPage.next,
    }),
  })
}

/** Deep nesting fixture — org → project → issue → comments */
export const org = createQueryOptions('org', {
  byId: (orgId: string) => ({
    queryKey: [orgId],
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
        queryKey: [projectId],
        queryFn: () => Promise.resolve({ orgId, projectId }),
        subQueries: {
          tasks: {
            queryFn: () => Promise.resolve([{ task: 'build' }]),
          },
          issue: (issueId: string) => ({
            queryKey: [issueId],
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
