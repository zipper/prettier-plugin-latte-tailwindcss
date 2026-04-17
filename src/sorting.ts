import { applyBuckets } from './class-order'
import { UNSPECIFIED_IGNORE, getClassSortInfo } from './property-order'
import type { TailwindContext } from './types'

export interface SortOptions {
  removeDuplicates?: boolean
  preserveWhitespace?: boolean
}

/**
 * Entry describing a single class with all data needed for comparison.
 * Callers must ensure `twBigint` is non-null — the comparator does not
 * handle the unknown-class case (null bigint). `variantKey` and `propIndex`
 * are only consulted when `context.propertyOrder` is set; otherwise pass
 * any value (e.g. 0).
 */
export interface TailwindEntry {
  name: string
  twBigint: bigint | null
  variantKey: number
  propIndex: number
}

/**
 * Compare two classes with known (non-null) Tailwind bigints.
 * Ordering: variant > property (when propertyOrder is active) > TW bigint.
 *
 * Callers must guarantee that both `a.twBigint` and `b.twBigint` are non-null;
 * unknown-class handling (null bigint) is the caller's responsibility.
 *
 * Placeholder handling (`name === '...'` / `'…'`) is kept for safety with
 * existing snapshots, but in practice those names never reach this comparator
 * in Latte templates.
 */
export function compareTailwindEntries(a: TailwindEntry, b: TailwindEntry, context: TailwindContext): number {
  // Dynamic placeholders always last (kept for snapshot compatibility)
  if (a.name === '...' || a.name === '…') return 1
  if (b.name === '...' || b.name === '…') return -1

  if (context.propertyOrder) {
    // 1. Variant key
    if (a.variantKey !== b.variantKey) return a.variantKey - b.variantKey
    // 2. Property index
    if (a.propIndex !== b.propIndex) {
      // 'ignore' mode: use TW bigint for unspecified props
      if (a.propIndex === UNSPECIFIED_IGNORE && b.propIndex === UNSPECIFIED_IGNORE) {
        return a.twBigint! < b.twBigint! ? -1 : a.twBigint! > b.twBigint! ? 1 : 0
      }
      if (a.propIndex === UNSPECIFIED_IGNORE) return 1
      if (b.propIndex === UNSPECIFIED_IGNORE) return -1
      return a.propIndex - b.propIndex
    }
  }

  // 3. TW bigint tiebreaker (also the only ordering when propertyOrder is off)
  if (a.twBigint === b.twBigint) return 0
  return a.twBigint! < b.twBigint! ? -1 : 1
}

/**
 * Sort a whitespace-separated class string using Tailwind order.
 * Returns the string unchanged if context is null or the string contains Latte expressions.
 */
export function sortClasses(classStr: string, context: TailwindContext | null, opts: SortOptions = {}): string {
  if (!context) return classStr
  if (typeof classStr !== 'string' || classStr === '') return classStr

  // Skip strings that still contain unprocessed Latte expressions
  if (classStr.includes('{')) return classStr

  const { removeDuplicates = true, preserveWhitespace = false } = opts

  // When preserveWhitespace is set, treat newlines as barriers — sort each line independently
  if (preserveWhitespace && classStr.includes('\n')) {
    const segments = classStr.split(/(\r?\n[ \t]*)/)
    return segments
      .map((segment, i) => {
        if (i % 2 === 1) return segment // newline separator, keep as-is
        return sortClasses(segment, context, opts)
      })
      .join('')
  }

  // Whitespace-only string → normalize to single space
  if (!preserveWhitespace && /^[\t\r\f\n ]+$/.test(classStr)) return ' '

  // Split into alternating [class, separator, class, separator, ...] tokens
  const parts = classStr.split(/([\t\r\f\n ]+)/)
  const classes = parts.filter((_, i) => i % 2 === 0)
  let whitespace = parts.filter((_, i) => i % 2 !== 0)

  // Remove empty tokens from leading/trailing whitespace
  if (classes[classes.length - 1] === '') {
    classes.pop()
    if (!preserveWhitespace) whitespace.pop()
  }
  if (!preserveWhitespace && classes[0] === '') {
    classes.shift()
    whitespace.shift()
  }

  // Collapse whitespace separators unless preserveWhitespace is set
  if (!preserveWhitespace) {
    whitespace = whitespace.map(() => ' ')
  }

  const { classList, removedIndices } = sortClassList(classes, context, removeDuplicates)

  // Remove separators that correspond to removed duplicate classes
  whitespace = whitespace.filter((_, index) => !removedIndices.has(index + 1))

  let result = ''
  for (let i = 0; i < classList.length; i++) {
    result += `${classList[i]}${whitespace[i] ?? ''}`
  }

  return result
}

/**
 * Sort an array of class names using configurable bucket ordering.
 *
 * Single code-path: `context.classOrder` is always present (default = unknown → tailwind
 * with unspecified: 'top', which matches the previous fixed "unknown FIRST → tailwind ASC"
 * behavior). The `tailwind` bucket is the only one that applies the comparator
 * (variant > property > TW bigint); `unknown` and `pattern` buckets preserve input order.
 *
 * Deduplication (first-occurrence-wins) is applied AFTER bucketing.
 */
export function sortClassList(
  classList: string[],
  context: TailwindContext,
  removeDuplicates = true
): { classList: string[]; removedIndices: Set<number> } {
  const orderedClasses = context.getClassOrder(classList)

  // Precompute property-order sort info for each entry (only used inside the tailwind bucket).
  const propCtx = context.propertyOrder
  const entries: TailwindEntry[] = orderedClasses.map(([name, twBigint]) => ({
    name,
    twBigint,
    ...(propCtx ? getClassSortInfo(name, propCtx) : { variantKey: 0, propIndex: 0 })
  }))

  // Apply buckets — comparator is only invoked on entries with non-null bigint
  // (applyBuckets guarantees this for the 'tailwind' bucket).
  const bucketed = applyBuckets(
    entries,
    context.classOrder,
    (e) => e.name,
    (e) => e.twBigint,
    (a, b) => compareTailwindEntries(a, b, context)
  )

  let result: [string, bigint | null][] = bucketed.map((e) => [e.name, e.twBigint] as [string, bigint | null])

  const removedIndices = new Set<number>()

  if (removeDuplicates) {
    const seenClasses = new Set<string>()
    result = result.filter(([cls, order], index) => {
      if (seenClasses.has(cls)) {
        removedIndices.add(index)
        return false
      }
      if (order !== null) seenClasses.add(cls)
      return true
    })
  }

  return {
    classList: result.map(([cls]) => cls),
    removedIndices
  }
}
