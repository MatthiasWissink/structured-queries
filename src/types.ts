import type {
  DataTag,
  DefaultError,
  GetNextPageParamFunction,
  GetPreviousPageParamFunction,
  InfiniteData,
  InfiniteQueryObserverOptions,
  QueryFunction,
  QueryKey,
  QueryObserverOptions,
  SkipToken,
} from '@tanstack/query-core'

// ---------------------------------------------------------------------------
// Input: Node Definitions (what users provide to createStructuredQuery)
// ---------------------------------------------------------------------------

/**
 * Query options that can be attached to any node definition.
 * Derived from TanStack Query's UseQueryOptions, omitting only queryKey
 * (which is managed by the structured query tree). Includes queryFn as optional.
 */
export type QueryNodeOptions = Omit<QueryObserverOptions, 'queryKey'>

/** Leaf node: has queryFn (required), no children. Accepts SkipToken for conditional queries. */
export type LeafDefinition<TData = unknown> = {
  queryFn: QueryFunction<TData> | SkipToken
} & Omit<QueryNodeOptions, 'queryFn'>

/** Infinite query leaf node: has queryFn, initialPageParam, getNextPageParam. Accepts SkipToken. */
export type InfiniteLeafDefinition<TData = unknown, TPageParam = unknown> = {
  queryFn: QueryFunction<TData, QueryKey, TPageParam> | SkipToken
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required: function params are contravariant
  TArgs extends any[] = any[],
  TKey extends readonly [unknown, ...unknown[]] = readonly [unknown, ...unknown[]],
  TChildren extends Record<string, NodeDefinition> = Record<string, NodeDefinition>,
> = (...args: TArgs) => {
  params: TKey
  subQueries?: TChildren
} & Omit<QueryNodeOptions, 'queryFn'> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any required: contravariant positions in QueryFunction
    queryFn?: QueryFunction<any, any, any> | SkipToken
  }

/** Recursive children record (interface to allow self-referencing NodeDefinition) */
interface NodeDefinitionRecord {
  [key: string]: NodeDefinition
}

/** Discriminated union of all node definition shapes */
export type NodeDefinition =
  | LeafDefinition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any required: TData/TPageParam appear in contravariant positions (getNextPageParam, pageParam)
  | InfiniteLeafDefinition<any, any>
  | ScopeDefinition<NodeDefinitionRecord>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required: function params are contravariant
  | DynamicDefinition<any[], readonly [unknown, ...unknown[]], NodeDefinitionRecord>

// ---------------------------------------------------------------------------
// Reserved Property Collision Detection
// ---------------------------------------------------------------------------

/** Reserved keys derived from QueryObserverOptions (auto-tracks upstream changes) */
type ReservedQueryKeys = keyof QueryObserverOptions

/** Branded error type for clear DX on collision */
type ReservedNameError<K extends string> =
  `Child name '${K}' collides with a reserved TanStack Query property`

/** Recursively validate a single node definition for reserved child names */
type ValidateNodeDef<T> = T extends (...args: infer A) => infer R
  ? R extends { subQueries: infer C extends Record<string, unknown> }
    ? (...args: A) => Omit<R, 'subQueries'> & {
        subQueries: {
          [K in keyof C]: K extends ReservedQueryKeys
            ? K extends string
              ? ReservedNameError<K>
              : never
            : ValidateNodeDef<C[K]>
        }
      }
    : T
  : T extends { subQueries: infer C extends Record<string, unknown> }
    ? Omit<T, 'subQueries'> & {
        subQueries: {
          [K in keyof C]: K extends ReservedQueryKeys
            ? K extends string
              ? ReservedNameError<K>
              : never
            : ValidateNodeDef<C[K]>
        }
      }
    : T

/** Recursively validate all nodes in a definition record for reserved child names */
export type ValidateDefinition<T extends Record<string, unknown>> = {
  [K in keyof T]: ValidateNodeDef<T[K]>
}

// ---------------------------------------------------------------------------
// Output: Resolved Query Nodes (what createStructuredQuery produces)
// ---------------------------------------------------------------------------

/**
 * A dynamic (parameterised) query node in the output tree.
 * Callable with parameters; also exposes .queryKey for partial-key invalidation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required: contravariant callable type parameter
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any required: pattern matching in conditional type
  Exclude<ExtractQueryFn<T>, undefined | SkipToken> extends QueryFunction<infer D, any, any>
    ? D
    : unknown

/** Check if a definition is an infinite query (has initialPageParam) */
type IsInfiniteDefinition<T> = T extends { initialPageParam: unknown } ? true : false

/** Extract the page param type from an infinite query definition */
type ExtractPageParam<T> = T extends { initialPageParam: infer P } ? P : never

/** Check if a definition's queryFn includes SkipToken */
type HasSkipToken<T> = SkipToken extends ExtractQueryFn<T> ? true : false

/** Conditionally add SkipToken to a queryFn type when the input definition includes it */
type MaybeSkipToken<TDef, TFn> = HasSkipToken<TDef> extends true ? TFn | SkipToken : TFn

/** Conditionally add $sub when children exist */
type MaybeSub<TKey extends readonly unknown[], TChildren extends Record<string, unknown>> =
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  keyof TChildren extends never ? {} : { $sub: BuildTree<TKey, TChildren> }

/**
 * A resolved standard query node. Use this type to annotate variables or
 * function parameters that accept a structured query node.
 *
 * @example
 * ```ts
 * function prefetch(node: QueryNode<readonly ["todos"], Todo[]>) { ... }
 * ```
 */
export interface QueryNode<
  TKey extends readonly unknown[],
  TData = unknown,
  TError = DefaultError,
> extends Omit<
  QueryObserverOptions<TData, TError, TData, TData, TKey & QueryKey>,
  'queryFn' | 'queryKey'
> {
  queryFn: QueryFunction<TData, TKey & QueryKey>
  queryKey: DataTag<TKey, TData, TError>
}

/**
 * A resolved infinite query node. Use this type to annotate variables or
 * function parameters that accept a structured infinite query node.
 *
 * @example
 * ```ts
 * function prefetchInfinite(node: InfiniteQueryNode<readonly ["feed"], FeedPage>) { ... }
 * ```
 */
export interface InfiniteQueryNode<
  TKey extends readonly unknown[],
  TData = unknown,
  TError = DefaultError,
  TPageParam = unknown,
> extends Omit<
  InfiniteQueryObserverOptions<
    TData,
    TError,
    InfiniteData<TData, TPageParam>,
    TKey & QueryKey,
    TPageParam
  >,
  'queryFn' | 'queryKey'
> {
  queryFn: QueryFunction<TData, TKey & QueryKey, TPageParam>
  queryKey: DataTag<TKey, InfiniteData<TData, TPageParam>, TError>
}

/** Resolve a static node to either InfiniteQueryObserverOptions or QueryObserverOptions */
type ResolveStaticNode<TDef, TKey extends readonly unknown[]> =
  IsInfiniteDefinition<TDef> extends true
    ? Omit<
        InfiniteQueryObserverOptions<
          ExtractData<TDef>,
          DefaultError,
          InfiniteData<ExtractData<TDef>, ExtractPageParam<TDef>>,
          TKey & QueryKey,
          ExtractPageParam<TDef>
        >,
        'queryFn'
      > & {
        queryFn: MaybeSkipToken<
          TDef,
          QueryFunction<ExtractData<TDef>, TKey & QueryKey, ExtractPageParam<TDef>>
        >
        queryKey: DataTag<
          TKey,
          InfiniteData<ExtractData<TDef>, ExtractPageParam<TDef>>,
          DefaultError
        >
      } & MaybeSub<TKey, ExtractSubQueries<TDef>>
    : Omit<
        QueryObserverOptions<
          ExtractData<TDef>,
          DefaultError,
          ExtractData<TDef>,
          ExtractData<TDef>,
          TKey & QueryKey
        >,
        'queryFn'
      > & {
        queryFn: MaybeSkipToken<TDef, QueryFunction<ExtractData<TDef>, TKey & QueryKey>>
        queryKey: DataTag<TKey, ExtractData<TDef>, DefaultError>
      } & MaybeSub<TKey, ExtractSubQueries<TDef>>

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
    ? R extends { params: infer QK extends readonly unknown[] }
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

/** The root output of createStructuredQuery(scope, definition) */
export type StructuredQuery<TScope extends string, TTree extends Record<string, unknown>> = {
  queryKey: DataTag<readonly [TScope], unknown, DefaultError>
} & TTree

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
              : P extends '$sub'
                ? T[P] extends Record<string, unknown>
                  ? { [Q in keyof T[P] & string]: CollectKeys<T[P][Q]> }[keyof T[P] & string]
                  : never
                : never
        }[keyof T & string]
  : T extends object
    ? { [P in keyof T]: CollectKeys<T[P]> }[keyof T]
    : never

/**
 * Extracts the union of all possible query key tuples from a StructuredQuery.
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
