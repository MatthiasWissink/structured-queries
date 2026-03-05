import type { EnsureUniqueScopes, MergedQuery, StructuredQuery } from './types.js'

/**
 * Merges multiple structured query trees into a single namespace object.
 * Each tree is accessible by its scope name. Duplicate scope names
 * produce a compile-time error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeQueryOptions<TQueries extends readonly StructuredQuery<string, any>[]>(
  ...queries: EnsureUniqueScopes<TQueries>
): MergedQuery<TQueries> {
  const result: Record<string, unknown> = {}

  for (const query of queries as unknown as Array<{ _scope: string }>) {
    result[query._scope] = query
  }

  return result as MergedQuery<TQueries>
}
