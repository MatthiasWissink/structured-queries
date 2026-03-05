import type {
  DataTag,
  DefaultError,
  QueryFunction,
  QueryKey,
  QueryObserverOptions,
  QueryOptions,
} from '@tanstack/query-core'

// ---------------------------------------------------------------------------
// Input: Node Definitions (what users provide to createQueryOptions)
// ---------------------------------------------------------------------------

/**
 * Simplified observer options with scalar types instead of generic function overloads.
 * Keys are validated against QueryObserverOptions at compile time via _AssertObserverKeys.
 */
type SimplifiedObserverOptions = {
  staleTime?: number
  enabled?: boolean
  refetchInterval?: number | false
  refetchIntervalInBackground?: boolean
  refetchOnWindowFocus?: boolean | 'always'
  refetchOnReconnect?: boolean | 'always'
  refetchOnMount?: boolean | 'always'
  retryOnMount?: boolean
}

/** Compile-time assertion: every key in SimplifiedObserverOptions must exist on QueryObserverOptions */
type _AssertObserverKeys = Pick<QueryObserverOptions, keyof SimplifiedObserverOptions>

/**
 * Query options from TanStack Query that can be attached to any node.
 * Base options from QueryOptions (retry, gcTime, etc.) plus commonly-used
 * observer options with simplified types (avoiding generic function overloads).
 */
export type QueryNodeOptions = Omit<
  QueryOptions,
  'queryKey' | 'queryFn' | 'queryHash' | 'queryKeyHashFn' | '_defaulted' | 'behavior' | 'persister'
> &
  SimplifiedObserverOptions

/** Leaf node: has queryFn, no children */
export type LeafDefinition<TData = unknown> = {
  queryFn: QueryFunction<TData>
} & QueryNodeOptions

/** Scope node: optional queryFn, has sub-queries */
export type ScopeDefinition<
  TData = unknown,
  TChildren extends Record<string, NodeDefinition> = Record<string, NodeDefinition>,
> = {
  queryFn?: QueryFunction<TData>
  subQueries: TChildren
} & QueryNodeOptions

/** Dynamic (parameterised) node: a function returning a leaf/scope definition */
export type DynamicDefinition<
  TParam = unknown,
  TKey extends readonly [unknown, ...unknown[]] = readonly [unknown, ...unknown[]],
  TData = unknown,
  TChildren extends Record<string, NodeDefinition> = Record<string, NodeDefinition>,
> = (param: TParam) => {
  queryKey: TKey
  queryFn?: QueryFunction<TData>
  subQueries?: TChildren
} & QueryNodeOptions

/** Recursive children record (interface to allow self-referencing NodeDefinition) */
interface NodeDefinitionRecord {
  [key: string]: NodeDefinition
}

/** Discriminated union of all node definition shapes */
export type NodeDefinition =
  | LeafDefinition<any>
  | ScopeDefinition<any, any>
  | DynamicDefinition<any, readonly [unknown, ...unknown[]], any, NodeDefinitionRecord>

// ---------------------------------------------------------------------------
// Sub-query namespace: $sub groups child queries for discoverability
// ---------------------------------------------------------------------------

/** Wraps children in a `$sub` namespace for go-to-definition support */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SubQueryNamespace<T> = keyof T extends never ? {} : { $sub: T }

// ---------------------------------------------------------------------------
// Output: Resolved Query Nodes (what createQueryOptions produces)
// ---------------------------------------------------------------------------

/** A static (non-parameterised) query node in the output tree */
export type StaticQueryNode<
  TKey extends readonly unknown[],
  TData,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TChildren extends Record<string, unknown> = {},
> = {
  queryKey: DataTag<TKey, TData, DefaultError>
  queryFn?: QueryFunction<TData, TKey & QueryKey>
} & QueryNodeOptions &
  TChildren

/**
 * A dynamic (parameterised) query node in the output tree.
 * Callable with a parameter; also exposes .queryKey for partial-key invalidation.
 */
export type DynamicQueryNode<TKey extends readonly unknown[], TParam, TResolved> = ((
  param: TParam,
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

/** Extract data type from a node definition or dynamic node's return value */
type ExtractData<T> = T extends { queryFn: QueryFunction<infer D> }
  ? D
  : T extends { queryFn?: QueryFunction<infer D> }
    ? D
    : unknown

/**
 * Recursively build the output tree from a definition record.
 * Each key in the definition becomes either a StaticQueryNode or DynamicQueryNode.
 */
export type BuildTree<
  TParentKey extends readonly unknown[],
  TDef extends Record<string, unknown>,
> = {
  [K in keyof TDef]: TDef[K] extends (param: infer P) => infer R
    ? R extends { queryKey: infer QK extends readonly unknown[] }
      ? DynamicQueryNode<
          readonly [...TParentKey, K],
          P,
          StaticQueryNode<
            readonly [...TParentKey, K, ...QK],
            ExtractData<R>,
            SubQueryNamespace<BuildTree<readonly [...TParentKey, K, ...QK], ExtractSubQueries<R>>>
          >
        >
      : never
    : TDef[K] extends { subQueries: infer C extends Record<string, unknown> }
      ? StaticQueryNode<
          readonly [...TParentKey, K],
          ExtractData<TDef[K]>,
          SubQueryNamespace<BuildTree<readonly [...TParentKey, K], C>>
        >
      : StaticQueryNode<readonly [...TParentKey, K], ExtractData<TDef[K]>>
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
            : T[P] extends (param: infer _TParam) => infer R
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
