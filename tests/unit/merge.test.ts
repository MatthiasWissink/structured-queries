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

  const queries = mergeQueryOptions(tags, news)

  it('merges two trees keyed by scope', () => {
    expect(queries.tags).toBe(tags)
    expect(queries.news).toBe(news)
  })

  it('nested node access through merged object', () => {
    expect(queries.tags.all.queryKey).toEqual(['tags', 'all'])
    expect(queries.news.latest.queryKey).toEqual(['news', 'latest'])
    expect(queries.tags.byId('123').queryKey).toEqual(['tags', 'byId', '123'])
    expect(queries.news.bySlug('hello').queryKey).toEqual(['news', 'bySlug', 'hello'])
  })

  it('preserves scope prefix in keys', () => {
    expect(queries.tags.queryKey).toEqual(['tags'])
    expect(queries.news.queryKey).toEqual(['news'])
  })

  it('type: distinct scope properties', () => {
    expectTypeOf(queries).toHaveProperty('tags')
    expectTypeOf(queries).toHaveProperty('news')
    const _tagsKey: readonly ['tags', 'all'] = queries.tags.all.queryKey
    const _newsKey: readonly ['news', 'latest'] = queries.news.latest.queryKey
  })

  it('type: duplicate scope names produce compile error', () => {
    // @ts-expect-error - duplicate scope names should error
    mergeQueryOptions(tags, tags)
  })

  it('merges three or more trees', () => {
    const users = createQueryOptions('users', {
      me: {
        queryFn: () => Promise.resolve({ name: 'test' }),
      },
    })

    const all = mergeQueryOptions(tags, news, users)

    expect(all.tags.queryKey).toEqual(['tags'])
    expect(all.news.queryKey).toEqual(['news'])
    expect(all.users.queryKey).toEqual(['users'])
    expectTypeOf(all).toHaveProperty('tags')
    expectTypeOf(all).toHaveProperty('news')
    expectTypeOf(all).toHaveProperty('users')
  })
})
