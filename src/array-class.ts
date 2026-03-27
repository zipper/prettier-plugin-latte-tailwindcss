import type { TailwindContext } from './types'

// ─── Public types ───

export interface ArrayClassItem {
  type: 'plain' | 'keyed' | 'dynamic'
  /** Raw text of this item (trimmed, without trailing comma/whitespace) */
  raw: string
  /** CSS class name (plain/keyed only) */
  className?: string
  /** Condition after => (keyed only) */
  condition?: string
  /** Whether the class name is quoted (plain/keyed) */
  quoted?: boolean
  /** Trailing separator: comma + whitespace to the next item */
  trailingSep: string
}

// ─── Main API ───

/**
 * Sort a Latte array class attribute value.
 *
 * Input: the full attribute value including `{[` and `]}`, e.g. `{[btn, flex, $dyn]}`.
 * Returns the value with plain/keyed items sorted by Tailwind order,
 * dynamic items staying in place as barriers.
 */
export function sortArrayClassValue(
  value: string,
  sortFn: (classes: string) => string,
): string {
  // Must start with {[ and end with ]}
  if (!value.startsWith('{[') || !value.endsWith(']}')) return value

  const inner = value.slice(2, -2)
  if (!inner.trim()) return value

  const items = parseArrayClass(inner)
  if (items.length === 0) return value

  // Check if there are any static items to sort
  const hasStatic = items.some(it => it.type !== 'dynamic')
  if (!hasStatic) return value

  // Split items into groups separated by dynamic barriers.
  // Each group of static items is sorted independently.
  const result: ArrayClassItem[] = []
  const groups: { items: ArrayClassItem[] }[] = []
  let currentGroup: ArrayClassItem[] = []

  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'dynamic') {
      if (currentGroup.length > 0) {
        groups.push({ items: currentGroup })
        currentGroup = []
      }
    } else {
      currentGroup.push(items[i])
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ items: currentGroup })
  }

  // Sort each group's class names independently
  const sortedGroups: ArrayClassItem[][] = []
  for (const group of groups) {
    const groupClasses = group.items.map(it => it.className!)
    const groupSortedStr = sortFn(groupClasses.join(' '))
    const groupSorted = groupSortedStr.split(/\s+/).filter(Boolean)

    if (groupSorted.length !== group.items.length) {
      // Fallback: don't sort this group
      sortedGroups.push(group.items)
      continue
    }

    // Build sorted order for this group
    const groupClassToIdx = new Map<string, number[]>()
    for (let i = 0; i < groupSorted.length; i++) {
      const cls = groupSorted[i]
      if (!groupClassToIdx.has(cls)) groupClassToIdx.set(cls, [])
      groupClassToIdx.get(cls)!.push(i)
    }

    const groupOrder: { item: ArrayClassItem; sortIdx: number }[] = []
    const groupConsumed = new Map<string, number>()
    for (const item of group.items) {
      const cls = item.className!
      const indices = groupClassToIdx.get(cls)
      const offset = groupConsumed.get(cls) ?? 0
      const sortIdx = indices ? indices[offset] ?? indices.length : Infinity
      groupConsumed.set(cls, offset + 1)
      groupOrder.push({ item, sortIdx })
    }
    groupOrder.sort((a, b) => a.sortIdx - b.sortIdx)
    sortedGroups.push(groupOrder.map(o => o.item))
  }

  // Reassemble: interleave sorted groups with dynamic items in original positions
  // Walk original items: for each dynamic, emit it; for each static run, emit sorted group
  let groupIdx = 0
  let inStaticRun = false

  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'dynamic') {
      if (inStaticRun) {
        groupIdx++
        inStaticRun = false
      }
      result.push(items[i])
    } else {
      if (!inStaticRun) {
        // Emit entire sorted group
        const sorted = sortedGroups[groupIdx] ?? []
        result.push(...sorted)
        inStaticRun = true
      }
      // Skip — already emitted with the group
    }
  }
  // Final group if items end with statics
  if (inStaticRun) {
    // Already pushed
  } else if (groupIdx < sortedGroups.length) {
    result.push(...sortedGroups[groupIdx])
  }

  // Fix trailing separators: preserve original separator pattern but assign to new positions
  // Save original separators from items array
  const originalSeps = items.map(it => it.trailingSep)

  // Reassign separators: positional (separator i goes to result position i)
  for (let i = 0; i < result.length; i++) {
    result[i] = { ...result[i], trailingSep: originalSeps[i] ?? '' }
  }
  // Last item should have no separator
  if (result.length > 0) {
    result[result.length - 1] = { ...result[result.length - 1], trailingSep: '' }
  }

  return '{[' + serializeArrayClass(result) + ']}'
}

// ─── Parsing ───

/**
 * Parse the inner content of a Latte array class (between `[` and `]`).
 * Returns parsed items with type classification.
 */
export function parseArrayClass(inner: string): ArrayClassItem[] {
  if (!inner.trim()) return []

  const items: ArrayClassItem[] = []
  const rawItems = splitTopLevel(inner)

  for (const { content, trailingSep } of rawItems) {
    const trimmed = content.trim()
    if (!trimmed) continue
    items.push(classifyItem(trimmed, trailingSep))
  }

  return items
}

/**
 * Split by top-level commas, preserving trailing separators (comma + whitespace).
 */
function splitTopLevel(input: string): { content: string; trailingSep: string }[] {
  const result: { content: string; trailingSep: string }[] = []
  let current = ''
  let depth = 0
  let inString: string | false = false

  for (let i = 0; i <= input.length; i++) {
    if (i === input.length) {
      const trimmed = current.trim()
      if (trimmed) result.push({ content: current, trailingSep: '' })
      break
    }

    const ch = input[i]

    // String handling (single and double quotes)
    if (inString) {
      current += ch
      if (ch === inString && (i === 0 || input[i - 1] !== '\\')) inString = false
      continue
    }

    if (ch === "'" || ch === '"') {
      inString = ch
      current += ch
      continue
    }

    if (ch === '(' || ch === '[') { depth++; current += ch; continue }
    if ((ch === ')' || ch === ']') && depth > 0) { depth--; current += ch; continue }

    if (ch === ',' && depth === 0) {
      // Capture trailing separator: comma + whitespace
      let sep = ','
      let j = i + 1
      while (j < input.length && /\s/.test(input[j])) {
        sep += input[j]
        j++
      }
      result.push({ content: current, trailingSep: sep })
      current = ''
      i = j - 1
      continue
    }

    current += ch
  }

  return result
}

// ─── Item classification ───

/**
 * Classify a single array class item.
 *
 * Patterns:
 *   - `'className' => expr` or `className => expr` → keyed
 *   - `'className'` or `className` (bare identifier without $) → plain
 *   - `$var`, `$obj->method()`, `...spread`, function calls, expressions → dynamic
 */
function classifyItem(trimmed: string, trailingSep: string): ArrayClassItem {
  // Check for top-level `=>` (fat arrow) — keyed pair
  const arrowPos = findTopLevelFatArrow(trimmed)
  if (arrowPos !== -1) {
    const key = trimmed.slice(0, arrowPos).trim()
    const condition = trimmed.slice(arrowPos + 2).trim()
    const className = extractClassName(key)

    if (className !== null) {
      const quoted = key.startsWith("'") || key.startsWith('"')
      return {
        type: 'keyed',
        raw: trimmed,
        className,
        condition,
        quoted,
        trailingSep,
      }
    }

    // Key is dynamic expression — treat whole thing as dynamic
    return { type: 'dynamic', raw: trimmed, trailingSep }
  }

  // Spread operator
  if (trimmed.startsWith('...')) {
    return { type: 'dynamic', raw: trimmed, trailingSep }
  }

  // Dynamic: starts with $, or contains ( (function call), or contains -> or ::
  if (isDynamic(trimmed)) {
    return { type: 'dynamic', raw: trimmed, trailingSep }
  }

  // Plain: quoted string or bare identifier
  const className = extractClassName(trimmed)
  if (className !== null && className !== '') {
    const quoted = trimmed.startsWith("'") || trimmed.startsWith('"')
    return {
      type: 'plain',
      raw: trimmed,
      className,
      quoted,
      trailingSep,
    }
  }

  // Fallback: dynamic
  return { type: 'dynamic', raw: trimmed, trailingSep }
}

/**
 * Extract a CSS class name from a key or plain value.
 * Returns null if the value is not a simple class name.
 */
function extractClassName(value: string): string | null {
  // Quoted string: 'btn' or "btn"
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    if (value.length < 2) return null
    return value.slice(1, -1)
  }

  // Bare identifier: must not start with $ and must look like a CSS class
  // CSS class names: letters, digits, hyphens, underscores, colons (TW modifiers), slashes, dots, brackets
  if (/^[a-zA-Z_\-][a-zA-Z0-9_\-:/.[\]!@#%]*$/.test(value)) {
    return value
  }

  return null
}

/**
 * Check if a value is a dynamic expression (not a static class name).
 */
function isDynamic(value: string): boolean {
  // Variable
  if (value.startsWith('$')) return true
  // Function call or method
  if (value.includes('(')) return true
  // Property access or null-safe
  if (value.includes('->')) return true
  // Static method/property
  if (value.includes('::')) return true
  // Numeric literal
  if (/^\d/.test(value)) return true
  // Ternary
  if (value.includes('?')) return true
  // Concatenation
  if (value.includes('.') && !isCssClassName(value)) return true

  return false
}

/**
 * Check if a value looks like a CSS class name (may contain dots for TW).
 * Bare identifiers like `btn`, `flex`, `sm:text-lg`, `w-1/2`, `bg-red-500/50`.
 */
function isCssClassName(value: string): boolean {
  return /^[a-zA-Z_\-][a-zA-Z0-9_\-:/.[\]!@#%]*$/.test(value)
}

/**
 * Find the position of a top-level `=>` fat arrow operator.
 * Skips `=>` inside strings, parentheses, brackets.
 * Returns the index of `=` in `=>`, or -1 if not found.
 */
function findTopLevelFatArrow(s: string): number {
  let depth = 0
  let inString: string | false = false

  for (let i = 0; i < s.length - 1; i++) {
    const ch = s[i]

    if (inString) {
      if (ch === inString && s[i - 1] !== '\\') inString = false
      continue
    }

    if (ch === "'" || ch === '"') { inString = ch; continue }
    if (ch === '(' || ch === '[') { depth++; continue }
    if ((ch === ')' || ch === ']') && depth > 0) { depth--; continue }

    if (ch === '=' && s[i + 1] === '>' && depth === 0) {
      // Make sure it's not inside ==>, i.e. preceded by = or >
      // Actually `=>` is unambiguous in Latte array context
      return i
    }
  }

  return -1
}

// ─── Serialization ───

/**
 * Serialize parsed items back to string (inner content, without {[ and ]}).
 */
export function serializeArrayClass(items: ArrayClassItem[]): string {
  let result = ''

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (item.type === 'keyed') {
      const key = item.quoted ? `'${item.className}'` : item.className
      result += `${key} => ${item.condition}`
    } else if (item.type === 'plain') {
      result += item.quoted ? `'${item.className}'` : item.className
    } else {
      // dynamic — preserve raw
      result += item.raw
    }

    if (i < items.length - 1) {
      result += item.trailingSep || ', '
    }
  }

  return result
}
