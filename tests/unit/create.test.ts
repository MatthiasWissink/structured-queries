import { describe, it, expect } from 'vitest'
import { skipToken } from '@tanstack/query-core'
import { createStructuredQuery } from '../../src/index'

describe('createStructuredQuery', () => {
  const fetchFn = () => Promise.resolve(['tag1', 'tag2'])
  const tags = createStructuredQuery('tags', {
    all: {
      queryFn: fetchFn,
      subQueries: {
        active: {
          queryFn: () => Promise.resolve([]),
        },
      },
    },
    byId: (id: string) => ({
      params: [id],
      queryFn: () => Promise.resolve({ id, name: 'test' }),
      subQueries: {
        moreInfo: {
          queryFn: () => Promise.resolve({ details: true }),
        },
        version: (v: number) => ({
          params: [v],
          queryFn: () => Promise.resolve({ id, version: v }),
        }),
      },
    }),
  })

  it('static leaf queryKey', () => {
    expect(tags.queryKey).toEqual(['tags'])
    expect(tags.all.queryKey).toEqual(['tags', 'all'])
  })

  it('static leaf queryFn passthrough', () => {
    expect(tags.all.queryFn).toBe(fetchFn)
  })

  it('parameterised node queryKey', () => {
    expect(tags.byId.queryKey).toEqual(['tags', 'byId'])
    expect(tags.byId('123').queryKey).toEqual(['tags', 'byId', '123'])
  })

  it('parameterised node queryFn closure', () => {
    let capturedId = ''
    const closureTags = createStructuredQuery('tags', {
      byId: (id: string) => ({
        params: [id],
        queryFn: () => {
          capturedId = id
          return Promise.resolve({ id })
        },
      }),
    })

    const node = closureTags.byId('abc')
    expect(node.queryFn).toBeDefined()
    // @ts-expect-error - simplified mock context for testing
    void node.queryFn({
      queryKey: ['tags', 'byId', 'abc'],
      signal: new AbortController().signal,
      meta: undefined,
    })
    expect(capturedId).toBe('abc')
  })

  it('nested child queryKey', () => {
    expect(tags.byId('123').$sub.moreInfo.queryKey).toEqual(['tags', 'byId', '123', 'moreInfo'])
  })

  it('scope node with children', () => {
    expect(tags.all.queryKey).toEqual(['tags', 'all'])
    expect(tags.all.$sub.active.queryKey).toEqual(['tags', 'all', 'active'])
    expect(tags.all.queryFn).toBeDefined()
    expect(tags.all.$sub.active.queryFn).toBeDefined()
  })

  it('nested parameterised nodes', () => {
    expect(tags.byId('123').$sub.version(2).queryKey).toEqual(['tags', 'byId', '123', 'version', 2])
  })

  it('scope node without queryFn', () => {
    const grouped = createStructuredQuery('tags', {
      filters: {
        subQueries: {
          active: {
            queryFn: () => Promise.resolve([]),
          },
        },
      },
    })

    expect(grouped.filters.queryKey).toEqual(['tags', 'filters'])
    expect(grouped.filters.$sub.active.queryKey).toEqual(['tags', 'filters', 'active'])
    expect(grouped.filters.queryFn).toBeUndefined()
  })

  it('empty definition', () => {
    const empty = createStructuredQuery('empty', {})
    expect(empty.queryKey).toEqual(['empty'])
  })

  it('multi-segment dynamic keys', () => {
    const repos = createStructuredQuery('repos', {
      byOwnerAndName: (p: { owner: string; name: string }) => ({
        params: [p.owner, p.name],
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

  it('extra query options passthrough', () => {
    const opts = createStructuredQuery('tags', {
      all: {
        queryFn: () => Promise.resolve([]),
        staleTime: 60_000,
        gcTime: 300_000,
        retry: 3,
        retryDelay: 1000,
        networkMode: 'offlineFirst',
        meta: { source: 'api' },
      },
    })

    expect(opts.all.staleTime).toBe(60_000)
    expect(opts.all.gcTime).toBe(300_000)
    expect(opts.all.retry).toBe(3)
    expect(opts.all.retryDelay).toBe(1000)
    expect(opts.all.networkMode).toBe('offlineFirst')
    expect(opts.all.meta).toEqual({ source: 'api' })
  })

  it('static infinite query node', () => {
    const pages = createStructuredQuery('pages', {
      list: {
        queryFn: ({ pageParam }: { pageParam: number }) =>
          Promise.resolve({ items: ['a'], next: pageParam + 1 }),
        initialPageParam: 0,
        getNextPageParam: (lastPage: { items: string[]; next: number }) => lastPage.next,
      },
    })

    expect(pages.list.queryKey).toEqual(['pages', 'list'])
    expect(pages.list.initialPageParam).toBe(0)
    expect(pages.list.getNextPageParam).toBeDefined()
    expect(pages.list.queryFn).toBeDefined()
  })

  it('multi-parameter dynamic node queryKey and queryFn', () => {
    type Filter = { status: string; priority: number }
    const tasks = createStructuredQuery('tasks', {
      search: (userId: string, page: number, filter: Filter) => ({
        params: [userId, page],
        queryFn: () => Promise.resolve({ userId, page, filter }),
      }),
    })

    expect(tasks.search.queryKey).toEqual(['tasks', 'search'])
    expect(tasks.search('u1', 3, { status: 'open', priority: 1 }).queryKey).toEqual([
      'tasks',
      'search',
      'u1',
      3,
    ])
    expect(tasks.search('u1', 3, { status: 'open', priority: 1 }).queryFn).toBeDefined()
  })

  it('multi-parameter dynamic node with sub-queries', () => {
    const reports = createStructuredQuery('reports', {
      byRange: (start: Date, end: Date, format: string) => ({
        params: [start.toISOString(), end.toISOString(), format],
        queryFn: () => Promise.resolve({ start, end, format }),
        subQueries: {
          summary: {
            queryFn: () => Promise.resolve({ total: 42 }),
          },
        },
      }),
    })

    const start = new Date('2025-01-01')
    const end = new Date('2025-12-31')
    expect(reports.byRange(start, end, 'csv').queryKey).toEqual([
      'reports',
      'byRange',
      start.toISOString(),
      end.toISOString(),
      'csv',
    ])
    expect(reports.byRange(start, end, 'csv').$sub.summary.queryKey).toEqual([
      'reports',
      'byRange',
      start.toISOString(),
      end.toISOString(),
      'csv',
      'summary',
    ])
  })

  it('multi-parameter dynamic node closure captures all args', () => {
    type Opts = { verbose: boolean }
    let captured: { a: number; b: string; c: Opts } | undefined
    const q = createStructuredQuery('test', {
      run: (a: number, b: string, c: Opts) => ({
        params: [a, b],
        queryFn: () => {
          captured = { a, b, c }
          return Promise.resolve(captured)
        },
      }),
    })

    const node = q.run(7, 'hello', { verbose: true })
    // @ts-expect-error - simplified mock context for testing
    void node.queryFn({
      queryKey: ['test', 'run', 7, 'hello'],
      signal: new AbortController().signal,
      meta: undefined,
    })
    expect(captured).toEqual({ a: 7, b: 'hello', c: { verbose: true } })
  })

  it('dynamic infinite query node', () => {
    const search = createStructuredQuery('search', {
      results: (term: string) => ({
        params: [term],
        queryFn: ({ pageParam }: { pageParam: number }) =>
          Promise.resolve({ results: [term], next: pageParam + 1 }),
        initialPageParam: 0,
        getNextPageParam: (lastPage: { results: string[]; next: number }) => lastPage.next,
      }),
    })

    expect(search.results.queryKey).toEqual(['search', 'results'])
    expect(search.results('hello').queryKey).toEqual(['search', 'results', 'hello'])
    expect(search.results('hello').initialPageParam).toBe(0)
    expect(search.results('hello').getNextPageParam).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // skipToken passthrough test (US3 - T021)
  // ---------------------------------------------------------------------------

  it('resolveNodeOptions passes through skipToken unchanged', () => {
    const q = createStructuredQuery('skip', {
      conditional: {
        queryFn: skipToken,
      },
    })
    // skipToken is a symbol (truthy), so it should pass through the `if (queryFn)` guard
    expect(q.conditional.queryFn).toBe(skipToken)
  })

  // ---------------------------------------------------------------------------
  // $sub child namespace behavior tests
  // ---------------------------------------------------------------------------

  describe('$sub child namespace', () => {
    const withChildren = createStructuredQuery('ns', {
      parent: {
        queryFn: () => Promise.resolve('parent'),
        subQueries: {
          child: {
            queryFn: () => Promise.resolve('child'),
          },
        },
      },
    })

    it('children are accessible via $sub', () => {
      expect(withChildren.parent.$sub.child).toBeDefined()
      expect(withChildren.parent.$sub.child.queryKey).toEqual(['ns', 'parent', 'child'])
    })

    it('$sub is included in Object.keys()', () => {
      const keys = Object.keys(withChildren.parent)
      expect(keys).toContain('$sub')
      expect(keys).toContain('queryKey')
      expect(keys).toContain('queryFn')
    })

    it('$sub is included in spread', () => {
      const spread = { ...withChildren.parent }
      expect(spread).toHaveProperty('$sub')
      expect(spread).toHaveProperty('queryKey')
      expect(spread).toHaveProperty('queryFn')
    })

    it('$sub children are enumerable within $sub', () => {
      const childKeys = Object.keys(withChildren.parent.$sub)
      expect(childKeys).toContain('child')
    })

    it('nodes without subQueries have no $sub property', () => {
      const noChildren = createStructuredQuery('ns', {
        leaf: {
          queryFn: () => Promise.resolve('leaf'),
        },
      })
      expect(noChildren.leaf).not.toHaveProperty('$sub')
    })

    it('dynamic node children are under $sub', () => {
      const q = createStructuredQuery('ns', {
        byId: (id: string) => ({
          params: [id],
          queryFn: () => Promise.resolve(id),
          subQueries: {
            details: {
              queryFn: () => Promise.resolve('details'),
            },
          },
        }),
      })

      const resolved = q.byId('abc')
      expect(resolved.$sub.details).toBeDefined()
      expect(resolved.$sub.details.queryKey).toEqual(['ns', 'byId', 'abc', 'details'])
      expect(Object.keys(resolved.$sub)).toContain('details')
    })
  })

  // ---------------------------------------------------------------------------
  // Runtime assertion tests
  // ---------------------------------------------------------------------------

  it('throws on dynamic node missing params property', () => {
    expect(() => {
      const q = createStructuredQuery('bad', {
        // @ts-expect-error - intentionally invalid for runtime test
        broken: () => ({ queryFn: () => Promise.resolve('oops') }),
      })
      ;(q.broken as unknown as () => unknown)()
    }).toThrow(/params/)
  })
})
