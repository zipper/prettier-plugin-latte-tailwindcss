import { sortArrayClassValue } from './array-class'
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
 *   2. Sort array class={[...]} items by Tailwind order
 *   3. Restore Latte placeholders in all attribute values and text nodes
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
    // Array class syntax class={[...]} — sort items by Tailwind order
    if (value.startsWith('{[')) {
      const restored = restorePlaceholders(value, map)
      if (env.context) {
        // Array class items must never be deduplicated: duplicate class names
      // with different conditions are valid, e.g. {['flex' => $a, 'flex' => $b]}
      const sortFn = (classes: string) =>
          sortClasses(classes, env.context, {
            removeDuplicates: false,
            preserveWhitespace: false,
          })
        attr.value = sortArrayClassValue(restored, sortFn)
      } else {
        attr.value = restored
      }
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

  // Note: array syntax in n:class (e.g. n:class="{['active' => $x]}") is not supported.
  // Latte v3 likely does not allow array syntax in n:class attributes.
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
