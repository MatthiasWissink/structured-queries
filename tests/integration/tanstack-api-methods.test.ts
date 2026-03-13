import { describe, it, expect, vi } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { createStructuredQuery } from '../../src/index'
import { items } from './fixtures'

describe('TanStack Query API methods integration', () => {
  describe('prefetchQuery', () => {
    it('static node primes the cache', async () => {
      const queryClient = new QueryClient()
      await queryClient.prefetchQuery(items.all)
      expect(queryClient.getQueryData(items.all.queryKey)).toEqual(['a', 'b', 'c'])
    })

    it('parameterised node primes the cache', async () => {
      const queryClient = new QueryClient()
      await queryClient.prefetchQuery(items.byId('abc'))
      expect(queryClient.getQueryData(items.byId('abc').queryKey)).toEqual({
        id: 'abc',
        name: 'Item abc',
      })
    })

    it('nested sub-query primes the cache', async () => {
      const queryClient = new QueryClient()
      await queryClient.prefetchQuery(items.byId('def').$sub.details)
      expect(queryClient.getQueryData(items.byId('def').$sub.details.queryKey)).toEqual({
        id: 'def',
        extra: 'info',
      })
    })
  })

  describe('ensureQueryData', () => {
    it('fetches when cache is empty', async () => {
      const queryClient = new QueryClient()
      const data = await queryClient.ensureQueryData(items.all)
      expect(data).toEqual(['a', 'b', 'c'])
    })

    it('returns cached data without refetching', async () => {
      const queryClient = new QueryClient()
      const queryFn = vi.fn(() => Promise.resolve({ id: '1', name: 'Item 1' }))
      const opts = { ...items.byId('1'), queryFn }

      await queryClient.fetchQuery(opts)
      expect(queryFn).toHaveBeenCalledTimes(1)

      const cached = await queryClient.ensureQueryData(opts)
      expect(cached).toEqual({ id: '1', name: 'Item 1' })
      expect(queryFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('setQueryDefaults', () => {
    it('applies defaults via structured queryKey', () => {
      const queryClient = new QueryClient()
      const defaultItems = createStructuredQuery('defaultItems', {
        all: {
          queryFn: () => Promise.resolve(['default']),
        },
      })

      queryClient.setQueryDefaults(defaultItems.queryKey, { staleTime: 99_999 })

      const defaults = queryClient.getQueryDefaults(defaultItems.all.queryKey)
      expect(defaults.staleTime).toBe(99_999)
    })
  })

  describe('real-world scenario: project management workflow', () => {
    const projects = createStructuredQuery('projects', {
      all: {
        queryFn: () =>
          Promise.resolve([
            { id: 'p1', name: 'Alpha' },
            { id: 'p2', name: 'Beta' },
          ]),
        staleTime: 30_000,
      },
      byId: (id: string) => ({
        params: [id],
        queryFn: () => Promise.resolve({ id, name: `Project ${id}`, memberCount: 5 }),
        staleTime: 60_000,
        subQueries: {
          tasks: {
            queryFn: () =>
              Promise.resolve([
                { id: 't1', title: 'Setup CI', done: false },
                { id: 't2', title: 'Write tests', done: true },
              ]),
          },
          members: {
            queryFn: () => Promise.resolve([{ userId: 'u1', role: 'admin' }]),
            subQueries: {
              active: {
                queryFn: () => Promise.resolve([{ userId: 'u1', role: 'admin', online: true }]),
              },
            },
          },
        },
      }),
    })

    it('prefetch → fetch → cache hit workflow', async () => {
      const queryClient = new QueryClient()

      await queryClient.prefetchQuery(projects.all)

      const data = await queryClient.fetchQuery(projects.all)
      expect(data).toEqual([
        { id: 'p1', name: 'Alpha' },
        { id: 'p2', name: 'Beta' },
      ])

      const ensured = await queryClient.ensureQueryData(projects.all)
      expect(ensured).toEqual(data)
    })

    it('prefetch nested sub-queries for a detail page', async () => {
      const queryClient = new QueryClient()

      await Promise.all([
        queryClient.prefetchQuery(projects.byId('p1')),
        queryClient.prefetchQuery(projects.byId('p1').$sub.tasks),
        queryClient.prefetchQuery(projects.byId('p1').$sub.members),
        queryClient.prefetchQuery(projects.byId('p1').$sub.members.$sub.active),
      ])

      expect(queryClient.getQueryData(projects.byId('p1').queryKey)).toEqual({
        id: 'p1',
        name: 'Project p1',
        memberCount: 5,
      })
      expect(queryClient.getQueryData(projects.byId('p1').$sub.tasks.queryKey)).toEqual([
        { id: 't1', title: 'Setup CI', done: false },
        { id: 't2', title: 'Write tests', done: true },
      ])
      expect(queryClient.getQueryData(projects.byId('p1').$sub.members.queryKey)).toEqual([
        { userId: 'u1', role: 'admin' },
      ])
      expect(
        queryClient.getQueryData(projects.byId('p1').$sub.members.$sub.active.queryKey),
      ).toEqual([{ userId: 'u1', role: 'admin', online: true }])
    })

    it('invalidate project scope → refetch shows updated data', async () => {
      let callCount = 0
      const dynamicProjects = createStructuredQuery('dynProjects', {
        byId: (id: string) => ({
          params: [id],
          queryFn: () => {
            callCount++
            return Promise.resolve({ id, version: callCount })
          },
          subQueries: {
            tasks: {
              queryFn: () => {
                callCount++
                return Promise.resolve([{ task: 'v' + String(callCount) }])
              },
            },
          },
        }),
      })

      const queryClient = new QueryClient()

      const v1 = await queryClient.fetchQuery(dynamicProjects.byId('p1'))
      await queryClient.fetchQuery(dynamicProjects.byId('p1').$sub.tasks)
      expect(v1.version).toBe(1)

      await queryClient.invalidateQueries({ queryKey: dynamicProjects.byId('p1').queryKey })

      expect(queryClient.getQueryState(dynamicProjects.byId('p1').queryKey)?.isInvalidated).toBe(
        true,
      )
      expect(
        queryClient.getQueryState(dynamicProjects.byId('p1').$sub.tasks.queryKey)?.isInvalidated,
      ).toBe(true)

      const v2 = await queryClient.fetchQuery(dynamicProjects.byId('p1'))
      expect(v2.version).toBeGreaterThan(v1.version)
    })

    it('staleTime and other options are preserved through the tree', () => {
      expect(projects.all.staleTime).toBe(30_000)
      expect(projects.byId('p1').staleTime).toBe(60_000)
    })

    it('prefetchInfiniteQuery works with structured options', async () => {
      const feed = createStructuredQuery('wfFeed', {
        timeline: {
          queryFn: ({ pageParam }: { pageParam: number }) =>
            Promise.resolve({ items: [`item-${String(pageParam)}`], next: pageParam + 1 }),
          initialPageParam: 0,
          getNextPageParam: (lastPage: { items: string[]; next: number }) => lastPage.next,
        },
      })

      const queryClient = new QueryClient()
      await queryClient.prefetchInfiniteQuery(feed.timeline)

      const cached = queryClient.getQueryData(feed.timeline.queryKey)
      expect(cached).toBeDefined()
    })
  })
})
