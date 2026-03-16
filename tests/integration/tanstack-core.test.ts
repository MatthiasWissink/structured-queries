import { describe, it, expect } from 'vitest'
import { QueryClient, skipToken } from '@tanstack/query-core'
import { createStructuredQuery } from '../../src/index'
import { tags, org, infinitePages, createInfiniteSearch, createConditionalQuery } from './fixtures'

describe('TanStack Query core integration', () => {
  it('static node works with fetchQuery', async () => {
    const queryClient = new QueryClient()
    const data = await queryClient.fetchQuery(tags.all)
    expect(data).toEqual(['tag1', 'tag2'])
  })

  it('parameterised node works with fetchQuery', async () => {
    const queryClient = new QueryClient()
    const data = await queryClient.fetchQuery(tags.byId('123'))
    expect(data).toEqual({ id: '123', name: 'Tag 123' })
  })

  it('nested child node works with fetchQuery', async () => {
    const queryClient = new QueryClient()
    const data = await queryClient.fetchQuery(tags.byId('456').$sub.moreInfo)
    expect(data).toEqual({ id: '456', details: 'extra info' })
  })

  it('getQueryData retrieves cached data by queryKey', async () => {
    const queryClient = new QueryClient()
    await queryClient.fetchQuery(tags.all)
    const cached = queryClient.getQueryData(tags.all.queryKey)
    expect(cached).toEqual(['tag1', 'tag2'])
  })

  it('invalidateQueries works with scope queryKey', async () => {
    const queryClient = new QueryClient()
    await queryClient.fetchQuery(tags.all)
    await queryClient.invalidateQueries({ queryKey: tags.queryKey })
    const state = queryClient.getQueryState(tags.all.queryKey)
    expect(state?.isInvalidated).toBe(true)
  })

  it('multi-segment dynamic node works with fetchQuery', async () => {
    const queryClient = new QueryClient()
    const repos = createStructuredQuery('repos', {
      byOwnerAndName: (p: { owner: string; name: string }) => ({
        params: [p.owner, p.name],
        queryFn: () => Promise.resolve({ owner: p.owner, name: p.name }),
      }),
    })

    const data = await queryClient.fetchQuery(repos.byOwnerAndName({ owner: 'acme', name: 'lib' }))
    expect(data).toEqual({ owner: 'acme', name: 'lib' })
  })

  describe('parameterised node queryKey precision', () => {
    it('precise tuple at runtime', async () => {
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery(tags.byId('widthTest'))
      expect(data).toEqual({ id: 'widthTest', name: 'Tag widthTest' })
      expect(tags.byId('widthTest').queryKey).toEqual(['tags', 'byId', 'widthTest'])
    })

    it('cache lookup with precise queryKey', async () => {
      const queryClient = new QueryClient()
      await queryClient.fetchQuery(tags.byId('cached'))
      const cached = queryClient.getQueryData(tags.byId('cached').queryKey)
      expect(cached).toEqual({ id: 'cached', name: 'Tag cached' })
    })

    it('invalidation with partial key', async () => {
      const queryClient = new QueryClient()
      await queryClient.fetchQuery(tags.byId('inv1'))
      await queryClient.fetchQuery(tags.byId('inv2'))

      await queryClient.invalidateQueries({ queryKey: tags.byId.queryKey })

      const state1 = queryClient.getQueryState(tags.byId('inv1').queryKey)
      const state2 = queryClient.getQueryState(tags.byId('inv2').queryKey)
      expect(state1?.isInvalidated).toBe(true)
      expect(state2?.isInvalidated).toBe(true)
    })

    it('nested child queryKey is a precise tuple', async () => {
      const queryClient = new QueryClient()
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
    it('static infinite node works with fetchInfiniteQuery', async () => {
      const queryClient = new QueryClient()
      const data = await queryClient.fetchInfiniteQuery(infinitePages.list)
      expect(data.pages).toEqual([{ items: ['page-0'], nextCursor: 1 }])
      expect(data.pageParams).toEqual([0])
    })

    it('dynamic infinite node works with fetchInfiniteQuery', async () => {
      const queryClient = new QueryClient()
      const search = createInfiniteSearch('search')
      const data = await queryClient.fetchInfiniteQuery(search.results('hello'))
      expect(data.pages).toEqual([{ results: ['hello'], next: 1 }])
      expect(data.pageParams).toEqual([0])
    })
  })

  describe('deep nesting edge cases', () => {
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
      expect(org.byId('acme').$sub.project(42).$sub.issue('ISS-1').queryKey).toEqual([
        'org',
        'byId',
        'acme',
        'project',
        42,
        'issue',
        'ISS-1',
      ])
    })

    it('deeply nested static child after params', () => {
      expect(org.byId('acme').$sub.project(42).$sub.issue('ISS-1').$sub.comments.queryKey).toEqual([
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
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery(org.byId('acme').$sub.project(42))
      expect(data).toEqual({ orgId: 'acme', projectId: 42 })
    })

    it('triple-nested parameterised fetchQuery works', async () => {
      const queryClient = new QueryClient()
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
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery(
        org.byId('acme').$sub.project(42).$sub.issue('ISS-1').$sub.comments,
      )
      expect(data).toEqual([{ author: 'Bob', body: 'looks good' }])
    })

    it('static sub-query under parameterised node fetchQuery', async () => {
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery(org.byId('acme').$sub.project(42).$sub.tasks)
      expect(data).toEqual([{ task: 'build' }])
    })

    it('static sub-query nested under param → static', async () => {
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery(org.byId('acme').$sub.members.$sub.active)
      expect(data).toEqual([{ name: 'Alice', active: true }])
    })

    it('cache isolation between different param values at same depth', async () => {
      const queryClient = new QueryClient()
      await queryClient.fetchQuery(org.byId('acme').$sub.project(1))
      await queryClient.fetchQuery(org.byId('acme').$sub.project(2))

      const data1 = queryClient.getQueryData(org.byId('acme').$sub.project(1).queryKey)
      const data2 = queryClient.getQueryData(org.byId('acme').$sub.project(2).queryKey)
      expect(data1).toEqual({ orgId: 'acme', projectId: 1 })
      expect(data2).toEqual({ orgId: 'acme', projectId: 2 })
    })

    it('invalidation at mid-level cascades to deeper queries', async () => {
      const queryClient = new QueryClient()
      await queryClient.fetchQuery(org.byId('corp').$sub.project(10).$sub.issue('A').$sub.comments)
      await queryClient.fetchQuery(org.byId('corp').$sub.project(10).$sub.tasks)

      await queryClient.invalidateQueries({
        queryKey: org.byId('corp').$sub.project(10).queryKey,
      })

      const commentsState = queryClient.getQueryState(
        org.byId('corp').$sub.project(10).$sub.issue('A').$sub.comments.queryKey,
      )
      const tasksState = queryClient.getQueryState(
        org.byId('corp').$sub.project(10).$sub.tasks.queryKey,
      )
      expect(commentsState?.isInvalidated).toBe(true)
      expect(tasksState?.isInvalidated).toBe(true)
    })

    it('invalidation at root scope cascades through all nesting', async () => {
      const queryClient = new QueryClient()
      await queryClient.fetchQuery(org.byId('root-test').$sub.members)

      await queryClient.invalidateQueries({ queryKey: org.queryKey })

      const state = queryClient.getQueryState(org.byId('root-test').$sub.members.queryKey)
      expect(state?.isInvalidated).toBe(true)
    })

    it('different orgs produce independent caches at every depth', async () => {
      const queryClient = new QueryClient()
      await queryClient.fetchQuery(org.byId('alpha').$sub.project(1).$sub.issue('X'))
      await queryClient.fetchQuery(org.byId('beta').$sub.project(1).$sub.issue('X'))

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

  describe('skipToken conditional queries (US3 - T022)', () => {
    it('resolved queryFn is skipToken symbol when parameter is undefined', () => {
      const q = createConditionalQuery('skipTest')
      const result = q.byId(undefined)
      expect(result.queryFn).toBe(skipToken)
    })

    it('resolved queryFn is a function when parameter is provided', () => {
      const q = createConditionalQuery('skipTest')
      const result = q.byId('abc')
      expect(typeof result.queryFn).toBe('function')
    })

    it('conditional node with queryFn produces correct data', async () => {
      const queryClient = new QueryClient()
      const q = createConditionalQuery('skipFetch')
      const data = await queryClient.fetchQuery(q.byId('xyz'))
      expect(data).toEqual({ id: 'xyz', name: 'Item xyz' })
    })

    it('static skipToken node preserves queryKey', () => {
      const q = createStructuredQuery('skipStatic', {
        maybe: {
          queryFn: skipToken,
        },
      })
      expect(q.maybe.queryKey).toEqual(['skipStatic', 'maybe'])
      expect(q.maybe.queryFn).toBe(skipToken)
    })
  })

  describe('structural equivalence with queryOptions()', () => {
    const allQueryFn = () => Promise.resolve(['tag1', 'tag2'])
    const byIdQueryFn = (id: string) => () => Promise.resolve({ id, name: `Tag ${id}` })
    const moreInfoQueryFn = (id: string) => () => Promise.resolve({ id, details: 'extra info' })

    const tagsForEquiv = createStructuredQuery('tags', {
      all: {
        queryFn: allQueryFn,
      },
      byId: (id: string) => ({
        params: [id],
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
      const direct = { queryKey: ['tags', 'all'], queryFn: allQueryFn }
      expectStructuralMatch(tagsForEquiv.all, direct)
      expect(tagsForEquiv.all.queryFn).toBe(direct.queryFn)
    })

    it('parameterised node matches queryOptions() shape', () => {
      const direct = {
        queryKey: ['tags', 'byId', '123'],
        queryFn: byIdQueryFn('123'),
      }
      expectStructuralMatch(tagsForEquiv.byId('123'), direct)
    })

    it('nested sub-query matches queryOptions() shape', () => {
      const direct = {
        queryKey: ['tags', 'byId', '456', 'moreInfo'],
        queryFn: moreInfoQueryFn('456'),
      }
      expectStructuralMatch(tagsForEquiv.byId('456').$sub.moreInfo, direct)
    })

    it('static node passes through extra options', () => {
      const withExtras = createStructuredQuery('extras', {
        item: {
          queryFn: () => Promise.resolve('data'),
          staleTime: 5000,
          gcTime: 30000,
          retry: 3,
          enabled: false,
        },
      })

      const direct = {
        queryKey: ['extras', 'item'],
        queryFn: () => Promise.resolve('data'),
        staleTime: 5000,
        gcTime: 30000,
        retry: 3,
        enabled: false,
      }

      expectStructuralMatch(withExtras.item, direct)
      expect(withExtras.item.staleTime).toBe(direct.staleTime)
      expect(withExtras.item.gcTime).toBe(direct.gcTime)
      expect(withExtras.item.retry).toBe(direct.retry)
      expect(withExtras.item.enabled).toBe(direct.enabled)
    })

    it('parameterised node passes through extra options', () => {
      const withExtras = createStructuredQuery('extras', {
        byId: (id: string) => ({
          params: [id],
          queryFn: () => Promise.resolve({ id }),
          staleTime: 10000,
          retry: false,
        }),
      })

      const direct = {
        queryKey: ['extras', 'byId', 'abc'],
        queryFn: () => Promise.resolve({ id: 'abc' }),
        staleTime: 10000,
        retry: false,
      }

      expectStructuralMatch(withExtras.byId('abc'), direct)
      expect(withExtras.byId('abc').staleTime).toBe(direct.staleTime)
      expect(withExtras.byId('abc').retry).toBe(direct.retry)
    })
  })
})
