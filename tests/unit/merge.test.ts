import { describe, it, expect, expectTypeOf } from 'vitest'
import { createQueryOptions, mergeQueryOptions } from '../../src/index'

describe('mergeQueryOptions', () => {
  const tags = createQueryOptions('tags', {
    all: {
      queryFn: () => Promise.resolve(['tag1', 'tag2']),
    },
    byId: (id: string) => ({
      queryKey: [id],
      queryFn: () => Promise.resolve({ id, name: 'test' }),
    }),
  })

  const news = createQueryOptions('news', {
    latest: {
      queryFn: () => Promise.resolve([{ title: 'Breaking' }]),
    },
    bySlug: (slug: string) => ({
      queryKey: [slug],
      queryFn: () => Promise.resolve({ slug, title: 'Article' }),
    }),
  })

  // US2 Scenario 1: Merge two trees and access nodes
  it('merges two trees into a single object keyed by scope', () => {
    const queries = mergeQueryOptions(tags, news)

    expect(queries.tags).toBe(tags)
    expect(queries.news).toBe(news)
  })

  // US2 Scenario 2: Access nested nodes through merged object
  it('allows accessing nested nodes through merged object', () => {
    const queries = mergeQueryOptions(tags, news)

    expect(queries.tags.all.queryKey).toEqual(['tags', 'all'])
    expect(queries.news.latest.queryKey).toEqual(['news', 'latest'])
    expect(queries.tags.byId('123').queryKey).toEqual(['tags', 'byId', '123'])
    expect(queries.news.bySlug('hello').queryKey).toEqual(['news', 'bySlug', 'hello'])
  })

  // US2 Scenario 3: Keys include scope prefix
  it('preserves scope prefix in all keys', () => {
    const queries = mergeQueryOptions(tags, news)

    expect(queries.tags.queryKey).toEqual(['tags'])
    expect(queries.news.queryKey).toEqual(['news'])
  })

  // Type-level: merged type has each scope as distinct property
  it('type: merged object has distinct scope properties', () => {
    const queries = mergeQueryOptions(tags, news)

    expectTypeOf(queries).toHaveProperty('tags')
    expectTypeOf(queries).toHaveProperty('news')
    const _tagsKey: readonly ['tags', 'all'] = queries.tags.all.queryKey
    const _newsKey: readonly ['news', 'latest'] = queries.news.latest.queryKey
  })

  // Type-level: duplicate scopes produce error
  it('type: duplicate scope names produce compile error', () => {
    // @ts-expect-error - duplicate scope names should error
    mergeQueryOptions(tags, tags)
  })

  // Merge three or more trees
  it('merges three or more trees', () => {
    const users = createQueryOptions('users', {
      me: {
        queryFn: () => Promise.resolve({ name: 'test' }),
      },
    })

    const queries = mergeQueryOptions(tags, news, users)

    expect(queries.tags.queryKey).toEqual(['tags'])
    expect(queries.news.queryKey).toEqual(['news'])
    expect(queries.users.queryKey).toEqual(['users'])
    expectTypeOf(queries).toHaveProperty('tags')
    expectTypeOf(queries).toHaveProperty('news')
    expectTypeOf(queries).toHaveProperty('users')
  })
})
