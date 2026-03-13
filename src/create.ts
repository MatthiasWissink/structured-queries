import type { DataTag, DefaultError } from '@tanstack/query-core'
import type { BuildTree, NodeDefinition, ValidateDefinition } from './types.js'

/** Resolve a node's options by attaching queryKey (and queryFn when present). */
function resolveNodeOptions(
  queryKey: readonly unknown[],
  queryFn: unknown,
  rest: Record<string, unknown>,
): Record<string, unknown> {
  rest.queryKey = queryKey
  // skipToken is a symbol (truthy), so this guard correctly passes it through.
  // Do NOT change to `typeof queryFn === 'function'` — that would break skipToken support.
  if (queryFn) {
    rest.queryFn = queryFn
  }
  return rest
}

/** Attach recursively-built children under an enumerable $sub property. */
function attachChildren(
  resolved: Record<string, unknown>,
  parentKey: readonly unknown[],
  subQueries: unknown,
): void {
  if (subQueries && typeof subQueries === 'object') {
    const sub: Record<string, unknown> = {}
    for (const [childName, childDef] of Object.entries(
      subQueries as Record<string, NodeDefinition>,
    )) {
      sub[childName] = buildNode(parentKey, childName, childDef)
    }
    resolved.$sub = sub
  }
}

/**
 * Build a resolved query node from a single definition entry.
 * Handles static leaves, scope nodes (with children), and dynamic nodes (functions).
 */
function buildNode(
  parentKey: readonly unknown[],
  name: string,
  definition: NodeDefinition,
): unknown {
  const nodeKey = [...parentKey, name] as readonly unknown[]

  // Dynamic (parameterised) node: definition is a function
  if (typeof definition === 'function') {
    const caller = (...args: unknown[]) => {
      const result = (definition as unknown as (...args: unknown[]) => Record<string, unknown>)(
        ...args,
      )
      if (!('params' in result)) {
        throw new TypeError(
          `[structured-queries] Dynamic node must return an object with a 'params' property`,
        )
      }
      const { params: paramSegments, subQueries, queryFn, ...rest } = result
      const fullKey = [...nodeKey, ...(paramSegments as unknown[])] as readonly unknown[]

      const resolved = resolveNodeOptions(fullKey, queryFn, rest)

      attachChildren(resolved, fullKey, subQueries)

      return resolved
    }

    // Attach partial queryKey for invalidation when uncalled
    caller.queryKey = nodeKey

    return caller
  }

  // Static node (leaf or scope)
  const { subQueries, queryFn, ...rest } = definition as unknown as Record<string, unknown>
  const resolved = resolveNodeOptions(nodeKey, queryFn, rest)

  attachChildren(resolved, nodeKey, subQueries)

  return resolved
}

/**
 * Creates a structured query tree for a single domain scope.
 *
 * Each node in the tree exposes a `queryKey` readonly tuple and an optional
 * `queryFn`. The output is structurally compatible with TanStack Query v5's
 * `useQuery`, `fetchQuery`, etc.
 *
 * @see {@link StructuredQuery} for the root output type
 */
export function createStructuredQuery<
  TScope extends string,
  TDefinition extends Record<string, NodeDefinition>,
>(
  scope: TScope,
  definition: TDefinition & ValidateDefinition<TDefinition>,
): {
  queryKey: DataTag<readonly [TScope], unknown, DefaultError>
} & BuildTree<readonly [TScope], TDefinition> {
  const rootKey = [scope] as unknown as DataTag<readonly [TScope], unknown, DefaultError>

  const result: Record<string, unknown> = {
    queryKey: rootKey,
  }

  for (const [name, def] of Object.entries(definition)) {
    result[name] = buildNode([scope], name, def)
  }

  return result as {
    queryKey: DataTag<readonly [TScope], unknown, DefaultError>
  } & BuildTree<readonly [TScope], TDefinition>
}
