import { sortNClassValue } from './nclass'
import { restorePlaceholders } from './preprocess'
import { sortClasses } from './sorting'
import type { PlaceholderMap, TransformerEnv } from './types'

// Loose types for the Prettier HTML AST — exact shapes are not exported by prettier/plugins/html
interface AstNode {
  type?: string
  name?: string
  value?: string
  attrs?: AttrNode[]
  children?: AstNode[]
  [key: string]: unknown
}

interface AttrNode {
  name: string
  value?: string
  [key: string]: unknown
}

/**
 * Walk the HTML AST and:
 *   1. Sort class attribute values using Tailwind order
 *   2. Restore Latte placeholders in all attribute values and text nodes
 *
 * class={[...]} sorting is handled in Phase 7 (array-class.ts).
 */
export function transformAst(
  ast: unknown,
  env: TransformerEnv,
  map: PlaceholderMap,
): void {
  visitNode(ast as AstNode, env, map)
}

function visitNode(node: AstNode, env: TransformerEnv, map: PlaceholderMap): void {
  if (!node || typeof node !== 'object') return

  // Text nodes — restore placeholders in text content
  if (node.type === 'text' && typeof node.value === 'string') {
    node.value = restorePlaceholders(node.value, map)
    return
  }

  // Attribute nodes — handled via element.attrs below
  if (node.type === 'attribute') return

  // Process element attributes
  if (Array.isArray(node.attrs)) {
    for (const attr of node.attrs) {
      processAttr(attr, env, map)
    }
  }

  // Recurse into children
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visitNode(child, env, map)
    }
  }
}

function processAttr(attr: AttrNode, env: TransformerEnv, map: PlaceholderMap): void {
  if (typeof attr.value !== 'string') return

  const name = attr.name
  const value = attr.value

  if (name === 'class') {
    // Array class syntax class={[...]} — preserve as-is, sorted in Phase 7
    if (value.startsWith('{[')) {
      attr.value = restorePlaceholders(value, map)
      return
    }

    // Regular class="..." — sort, then restore placeholders
    // Placeholders are treated as unknown classes (null bigint → first)
    const sorted = sortClasses(value, env.context, {
      removeDuplicates: !env.options.tailwindPreserveDuplicates,
      preserveWhitespace: env.options.tailwindPreserveWhitespace,
    })
    attr.value = restorePlaceholders(sorted, map)
    return
  }

  if (name === 'n:class') {
    const sorted = sortNClassValue(value, env.context, env.options)
    attr.value = restorePlaceholders(sorted, map)
    return
  }

  // Additional attributes from tailwindAttributes option
  const extraAttrs: string[] = env.options.tailwindAttributes ?? []
  if (extraAttrs.includes(name)) {
    const sorted = sortClasses(value, env.context, {
      removeDuplicates: !env.options.tailwindPreserveDuplicates,
      preserveWhitespace: env.options.tailwindPreserveWhitespace,
    })
    attr.value = restorePlaceholders(sorted, map)
    return
  }

  // All other attributes — restore placeholders only
  attr.value = restorePlaceholders(value, map)
}
