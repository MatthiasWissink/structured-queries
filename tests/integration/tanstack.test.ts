import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
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

  // US3 Scenario 1: Static node works with fetchQuery
  it('static node works with QueryClient.fetchQuery', async () => {
    const data = await queryClient.fetchQuery(tags.all)
    expect(data).toEqual(['tag1', 'tag2'])
  })

  // US3 Scenario 2: Parameterised node works with fetchQuery
  it('parameterised node works with QueryClient.fetchQuery', async () => {
    const data = await queryClient.fetchQuery(tags.byId('123'))
    expect(data).toEqual({ id: '123', name: 'Tag 123' })
  })

  // US3 Scenario 3: Nested child node works with fetchQuery
  it('nested child node works with QueryClient.fetchQuery', async () => {
    const data = await queryClient.fetchQuery(tags.byId('456').$sub.moreInfo)
    expect(data).toEqual({ id: '456', details: 'extra info' })
  })

  // Cache retrieval works with queryKey
  it('getQueryData retrieves cached data by queryKey', async () => {
    await queryClient.fetchQuery(tags.all)
    const cached = queryClient.getQueryData(tags.all.queryKey)
    expect(cached).toEqual(['tag1', 'tag2'])
  })

  // Invalidation works with scope key
  it('invalidateQueries works with scope queryKey', async () => {
    await queryClient.fetchQuery(tags.all)
    await queryClient.invalidateQueries({ queryKey: tags.queryKey })
    const state = queryClient.getQueryState(tags.all.queryKey)
    expect(state?.isInvalidated).toBe(true)
  })

  // Multi-segment dynamic node works with fetchQuery
  it('multi-segment dynamic node works with QueryClient.fetchQuery', async () => {
    const repos = createQueryOptions('repos', {
      byOwnerAndName: (p: { owner: string; name: string }) => ({
        queryKey: [p.owner, p.name],
        queryFn: () => Promise.resolve({ owner: p.owner, name: p.name }),
      }),
    })

    const data = await queryClient.fetchQuery(repos.byOwnerAndName({ owner: 'acme', name: 'lib' }))
    expect(data).toEqual({ owner: 'acme', name: 'lib' })
  })

  // Parameterised nodes produce precise tuple-typed queryKeys without
  // requiring `as const` or explicit type annotations from the user.
  // This is achieved by using a non-empty tuple constraint in NodeDefinition,
  // which provides contextual typing that narrows [id] to [string].
  describe('parameterised node queryKey precision', () => {
    it('parameterised queryKey is a precise tuple at runtime and type level', async () => {
      const data = await queryClient.fetchQuery(tags.byId('widthTest'))
      expect(data).toEqual({ id: 'widthTest', name: 'Tag widthTest' })

      expect(tags.byId('widthTest').queryKey).toEqual(['tags', 'byId', 'widthTest'])
      expect(tags.byId('widthTest').queryKey).toHaveLength(3)
    })

    it('cache lookup works with precise queryKey', async () => {
      await queryClient.fetchQuery(tags.byId('cached'))
      const cached = queryClient.getQueryData(tags.byId('cached').queryKey)
      expect(cached).toEqual({ id: 'cached', name: 'Tag cached' })
    })

    it('invalidation with partial key works', async () => {
      await queryClient.fetchQuery(tags.byId('inv1'))
      await queryClient.fetchQuery(tags.byId('inv2'))

      // Partial key invalidates all matching queries
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
})
