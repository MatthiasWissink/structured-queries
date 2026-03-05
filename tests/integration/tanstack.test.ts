import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { queryOptions } from '@tanstack/react-query'
import { createQueryOptions } from '../../src/index'

describe('TanStack Query integration', () => {
  const queryClient = new QueryClient()

  const tags = createQueryOptions('tags', {
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

  it('static node works with fetchQuery', async () => {
    const data = await queryClient.fetchQuery(tags.all)
    expect(data).toEqual(['tag1', 'tag2'])
  })

  it('parameterised node works with fetchQuery', async () => {
    const data = await queryClient.fetchQuery(tags.byId('123'))
    expect(data).toEqual({ id: '123', name: 'Tag 123' })
  })

  it('nested child node works with fetchQuery', async () => {
    const data = await queryClient.fetchQuery(tags.byId('456').$sub.moreInfo)
    expect(data).toEqual({ id: '456', details: 'extra info' })
  })

  it('getQueryData retrieves cached data by queryKey', async () => {
    await queryClient.fetchQuery(tags.all)
    const cached = queryClient.getQueryData(tags.all.queryKey)
    expect(cached).toEqual(['tag1', 'tag2'])
  })

  it('invalidateQueries works with scope queryKey', async () => {
    await queryClient.fetchQuery(tags.all)
    await queryClient.invalidateQueries({ queryKey: tags.queryKey })
    const state = queryClient.getQueryState(tags.all.queryKey)
    expect(state?.isInvalidated).toBe(true)
  })

  it('multi-segment dynamic node works with fetchQuery', async () => {
    const repos = createQueryOptions('repos', {
      byOwnerAndName: (p: { owner: string; name: string }) => ({
        queryKey: [p.owner, p.name],
        queryFn: () => Promise.resolve({ owner: p.owner, name: p.name }),
      }),
    })

    const data = await queryClient.fetchQuery(repos.byOwnerAndName({ owner: 'acme', name: 'lib' }))
    expect(data).toEqual({ owner: 'acme', name: 'lib' })
  })

  describe('parameterised node queryKey precision', () => {
    it('precise tuple at runtime', async () => {
      const data = await queryClient.fetchQuery(tags.byId('widthTest'))
      expect(data).toEqual({ id: 'widthTest', name: 'Tag widthTest' })
      expect(tags.byId('widthTest').queryKey).toEqual(['tags', 'byId', 'widthTest'])
    })

    it('cache lookup with precise queryKey', async () => {
      await queryClient.fetchQuery(tags.byId('cached'))
      const cached = queryClient.getQueryData(tags.byId('cached').queryKey)
      expect(cached).toEqual({ id: 'cached', name: 'Tag cached' })
    })

    it('invalidation with partial key', async () => {
      await queryClient.fetchQuery(tags.byId('inv1'))
      await queryClient.fetchQuery(tags.byId('inv2'))

      await queryClient.invalidateQueries({ queryKey: tags.byId.queryKey })

      const state1 = queryClient.getQueryState(tags.byId('inv1').queryKey)
      const state2 = queryClient.getQueryState(tags.byId('inv2').queryKey)
      expect(state1?.isInvalidated).toBe(true)
      expect(state2?.isInvalidated).toBe(true)
    })

    it('nested child queryKey is a precise tuple', async () => {
      const data = await queryClient.fetchQuery(tags.byId('nested').$sub.moreInfo)
      expect(data).toEqual({ id: 'nested', details: 'extra info' })
      expect(tags.byId('nested').$sub.moreInfo.queryKey).toEqual([
        'tags',
        'byId',
        'nested',
        'moreInfo',
      ])
    })
  })

  describe('infinite query integration', () => {
    const pages = createQueryOptions('pages', {
      list: {
        queryFn: ({ pageParam }: { pageParam: number }) =>
          Promise.resolve({ items: [`page-${String(pageParam)}`], nextCursor: pageParam + 1 }),
        initialPageParam: 0,
        getNextPageParam: (lastPage: { items: string[]; nextCursor: number }) =>
          lastPage.nextCursor,
      },
    })

    it('static infinite node works with fetchInfiniteQuery', async () => {
      const data = await queryClient.fetchInfiniteQuery(pages.list)
      expect(data.pages).toEqual([{ items: ['page-0'], nextCursor: 1 }])
      expect(data.pageParams).toEqual([0])
    })

    it('dynamic infinite node works with fetchInfiniteQuery', async () => {
      const search = createQueryOptions('search', {
        results: (term: string) => ({
          queryKey: [term],
          queryFn: ({ pageParam }: { pageParam: number }) =>
            Promise.resolve({ results: [term], next: pageParam + 1 }),
          initialPageParam: 0,
          getNextPageParam: (lastPage: { results: string[]; next: number }) => lastPage.next,
        }),
      })

      const data = await queryClient.fetchInfiniteQuery(search.results('hello'))
      expect(data.pages).toEqual([{ results: ['hello'], next: 1 }])
      expect(data.pageParams).toEqual([0])
    })
  })

  describe('deep nesting edge cases', () => {
    const org = createQueryOptions('org', {
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
                queryFn: () =>
                  Promise.resolve({ orgId, projectId, issueId }),
                subQueries: {
                  comments: {
                    queryFn: () =>
                      Promise.resolve([
                        { author: 'Bob', body: 'looks good' },
                      ]),
                  },
                },
              }),
            },
          }),
        },
      }),
    })

    it('double-nested parameterised nodes produce correct queryKey', () => {
      expect(org.byId('acme').$sub.project(42).queryKey).toEqual([
        'org',
        'byId',
        'acme',
        'project',
        42,
      ])
    })

    it('triple-nested param → param → param queryKey', () => {
      expect(
        org.byId('acme').$sub.project(42).$sub.issue('ISS-1').queryKey,
      ).toEqual(['org', 'byId', 'acme', 'project', 42, 'issue', 'ISS-1'])
    })

    it('deeply nested static child after params', () => {
      expect(
        org.byId('acme').$sub.project(42).$sub.issue('ISS-1').$sub.comments
          .queryKey,
      ).toEqual([
        'org',
        'byId',
        'acme',
        'project',
        42,
        'issue',
        'ISS-1',
        'comments',
      ])
    })

    it('double-nested parameterised fetchQuery works', async () => {
      const data = await queryClient.fetchQuery(
        org.byId('acme').$sub.project(42),
      )
      expect(data).toEqual({ orgId: 'acme', projectId: 42 })
    })

    it('triple-nested parameterised fetchQuery works', async () => {
      const data = await queryClient.fetchQuery(
        org.byId('acme').$sub.project(42).$sub.issue('ISS-1'),
      )
      expect(data).toEqual({
        orgId: 'acme',
        projectId: 42,
        issueId: 'ISS-1',
      })
    })

    it('deepest static leaf fetchQuery works', async () => {
      const data = await queryClient.fetchQuery(
        org.byId('acme').$sub.project(42).$sub.issue('ISS-1').$sub.comments,
      )
      expect(data).toEqual([{ author: 'Bob', body: 'looks good' }])
    })

    it('static sub-query under parameterised node fetchQuery', async () => {
      const data = await queryClient.fetchQuery(
        org.byId('acme').$sub.project(42).$sub.tasks,
      )
      expect(data).toEqual([{ task: 'build' }])
    })

    it('static sub-query nested under param → static', async () => {
      const data = await queryClient.fetchQuery(
        org.byId('acme').$sub.members.$sub.active,
      )
      expect(data).toEqual([{ name: 'Alice', active: true }])
    })

    it('cache isolation between different param values at same depth', async () => {
      await queryClient.fetchQuery(org.byId('acme').$sub.project(1))
      await queryClient.fetchQuery(org.byId('acme').$sub.project(2))

      const data1 = queryClient.getQueryData(
        org.byId('acme').$sub.project(1).queryKey,
      )
      const data2 = queryClient.getQueryData(
        org.byId('acme').$sub.project(2).queryKey,
      )
      expect(data1).toEqual({ orgId: 'acme', projectId: 1 })
      expect(data2).toEqual({ orgId: 'acme', projectId: 2 })
    })

    it('invalidation at mid-level cascades to deeper queries', async () => {
      await queryClient.fetchQuery(
        org.byId('corp').$sub.project(10).$sub.issue('A').$sub.comments,
      )
      await queryClient.fetchQuery(
        org.byId('corp').$sub.project(10).$sub.tasks,
      )

      // Invalidate at the project level — should cascade to children
      await queryClient.invalidateQueries({
        queryKey: org.byId('corp').$sub.project(10).queryKey,
      })

      const commentsState = queryClient.getQueryState(
        org.byId('corp').$sub.project(10).$sub.issue('A').$sub.comments
          .queryKey,
      )
      const tasksState = queryClient.getQueryState(
        org.byId('corp').$sub.project(10).$sub.tasks.queryKey,
      )
      expect(commentsState?.isInvalidated).toBe(true)
      expect(tasksState?.isInvalidated).toBe(true)
    })

    it('invalidation at root scope cascades through all nesting', async () => {
      await queryClient.fetchQuery(org.byId('root-test').$sub.members)

      await queryClient.invalidateQueries({ queryKey: org.queryKey })

      const state = queryClient.getQueryState(
        org.byId('root-test').$sub.members.queryKey,
      )
      expect(state?.isInvalidated).toBe(true)
    })

    it('different orgs produce independent caches at every depth', async () => {
      await queryClient.fetchQuery(
        org.byId('alpha').$sub.project(1).$sub.issue('X'),
      )
      await queryClient.fetchQuery(
        org.byId('beta').$sub.project(1).$sub.issue('X'),
      )

      const alphaData = queryClient.getQueryData(
        org.byId('alpha').$sub.project(1).$sub.issue('X').queryKey,
      )
      const betaData = queryClient.getQueryData(
        org.byId('beta').$sub.project(1).$sub.issue('X').queryKey,
      )
      expect(alphaData).toEqual({
        orgId: 'alpha',
        projectId: 1,
        issueId: 'X',
      })
      expect(betaData).toEqual({
        orgId: 'beta',
        projectId: 1,
        issueId: 'X',
      })
    })
  })

  describe('structural equivalence with queryOptions()', () => {
    const allQueryFn = () => Promise.resolve(['tag1', 'tag2'])
    const byIdQueryFn = (id: string) => () => Promise.resolve({ id, name: `Tag ${id}` })
    const moreInfoQueryFn = (id: string) => () => Promise.resolve({ id, details: 'extra info' })

    const tagsForEquiv = createQueryOptions('tags', {
      all: {
        queryFn: allQueryFn,
      },
      byId: (id: string) => ({
        queryKey: [id],
        queryFn: byIdQueryFn(id),
        subQueries: {
          moreInfo: {
            queryFn: moreInfoQueryFn(id),
          },
        },
      }),
    })

    function expectStructuralMatch(
      structured: object & { queryKey: unknown },
      direct: object & { queryKey: unknown },
    ) {
      for (const key of Object.keys(direct)) {
        expect(structured).toHaveProperty(key)
      }
      expect(structured.queryKey).toEqual(direct.queryKey)
    }

    it('static node matches queryOptions() shape', () => {
      const direct = queryOptions({ queryKey: ['tags', 'all'] as const, queryFn: allQueryFn })
      expectStructuralMatch(tagsForEquiv.all, direct)
      expect(tagsForEquiv.all.queryFn).toBe(direct.queryFn)
    })

    it('parameterised node matches queryOptions() shape', () => {
      const direct = queryOptions({
        queryKey: ['tags', 'byId', '123'] as const,
        queryFn: byIdQueryFn('123'),
      })
      expectStructuralMatch(tagsForEquiv.byId('123'), direct)
    })

    it('nested sub-query matches queryOptions() shape', () => {
      const direct = queryOptions({
        queryKey: ['tags', 'byId', '456', 'moreInfo'] as const,
        queryFn: moreInfoQueryFn('456'),
      })
      expectStructuralMatch(tagsForEquiv.byId('456').$sub.moreInfo, direct)
    })

    it('static node passes through extra options', () => {
      const withExtras = createQueryOptions('extras', {
        item: {
          queryFn: () => Promise.resolve('data'),
          staleTime: 5000,
          gcTime: 30000,
          retry: 3,
          enabled: false,
        },
      })

      const direct = queryOptions({
        queryKey: ['extras', 'item'] as const,
        queryFn: () => Promise.resolve('data'),
        staleTime: 5000,
        gcTime: 30000,
        retry: 3,
        enabled: false,
      })

      expectStructuralMatch(withExtras.item, direct)
      expect(withExtras.item.staleTime).toBe(direct.staleTime)
      expect(withExtras.item.gcTime).toBe(direct.gcTime)
      expect(withExtras.item.retry).toBe(direct.retry)
      expect(withExtras.item.enabled).toBe(direct.enabled)
    })

    it('parameterised node passes through extra options', () => {
      const withExtras = createQueryOptions('extras', {
        byId: (id: string) => ({
          queryKey: [id],
          queryFn: () => Promise.resolve({ id }),
          staleTime: 10000,
          retry: false as const,
        }),
      })

      const direct = queryOptions({
        queryKey: ['extras', 'byId', 'abc'] as const,
        queryFn: () => Promise.resolve({ id: 'abc' }),
        staleTime: 10000,
        retry: false,
      })

      expectStructuralMatch(withExtras.byId('abc'), direct)
      expect(withExtras.byId('abc').staleTime).toBe(direct.staleTime)
      expect(withExtras.byId('abc').retry).toBe(direct.retry)
    })
  })
})
