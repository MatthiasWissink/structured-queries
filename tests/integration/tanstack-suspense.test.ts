import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { createQueryOptions } from '../../src/index'
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
      const withExtras = createQueryOptions('stale', {
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
})
