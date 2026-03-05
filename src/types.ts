import type {
  DataTag,
  DefaultError,
  GetNextPageParamFunction,
  GetPreviousPageParamFunction,
  InfiniteData,
  QueryFunction,
  QueryKey,
} from '@tanstack/query-core'
import type { UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Input: Node Definitions (what users provide to createQueryOptions)
// ---------------------------------------------------------------------------

/**
 * Query options that can be attached to any node definition.
 * Derived from TanStack Query's UseQueryOptions, omitting only queryKey
 * (which is managed by the structured query tree). Includes queryFn as optional.
 */
export type QueryNodeOptions = Omit<UseQueryOptions, 'queryKey'>

/** Leaf node: has queryFn (required), no children */
export type LeafDefinition<TData = unknown> = {
  queryFn: QueryFunction<TData>
} & Omit<QueryNodeOptions, 'queryFn'>

/** Infinite query leaf node: has queryFn, initialPageParam, getNextPageParam */
export type InfiniteLeafDefinition<TData = unknown, TPageParam = unknown> = {
  queryFn: QueryFunction<TData, QueryKey, TPageParam>
  initialPageParam: TPageParam
  getNextPageParam: GetNextPageParamFunction<TPageParam, TData>
  getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, TData>
  maxPages?: number
} & Omit<QueryNodeOptions, 'queryFn'>

/** Scope node: optional queryFn, has sub-queries */
export type ScopeDefinition<
  TChildren extends Record<string, NodeDefinition> = Record<string, NodeDefinition>,
> = {
  subQueries: TChildren
} & QueryNodeOptions

/** Dynamic (parameterised) node: a function returning a leaf/scope definition */
export type DynamicDefinition<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TArgs extends any[] = any[],
  TKey extends readonly [unknown, ...unknown[]] = readonly [unknown, ...unknown[]],
  TChildren extends Record<string, NodeDefinition> = Record<string, NodeDefinition>,
> = (...args: TArgs) => {
  queryKey: TKey
  subQueries?: TChildren
} & Omit<QueryNodeOptions, 'queryFn'> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn?: QueryFunction<any, any, any>
  }

/** Recursive children record (interface to allow self-referencing NodeDefinition) */
interface NodeDefinitionRecord {
  [key: string]: NodeDefinition
}

/** Discriminated union of all node definition shapes */
export type NodeDefinition =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | LeafDefinition<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | InfiniteLeafDefinition<any, any>
  | ScopeDefinition<NodeDefinitionRecord>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | DynamicDefinition<any[], readonly [unknown, ...unknown[]], NodeDefinitionRecord>

// ---------------------------------------------------------------------------
// Sub-query namespace: $sub groups child queries for discoverability
// ---------------------------------------------------------------------------

/** Wraps children in a `$sub` namespace for go-to-definition support */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SubQueryNamespace<T> = keyof T extends never ? {} : { $sub: T }

// ---------------------------------------------------------------------------
// Output: Resolved Query Nodes (what createQueryOptions produces)
// ---------------------------------------------------------------------------

/**
 * A dynamic (parameterised) query node in the output tree.
 * Callable with parameters; also exposes .queryKey for partial-key invalidation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DynamicQueryNode<TKey extends readonly unknown[], TArgs extends any[], TResolved> = ((
  ...args: TArgs
) => TResolved) & {
  queryKey: DataTag<TKey, unknown, DefaultError>
}

// ---------------------------------------------------------------------------
// Tree Building: Recursive mapped types
// ---------------------------------------------------------------------------

/** Extract the sub-queries record from a dynamic node's return type */
type ExtractSubQueries<T> = T extends { subQueries: infer C extends Record<string, unknown> }
  ? C
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {}

/** Extract the raw queryFn type from a node definition */
type ExtractQueryFn<T> = T extends { queryFn: infer F }
  ? F
  : T extends { queryFn?: infer F }
    ? F
    : never

/** Extract data type from a node definition, handling infinite query pageParam */
type ExtractData<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Exclude<ExtractQueryFn<T>, undefined> extends QueryFunction<infer D, any, any> ? D : unknown

/** Check if a definition is an infinite query (has initialPageParam) */
type IsInfiniteDefinition<T> = T extends { initialPageParam: unknown } ? true : false

/** Extract the page param type from an infinite query definition */
type ExtractPageParam<T> = T extends { initialPageParam: infer P } ? P : never

/** Resolve a static node to either UseInfiniteQueryOptions or UseQueryOptions, excluding SkipToken from queryFn */
type ResolveStaticNode<TDef, TKey extends readonly unknown[]> =
  IsInfiniteDefinition<TDef> extends true
    ? Omit<
        UseInfiniteQueryOptions<
          ExtractData<TDef>,
          DefaultError,
          InfiniteData<ExtractData<TDef>, ExtractPageParam<TDef>>,
          TKey & QueryKey,
          ExtractPageParam<TDef>
        >,
        'queryFn'
      > & {
        queryFn: QueryFunction<ExtractData<TDef>, TKey & QueryKey, ExtractPageParam<TDef>>
        queryKey: DataTag<
          TKey,
          InfiniteData<ExtractData<TDef>, ExtractPageParam<TDef>>,
          DefaultError
        >
      } & SubQueryNamespace<BuildTree<TKey, ExtractSubQueries<TDef>>>
    : Omit<
        UseQueryOptions<ExtractData<TDef>, DefaultError, ExtractData<TDef>, TKey & QueryKey>,
        'queryFn'
      > & {
        queryFn: QueryFunction<ExtractData<TDef>, TKey & QueryKey>
        queryKey: DataTag<TKey, ExtractData<TDef>, DefaultError>
      } & SubQueryNamespace<BuildTree<TKey, ExtractSubQueries<TDef>>>

/**
 * Recursively build the output tree from a definition record.
 * Each key in the definition becomes either a UseQueryOptions node,
 * UseInfiniteQueryOptions node, or DynamicQueryNode.
 */
export type BuildTree<
  TParentKey extends readonly unknown[],
  TDef extends Record<string, unknown>,
> = {
  [K in keyof TDef]: TDef[K] extends (...args: infer A extends unknown[]) => infer R
    ? R extends { queryKey: infer QK extends readonly unknown[] }
      ? DynamicQueryNode<
          readonly [...TParentKey, K],
          A,
          ResolveStaticNode<R, readonly [...TParentKey, K, ...QK]>
        >
      : never
    : ResolveStaticNode<TDef[K], readonly [...TParentKey, K]>
}

// ---------------------------------------------------------------------------
// Root: StructuredQuery
// ---------------------------------------------------------------------------

/** The root output of createQueryOptions(scope, definition) */
export type StructuredQuery<TScope extends string, TTree extends Record<string, unknown>> = {
  queryKey: DataTag<readonly [TScope], unknown, DefaultError>
  _scope: TScope
} & TTree

// ---------------------------------------------------------------------------
// Merge: MergedQuery + EnsureUniqueScopes
// ---------------------------------------------------------------------------

/** Extract scope string from a StructuredQuery */
type ExtractScope<T> = T extends StructuredQuery<infer S, Record<string, unknown>> ? S : never

/** Check for duplicate scope names at compile time */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HasDuplicates<T extends readonly StructuredQuery<string, any>[]> = T extends readonly [
  infer First,
  ...infer Rest extends readonly StructuredQuery<string, Record<string, unknown>>[],
]
  ? ExtractScope<First> extends ExtractScope<Rest[number]>
    ? true
    : HasDuplicates<Rest>
  : false

/**
 * Compile-time constraint that rejects duplicate scope names.
 * If duplicates are found, the type resolves to `never[]`, causing a type error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EnsureUniqueScopes<T extends readonly StructuredQuery<string, any>[]> =
  HasDuplicates<T> extends true ? never[] : T

/** The result of mergeQueryOptions(...queries) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MergedQuery<TQueries extends readonly StructuredQuery<string, any>[]> = {
  [Q in TQueries[number] as ExtractScope<Q>]: Q
}

// ---------------------------------------------------------------------------
// Type Helper: inferQueryKeys
// ---------------------------------------------------------------------------

/** Extract the base tuple from a DataTag-branded key by reconstructing the tuple */
type StripDataTag<T> = T extends readonly [...infer Items] ? readonly [...Items] : never

/** Recursively collect all possible query key tuples from a node */
type CollectKeys<T> = T extends { queryKey: infer K }
  ?
      | StripDataTag<K>
      | {
          [P in keyof T & string]: T[P] extends { queryKey: unknown }
            ? CollectKeys<T[P]>
            : T[P] extends (...args: infer _TArgs) => infer R
              ? StripDataTag<(T[P] & { queryKey: unknown })['queryKey']> | CollectKeys<R>
              : never
        }[keyof T & string]
      | (T extends { $sub: infer S } ? CollectKeys<S[keyof S]> : never)
  : T extends object
    ? { [P in keyof T]: CollectKeys<T[P]> }[keyof T]
    : never

/**
 * Extracts the union of all possible query key tuples from a StructuredQuery or MergedQuery.
 *
 * @example
 * ```typescript
 * type TagKeys = inferQueryKeys<typeof tags>
 * // readonly ["tags"]
 * // | readonly ["tags", "all"]
 * // | readonly ["tags", "byId"]
 * // | readonly ["tags", "byId", string]
 * // ...
 * ```
 */
export type inferQueryKeys<T> = CollectKeys<T>
