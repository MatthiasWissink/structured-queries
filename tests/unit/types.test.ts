import { describe, it, expectTypeOf } from 'vitest'
import { skipToken } from '@tanstack/react-query'
import type { InfiniteData, dataTagSymbol } from '@tanstack/query-core'
import { createQueryOptions } from '../../src/index'
import type { inferQueryKeys } from '../../src/index'

describe('type-level tests for createQueryOptions', () => {
  const tags = createQueryOptions('tags', {
    all: {
      queryFn: () => Promise.resolve(['tag1', 'tag2']),
      staleTime: 60_000,
    },
    byId: (id: string) => ({
      queryKey: [id],
      queryFn: () => Promise.resolve({ id, name: 'test' }),
      subQueries: {
        moreInfo: {
          queryFn: () => Promise.resolve({ details: 'info' }),
        },
        version: (v: number) => ({
          queryKey: [v],
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
    expectTypeOf(qf).not.toBeUndefined()
    if (qf) expectTypeOf(qf).returns.resolves.toEqualTypeOf<string[]>()
  })

  it('parameterised node data type inferred from queryFn', () => {
    const qf = tags.byId('123').queryFn
    expectTypeOf(qf).not.toBeUndefined()
    if (qf)
      expectTypeOf(qf).returns.resolves.toEqualTypeOf<{
        id: string
        name: string
      }>()
  })

  it('multi-segment dynamic key types', () => {
    const repos = createQueryOptions('repos', {
      byOwnerAndName: (p: { owner: string; name: string }) => ({
        queryKey: [p.owner, p.name],
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
    const _root: Keys = ['tags'] as const
    const _all: Keys = ['tags', 'all'] as const
    const _byId: Keys = ['tags', 'byId'] as const
    const _byIdParam: Keys = ['tags', 'byId', '123'] as const
    const _moreInfo: Keys = ['tags', 'byId', '123', 'moreInfo'] as const
    const _version: Keys = ['tags', 'byId', '123', 'version'] as const
    const _versionParam: Keys = ['tags', 'byId', '123', 'version', 2] as const
  })
})

describe('skipToken type inference', () => {
  it('infers data type when queryFn is conditionally skipToken (dynamic node)', () => {
    const queries = createQueryOptions('items', {
      detail: (id: string | undefined) => ({
        queryKey: [id ?? 'none'],
        queryFn: id ? () => Promise.resolve({ id, name: 'test' }) : skipToken,
      }),
    })

    const resolved = queries.detail('abc')
    const qf = resolved.queryFn
    expectTypeOf(qf).not.toBeUndefined()
    if (qf && qf !== skipToken) {
      expectTypeOf(qf).returns.resolves.toEqualTypeOf<{ id: string; name: string }>()
    }
  })

  it('infers data type when queryFn is conditionally skipToken (static node)', () => {
    const enabled = true as boolean
    const queries = createQueryOptions('items', {
      all: {
        queryFn: enabled ? () => Promise.resolve(['a', 'b']) : skipToken,
      },
    })

    const qf = queries.all.queryFn
    if (qf && qf !== skipToken) {
      expectTypeOf(qf).returns.resolves.toEqualTypeOf<string[]>()
    }
  })
})

describe('infinite query type inference', () => {
  type Page = { items: string[]; nextCursor: number }

  const pages = createQueryOptions('pages', {
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
    const queries = createQueryOptions('search', {
      results: (term: string) => ({
        queryKey: [term],
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
