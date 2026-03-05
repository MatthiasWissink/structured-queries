import { describe, it, expectTypeOf } from 'vitest'
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

  // QueryKey type checks use typed variable assignments.
  // DataTag brands the tuple with phantom symbols, so we verify
  // assignability to the base tuple type (if it compiles, it passes).

  // Root scope key is readonly tuple
  it('root queryKey is readonly ["tags"]', () => {
    const _key: readonly ['tags'] = tags.queryKey
  })

  // Static leaf key tuple inference
  it('static leaf queryKey is readonly ["tags", "all"]', () => {
    const _key: readonly ['tags', 'all'] = tags.all.queryKey
  })

  // Parameterised node uncalled key
  it('parameterised node uncalled queryKey is readonly ["tags", "byId"]', () => {
    const _key: readonly ['tags', 'byId'] = tags.byId.queryKey
  })

  // Parameterised node called key
  it('parameterised node called queryKey includes param', () => {
    const _key: readonly ['tags', 'byId', string] = tags.byId('123').queryKey
  })

  // Nested child key under parameterised node
  it('nested child key includes all ancestors', () => {
    const _key: readonly ['tags', 'byId', string, 'moreInfo'] =
      tags.byId('123').$sub.moreInfo.queryKey
  })

  // Nested parameterised child key
  it('nested parameterised child key includes all ancestors and both params', () => {
    const _key: readonly ['tags', 'byId', string, 'version', number] = tags
      .byId('123')
      .$sub.version(2).queryKey
  })

  // Parameterised node is callable
  it('parameterised node is callable with correct param type', () => {
    expectTypeOf(tags.byId).toBeCallableWith('some-id')
  })

  // EC1: Wrong param type should error
  it('rejects wrong parameter type', () => {
    // @ts-expect-error - number is not assignable to string
    tags.byId(123)
  })

  // EC2: Non-existent child should error
  it('rejects access to non-existent child property', () => {
    // @ts-expect-error - 'nonExistent' does not exist
    const _unused: unknown = tags.all.nonExistent
  })

  // EC3: Non-existent child on parameterised result
  it('rejects access to non-existent child on parameterised node result', () => {
    // @ts-expect-error - 'nonExistent' does not exist
    const _unused: unknown = tags.byId('123').nonExistent
  })

  // Data types flow through queryFn
  it('static leaf data type is inferred from queryFn', () => {
    const qf = tags.all.queryFn
    expectTypeOf(qf).not.toBeUndefined()
    if (qf) expectTypeOf(qf).returns.resolves.toEqualTypeOf<string[]>()
  })

  it('parameterised node data type is inferred from queryFn', () => {
    const qf = tags.byId('123').queryFn
    expectTypeOf(qf).not.toBeUndefined()
    if (qf)
      expectTypeOf(qf).returns.resolves.toEqualTypeOf<{
        id: string
        name: string
      }>()
  })

  // Multi-segment dynamic key type inference
  it('multi-segment dynamic key types are inferred correctly', () => {
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

  // inferQueryKeys extracts all key tuples
  it('inferQueryKeys extracts all key tuples from a StructuredQuery', () => {
    type Keys = inferQueryKeys<typeof tags>
    // Verify each expected key tuple is assignable to the Keys union.
    // StripDataTag removes the DataTag branding, so these are plain tuples.
    const _root: Keys = ['tags'] as const
    const _all: Keys = ['tags', 'all'] as const
    const _byId: Keys = ['tags', 'byId'] as const
    const _byIdParam: Keys = ['tags', 'byId', '123'] as const
    const _moreInfo: Keys = ['tags', 'byId', '123', 'moreInfo'] as const
    const _version: Keys = ['tags', 'byId', '123', 'version'] as const
    const _versionParam: Keys = ['tags', 'byId', '123', 'version', 2] as const
  })
})
