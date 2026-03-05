import { describe, it, expect } from 'vitest'
import { createQueryOptions } from '../../src/index'

describe('createQueryOptions', () => {
  const fetchFn = () => Promise.resolve(['tag1', 'tag2'])
  const tags = createQueryOptions('tags', {
    all: {
      queryFn: fetchFn,
      subQueries: {
        active: {
          queryFn: () => Promise.resolve([]),
        },
      },
    },
    byId: (id: string) => ({
      queryKey: [id],
      queryFn: () => Promise.resolve({ id, name: 'test' }),
      subQueries: {
        moreInfo: {
          queryFn: () => Promise.resolve({ details: true }),
        },
        version: (v: number) => ({
          queryKey: [v],
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
    const closureTags = createQueryOptions('tags', {
      byId: (id: string) => ({
        queryKey: [id],
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
    const grouped = createQueryOptions('tags', {
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
    const empty = createQueryOptions('empty', {})
    expect(empty.queryKey).toEqual(['empty'])
    expect(empty._scope).toBe('empty')
  })

  it('multi-segment dynamic keys', () => {
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

  it('extra query options passthrough', () => {
    const opts = createQueryOptions('tags', {
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
    const pages = createQueryOptions('pages', {
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
    const tasks = createQueryOptions('tasks', {
      search: (userId: string, page: number, filter: Filter) => ({
        queryKey: [userId, page],
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
    const reports = createQueryOptions('reports', {
      byRange: (start: Date, end: Date, format: string) => ({
        queryKey: [start.toISOString(), end.toISOString(), format],
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
    const q = createQueryOptions('test', {
      run: (a: number, b: string, c: Opts) => ({
        queryKey: [a, b],
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
    const search = createQueryOptions('search', {
      results: (term: string) => ({
        queryKey: [term],
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
})
