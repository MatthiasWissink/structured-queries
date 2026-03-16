import { describe, it, expectTypeOf } from 'vitest'
import type {
  DataTag,
  DefaultError,
  InfiniteData,
  QueryKey,
  QueryObserverOptions,
  dataTagSymbol,
} from '@tanstack/query-core'
import { skipToken } from '@tanstack/query-core'
import { createStructuredQuery } from '../../src/index'
import type { inferQueryKeys } from '../../src/index'

// ---------------------------------------------------------------------------
// Type-level helper: ValidateChildNames / ReservedQueryKeys
// ---------------------------------------------------------------------------

/**
 * Reserved property collision detection tests (US2 - T006).
 * These verify that child query names colliding with QueryObserverOptions keys
 * produce compile-time errors via ValidateChildNames.
 */
describe('reserved property collision detection', () => {
  it('rejects child named "queryKey"', () => {
    createStructuredQuery('x', {
      items: {
        subQueries: {
          // @ts-expect-error - 'queryKey' collides with a reserved TanStack Query property
          queryKey: { queryFn: () => Promise.resolve('oops') },
        },
      },
    })
  })

  it('rejects child named "staleTime"', () => {
    createStructuredQuery('x', {
      items: {
        subQueries: {
          // @ts-expect-error - 'staleTime' collides with a reserved TanStack Query property
          staleTime: { queryFn: () => Promise.resolve('oops') },
        },
      },
    })
  })

  it('rejects child named "enabled"', () => {
    createStructuredQuery('x', {
      items: {
        subQueries: {
          // @ts-expect-error - 'enabled' collides with a reserved TanStack Query property
          enabled: { queryFn: () => Promise.resolve('oops') },
        },
      },
    })
  })

  it('allows valid (non-reserved) child names', () => {
    const q = createStructuredQuery('x', {
      items: {
        subQueries: {
          details: { queryFn: () => Promise.resolve('ok') },
          metadata: { queryFn: () => Promise.resolve('ok') },
        },
      },
    })
    // Should compile without error and have proper types
    expectTypeOf(q.items).toHaveProperty('queryKey')
  })

  it('rejects reserved names in dynamic node subQueries', () => {
    createStructuredQuery('x', {
      // @ts-expect-error - 'queryFn' collides with a reserved TanStack Query property
      byId: (id: string) => ({
        params: [id],
        queryFn: () => Promise.resolve(id),
        subQueries: {
          queryFn: { queryFn: () => Promise.resolve('oops') },
        },
      }),
    })
  })

  it('ReservedQueryKeys is derived from keyof QueryObserverOptions', () => {
    // Verify a representative sample of QueryObserverOptions keys are reserved
    type SampleReserved = 'queryKey' | 'queryFn' | 'staleTime' | 'gcTime' | 'enabled' | 'retry'
    expectTypeOf<SampleReserved>().toExtend<keyof QueryObserverOptions>()
  })
})

describe('type-level tests for createStructuredQuery', () => {
  const tags = createStructuredQuery('tags', {
    all: {
      queryFn: () => Promise.resolve(['tag1', 'tag2']),
      staleTime: 60_000,
    },
    byId: (id: string) => ({
      params: [id],
      queryFn: () => Promise.resolve({ id, name: 'test' }),
      subQueries: {
        moreInfo: {
          queryFn: () => Promise.resolve({ details: 'info' }),
        },
        version: (v: number) => ({
          params: [v],
          queryFn: () => Promise.resolve({ id, version: v }),
        }),
      },
    }),
  })

  it('root queryKey', () => {
    const _key: readonly ['tags'] = tags.queryKey
  })

  it('static leaf queryKey', () => {
    const _key: readonly ['tags', 'all'] = tags.all.queryKey
  })

  it('uncalled parameterised queryKey', () => {
    const _key: readonly ['tags', 'byId'] = tags.byId.queryKey
  })

  it('called parameterised queryKey', () => {
    const _key: readonly ['tags', 'byId', string] = tags.byId('123').queryKey
  })

  it('nested child key includes all ancestors', () => {
    const _key: readonly ['tags', 'byId', string, 'moreInfo'] =
      tags.byId('123').$sub.moreInfo.queryKey
  })

  it('nested parameterised child key', () => {
    const _key: readonly ['tags', 'byId', string, 'version', number] = tags
      .byId('123')
      .$sub.version(2).queryKey
  })

  it('parameterised node is callable', () => {
    expectTypeOf(tags.byId).toBeCallableWith('some-id')
  })

  it('rejects wrong parameter type', () => {
    // @ts-expect-error - number is not assignable to string
    tags.byId(123)
  })

  it('rejects non-existent child', () => {
    // @ts-expect-error - 'nonExistent' does not exist
    const _unused: unknown = tags.all.nonExistent
  })

  it('rejects non-existent child on parameterised result', () => {
    // @ts-expect-error - 'nonExistent' does not exist
    const _unused: unknown = tags.byId('123').nonExistent
  })

  it('static leaf data type inferred from queryFn', () => {
    const qf = tags.all.queryFn
    expectTypeOf(qf).returns.resolves.toEqualTypeOf<string[]>()
  })

  it('parameterised node data type inferred from queryFn', () => {
    const qf = tags.byId('123').queryFn
    expectTypeOf(qf).returns.resolves.toEqualTypeOf<{
      id: string
      name: string
    }>()
  })

  it('multi-segment dynamic key types', () => {
    const repos = createStructuredQuery('repos', {
      byOwnerAndName: (p: { owner: string; name: string }) => ({
        params: [p.owner, p.name],
        queryFn: () => Promise.resolve({ owner: p.owner, name: p.name }),
      }),
    })

    const _uncalled: readonly ['repos', 'byOwnerAndName'] = repos.byOwnerAndName.queryKey
    const _called: readonly ['repos', 'byOwnerAndName', string, string] = repos.byOwnerAndName({
      owner: 'a',
      name: 'b',
    }).queryKey
  })

  it('inferQueryKeys extracts all key tuples', () => {
    type Keys = inferQueryKeys<typeof tags>
    const _root: Keys = ['tags']
    const _all: Keys = ['tags', 'all']
    const _byId: Keys = ['tags', 'byId']
    const _byIdParam: Keys = ['tags', 'byId', '123']
    const _moreInfo: Keys = ['tags', 'byId', '123', 'moreInfo']
    const _version: Keys = ['tags', 'byId', '123', 'version']
    const _versionParam: Keys = ['tags', 'byId', '123', 'version', 2]
  })
})

describe('infinite query type inference', () => {
  type Page = { items: string[]; nextCursor: number }

  const pages = createStructuredQuery('pages', {
    list: {
      queryFn: ({ pageParam }: { pageParam: number }) =>
        Promise.resolve({ items: [`item-${String(pageParam)}`], nextCursor: pageParam + 1 }),
      initialPageParam: 0,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
    },
  })

  it('infinite query queryKey', () => {
    const _key: readonly ['pages', 'list'] = pages.list.queryKey
  })

  it('infinite query has initialPageParam', () => {
    expectTypeOf(pages.list.initialPageParam).toEqualTypeOf<number>()
  })

  it('infinite query has getNextPageParam', () => {
    expectTypeOf(pages.list.getNextPageParam).toBeFunction()
  })

  it('dynamic infinite query node', () => {
    const queries = createStructuredQuery('search', {
      results: (term: string) => ({
        params: [term],
        queryFn: ({ pageParam }: { pageParam: number }) =>
          Promise.resolve({ results: [term], next: pageParam + 1 }),
        initialPageParam: 0,
        getNextPageParam: (lastPage: { results: string[]; next: number }) => lastPage.next,
      }),
    })

    const _uncalled: readonly ['search', 'results'] = queries.results.queryKey
    const _called: readonly ['search', 'results', string] = queries.results('hello').queryKey
    expectTypeOf(queries.results('hello').initialPageParam).toEqualTypeOf<number>()
  })

  it('infinite query data type is InfiniteData', () => {
    // The queryKey DataTag should brand data as InfiniteData
    type TaggedData = (typeof pages.list.queryKey)[dataTagSymbol]
    expectTypeOf<TaggedData>().toEqualTypeOf<InfiniteData<Page, number>>()
  })
})

// ---------------------------------------------------------------------------
// skipToken type narrowing (US3 - T017)
// ---------------------------------------------------------------------------

describe('skipToken type narrowing', () => {
  it('accepts skipToken as queryFn in a static leaf definition', () => {
    const q = createStructuredQuery('cond', {
      maybe: {
        queryFn: skipToken,
      },
    })
    expectTypeOf(q.maybe).toHaveProperty('queryKey')
    expectTypeOf(q.maybe).toHaveProperty('queryFn')
  })

  it('resolved queryFn type includes SkipToken when defined with skipToken', () => {
    const _q = createStructuredQuery('cond', {
      maybe: {
        queryFn: skipToken,
      },
    })
    // SkipToken should be part of the resolved queryFn union
    type MaybeQueryFn = (typeof _q.maybe)['queryFn']
    expectTypeOf<typeof skipToken>().toExtend<MaybeQueryFn>()
  })

  it('dynamic node with conditional skipToken includes SkipToken in queryFn union', () => {
    const q = createStructuredQuery('cond', {
      byId: (id: string | undefined) => ({
        params: [id ?? ''],
        queryFn: id ? () => Promise.resolve({ id }) : skipToken,
      }),
    })
    const _result = q.byId(undefined)
    // SkipToken should be part of the queryFn union type
    type ResultQueryFn = (typeof _result)['queryFn']
    expectTypeOf<typeof skipToken>().toExtend<ResultQueryFn>()
  })

  it('skipToken queryFn is not assignable to a plain function type', () => {
    const q = createStructuredQuery('cond', {
      maybe: {
        queryFn: skipToken,
      },
    })
    // @ts-expect-error - SkipToken is not callable, cannot be assigned to a function
    const _fn: (...args: unknown[]) => unknown = q.maybe.queryFn
    void _fn
  })
})

// ---------------------------------------------------------------------------
// DataTag structural compatibility (catches upstream signature changes)
// ---------------------------------------------------------------------------

describe('DataTag structural compatibility', () => {
  const dtTags = createStructuredQuery('dt', {
    all: { queryFn: () => Promise.resolve([]) },
  })

  it('DataTag-branded queryKey is assignable to QueryKey', () => {
    expectTypeOf(dtTags.all.queryKey).toExtend<QueryKey>()
    expectTypeOf(dtTags.queryKey).toExtend<QueryKey>()
  })

  it('DataTag accepts 3 type parameters (key, data, error)', () => {
    type _Tag = DataTag<readonly ['test'], string, DefaultError>
    expectTypeOf<_Tag>().toExtend<QueryKey>()
  })

  it('root queryKey DataTag brands unknown data', () => {
    type RootTag = (typeof dtTags.queryKey)[typeof dataTagSymbol]
    expectTypeOf<RootTag>().toEqualTypeOf<unknown>()
  })
})
