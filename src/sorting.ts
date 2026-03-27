import type { TailwindContext } from './types'

export interface SortOptions {
  removeDuplicates?: boolean
  preserveWhitespace?: boolean
}

/**
 * Sort a whitespace-separated class string using Tailwind order.
 * Returns the string unchanged if context is null or the string contains Latte expressions.
 */
export function sortClasses(
  classStr: string,
  context: TailwindContext | null,
  opts: SortOptions = {},
): string {
  if (!context) return classStr
  if (typeof classStr !== 'string' || classStr === '') return classStr

  // Skip strings that still contain unprocessed Latte expressions
  if (classStr.includes('{')) return classStr

  const { removeDuplicates = true, preserveWhitespace = false } = opts

  // Whitespace-only string → normalize to single space
  if (!preserveWhitespace && /^[\t\r\f\n ]+$/.test(classStr)) return ' '

  // Split into alternating [class, separator, class, separator, ...] tokens
  const parts = classStr.split(/([\t\r\f\n ]+)/)
  let classes = parts.filter((_, i) => i % 2 === 0)
  let whitespace = parts.filter((_, i) => i % 2 !== 0)

  // Remove trailing empty token left by trailing whitespace
  if (classes[classes.length - 1] === '') classes.pop()

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
  removeDuplicates = true,
): { classList: string[]; removedIndices: Set<number> } {
  let orderedClasses = context.getClassOrder(classList)

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
    removedIndices,
  }
}
