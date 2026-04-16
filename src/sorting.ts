import { UNSPECIFIED_IGNORE, getClassSortInfo } from './property-order'
import type { TailwindContext } from './types'

export interface SortOptions {
  removeDuplicates?: boolean
  preserveWhitespace?: boolean
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
 * Sort an array of class names using Tailwind order.
 *
 * Ordering rules (from prettier-plugin-tailwindcss/src/sorting.ts):
 *   - null bigint (unknown / non-Tailwind classes) → FIRST
 *   - '...' / '…' (dynamic value placeholders)    → LAST
 *   - all others                                  → ascending bigint order
 */
export function sortClassList(
  classList: string[],
  context: TailwindContext,
  removeDuplicates = true
): { classList: string[]; removedIndices: Set<number> } {
  let orderedClasses = context.getClassOrder(classList)

  if (context.propertyOrder) {
    // Custom property ordering: variant → property → TW bigint tiebreaker
    const propCtx = context.propertyOrder
    const infos = orderedClasses.map(([name, twBigint]) => ({
      name,
      twBigint,
      ...getClassSortInfo(name, propCtx)
    }))

    infos.sort((a, b) => {
      // Dynamic placeholders always last
      if (a.name === '...' || a.name === '…') return 1
      if (b.name === '...' || b.name === '…') return -1
      // Unknown classes (null TW bigint = non-TW) first
      if (a.twBigint === null && b.twBigint !== null) return -1
      if (a.twBigint !== null && b.twBigint === null) return 1
      if (a.twBigint === null && b.twBigint === null) return 0
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
      // 3. TW bigint tiebreaker
      if (a.twBigint === b.twBigint) return 0
      return a.twBigint! < b.twBigint! ? -1 : 1
    })

    orderedClasses = infos.map(({ name, twBigint }) => [name, twBigint] as [string, bigint | null])
  } else {
    // Default Tailwind ordering
    orderedClasses.sort(([nameA, a], [nameZ, z]) => {
      // Dynamic placeholders always last
      if (nameA === '...' || nameA === '…') return 1
      if (nameZ === '...' || nameZ === '…') return -1
      if (a === z) return 0
      // Unknown classes (null bigint) first
      if (a === null) return -1
      if (z === null) return 1
      return a < z ? -1 : 1
    })
  }

  const removedIndices = new Set<number>()

  if (removeDuplicates) {
    const seenClasses = new Set<string>()
    orderedClasses = orderedClasses.filter(([cls, order], index) => {
      if (seenClasses.has(cls)) {
        removedIndices.add(index)
        return false
      }
      if (order !== null) seenClasses.add(cls)
      return true
    })
  }

  return {
    classList: orderedClasses.map(([cls]) => cls),
    removedIndices
  }
}
