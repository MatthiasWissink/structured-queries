import { describe, it, expect } from 'vitest'
import { createQueryOptions } from '../../src/index'

describe('createQueryOptions', () => {
  // US1 Scenario 1: Static leaf queryKey
  it('produces correct queryKey for a static leaf node', () => {
    const tags = createQueryOptions('tags', {
      all: {
        queryFn: () => Promise.resolve(['tag1', 'tag2']),
      },
    })

    expect(tags.queryKey).toEqual(['tags'])
    expect(tags.all.queryKey).toEqual(['tags', 'all'])
  })

  // US1 Scenario 2: Static leaf queryFn passthrough
  it('passes through queryFn for static leaf nodes', () => {
    const fetchFn = () => Promise.resolve(['tag1'])
    const tags = createQueryOptions('tags', {
      all: {
        queryFn: fetchFn,
      },
    })

    expect(tags.all.queryFn).toBe(fetchFn)
  })

  // US1 Scenario 3: Parameterised node queryKey
  it('produces correct queryKey for parameterised nodes', () => {
    const tags = createQueryOptions('tags', {
      byId: (id: string) => ({
        queryKey: [id],
        queryFn: () => Promise.resolve({ id, name: 'test' }),
      }),
    })

    // Uncalled: partial key for invalidation
    expect(tags.byId.queryKey).toEqual(['tags', 'byId'])

    // Called: full key with parameter
    expect(tags.byId('123').queryKey).toEqual(['tags', 'byId', '123'])
  })

  // US1 Scenario 4: Parameterised node queryFn uses closure
  it('passes through queryFn from parameterised nodes', () => {
    let capturedId = ''
    const tags = createQueryOptions('tags', {
      byId: (id: string) => ({
        queryKey: [id],
        queryFn: () => {
          capturedId = id
          return Promise.resolve({ id })
        },
      }),
    })

    const node = tags.byId('abc')
    expect(node.queryFn).toBeDefined()
    // Call queryFn to verify closure works
    if (node.queryFn) {
      // @ts-expect-error - simplified mock context for testing
      void node.queryFn({
        queryKey: ['tags', 'byId', 'abc'],
        signal: new AbortController().signal,
        meta: undefined,
      })
    }
    expect(capturedId).toBe('abc')
  })

  // US1 Scenario 5: Nested child queryKey
  it('produces correct queryKey for nested children', () => {
    const tags = createQueryOptions('tags', {
      byId: (id: string) => ({
        queryKey: [id],
        queryFn: () => Promise.resolve({ id }),
        subQueries: {
          moreInfo: {
            queryFn: () => Promise.resolve({ details: true }),
          },
        },
      }),
    })

    expect(tags.byId('123').$sub.moreInfo.queryKey).toEqual(['tags', 'byId', '123', 'moreInfo'])
  })

  // Scope node with children
  it('handles scope nodes with optional queryFn and children', () => {
    const tags = createQueryOptions('tags', {
      all: {
        queryFn: () => Promise.resolve([]),
        subQueries: {
          active: {
            queryFn: () => Promise.resolve([]),
          },
        },
      },
    })

    expect(tags.all.queryKey).toEqual(['tags', 'all'])
    expect(tags.all.$sub.active.queryKey).toEqual(['tags', 'all', 'active'])
    expect(tags.all.queryFn).toBeDefined()
    expect(tags.all.$sub.active.queryFn).toBeDefined()
  })

  // Extra query options passthrough
  it('passes through extra query options like staleTime', () => {
    const tags = createQueryOptions('tags', {
      all: {
        queryFn: () => Promise.resolve([]),
        staleTime: 60_000,
        gcTime: 300_000,
      },
    })

    expect(tags.all.staleTime).toBe(60_000)
    expect(tags.all.gcTime).toBe(300_000)
  })

  // Deeply nested parameterised nodes
  it('handles nested parameterised nodes (param inside param)', () => {
    const tags = createQueryOptions('tags', {
      byId: (id: string) => ({
        queryKey: [id],
        queryFn: () => Promise.resolve({ id }),
        subQueries: {
          version: (v: number) => ({
            queryKey: [v],
            queryFn: () => Promise.resolve({ id, version: v }),
          }),
        },
      }),
    })

    expect(tags.byId('123').$sub.version(2).queryKey).toEqual(['tags', 'byId', '123', 'version', 2])
  })

  // Scope without queryFn (pure grouping)
  it('handles scope nodes without queryFn', () => {
    const tags = createQueryOptions('tags', {
      filters: {
        subQueries: {
          active: {
            queryFn: () => Promise.resolve([]),
          },
        },
      },
    })

    expect(tags.filters.queryKey).toEqual(['tags', 'filters'])
    expect(tags.filters.$sub.active.queryKey).toEqual(['tags', 'filters', 'active'])
    expect(tags.filters.queryFn).toBeUndefined()
  })

  // Empty definition
  it('handles empty definition object', () => {
    const empty = createQueryOptions('empty', {})
    expect(empty.queryKey).toEqual(['empty'])
    expect(empty._scope).toBe('empty')
  })

  // Multi-segment dynamic keys
  it('produces correct queryKey for multi-segment dynamic keys', () => {
    const repos = createQueryOptions('repos', {
      byOwnerAndName: (p: { owner: string; name: string }) => ({
        queryKey: [p.owner, p.name],
        queryFn: () => Promise.resolve({ owner: p.owner, name: p.name }),
      }),
    })

    expect(repos.byOwnerAndName.queryKey).toEqual(['repos', 'byOwnerAndName'])
    expect(repos.byOwnerAndName({ owner: 'acme', name: 'lib' }).queryKey).toEqual([
      'repos',
      'byOwnerAndName',
      'acme',
      'lib',
    ])
  })

  // Broader query options passthrough
  it('passes through additional query options like retry, networkMode, meta', () => {
    const tags = createQueryOptions('tags', {
      all: {
        queryFn: () => Promise.resolve([]),
        retry: 3,
        retryDelay: 1000,
        networkMode: 'offlineFirst',
        meta: { source: 'api' },
      },
    })

    expect(tags.all.retry).toBe(3)
    expect(tags.all.retryDelay).toBe(1000)
    expect(tags.all.networkMode).toBe('offlineFirst')
    expect(tags.all.meta).toEqual({ source: 'api' })
  })
})
