import { describe, it, expect, expectTypeOf } from 'vitest'
import { QueryClient, skipToken } from '@tanstack/query-core'
import { createStructuredQuery } from '../../src/index'
import {
  items,
  infinitePages,
  createInfiniteSearch,
  expectQueryNode,
  expectInfiniteQueryNode,
} from './fixtures'

describe('TanStack Query suspense compatibility', () => {
  describe('useSuspenseQuery compatibility', () => {
    it('static node has required properties', () => {
      expectQueryNode(items.all)
    })

    it('parameterised node has required properties', () => {
      expectQueryNode(items.byId('x'))
    })

    it('nested sub-query has required properties', () => {
      expectQueryNode(items.byId('x').$sub.details)
    })

    it('options with staleTime/gcTime/retry pass through for suspense use', () => {
      const withExtras = createStructuredQuery('stale', {
        item: {
          queryFn: () => Promise.resolve('data'),
          staleTime: 5000,
          gcTime: 30000,
          retry: 3,
        },
      })
      expectQueryNode(withExtras.item)
      expect(withExtras.item.staleTime).toBe(5000)
      expect(withExtras.item.gcTime).toBe(30000)
      expect(withExtras.item.retry).toBe(3)
    })
  })

  describe('useSuspenseInfiniteQuery compatibility', () => {
    it('static infinite node has all required properties', () => {
      expectInfiniteQueryNode(infinitePages.list)
    })

    it('static infinite node works with fetchInfiniteQuery', async () => {
      const queryClient = new QueryClient()
      const data = await queryClient.fetchInfiniteQuery(infinitePages.list)
      expect(data.pages).toEqual([{ items: ['page-0'], nextCursor: 1 }])
      expect(data.pageParams).toEqual([0])
    })

    it('dynamic infinite node has all required properties', () => {
      const search = createInfiniteSearch('searchProps')
      expectInfiniteQueryNode(search.results('hello'))
    })

    it('dynamic infinite node works with fetchInfiniteQuery', async () => {
      const queryClient = new QueryClient()
      const search = createInfiniteSearch('searchSusp')
      const data = await queryClient.fetchInfiniteQuery(search.results('world'))
      expect(data.pages).toEqual([{ results: ['world'], next: 1 }])
      expect(data.pageParams).toEqual([0])
    })
  })

  describe('skipToken + suspense incompatibility (US3 - T018)', () => {
    it('skipToken node queryFn is not assignable to a function-only type', () => {
      const q = createStructuredQuery('suspSkip', {
        conditional: {
          queryFn: skipToken,
        },
      })

      // Suspense queries require queryFn to be a callable function, not SkipToken
      // @ts-expect-error - SkipToken queryFn cannot satisfy a function-only type
      const _fn: (...args: never[]) => Promise<unknown> = q.conditional.queryFn
      void _fn
    })

    it('non-skipToken node queryFn IS assignable to a function type', () => {
      const _q = createStructuredQuery('suspOk', {
        always: {
          queryFn: () => Promise.resolve('data'),
        },
      })

      // Regular queryFn nodes should NOT include SkipToken in the union
      type AlwaysQueryFn = (typeof _q.always)['queryFn']
      expectTypeOf<typeof skipToken>().not.toExtend<AlwaysQueryFn>()
    })
  })
})
