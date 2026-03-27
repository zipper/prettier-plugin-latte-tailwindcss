/** Parsed classRegex pattern types */
type SimplePattern = { regex: RegExp }
type TuplePattern = { outer: RegExp; inner: RegExp }
export type ClassRegexPattern = SimplePattern | TuplePattern

function isSimple(p: ClassRegexPattern): p is SimplePattern {
  return 'regex' in p
}

/**
 * Parse JSON string of classRegex patterns.
 * Each item is either a string (simple pattern with one capture group)
 * or a [outerRegex, innerRegex] tuple.
 * Invalid JSON logs a warning and returns an empty array.
 */
export function parseClassRegexPatterns(json: string): ClassRegexPattern[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    console.warn('prettier-plugin-latte-tailwind: Invalid tailwindClassRegex JSON')
    return []
  }

  if (!Array.isArray(raw)) {
    console.warn('prettier-plugin-latte-tailwind: Invalid tailwindClassRegex JSON')
    return []
  }

  const patterns: ClassRegexPattern[] = []

  for (const item of raw) {
    try {
      if (typeof item === 'string') {
        patterns.push({ regex: new RegExp(item, 'gs') })
      } else if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'string') {
        patterns.push({
          outer: new RegExp(item[0], 'gs'),
          inner: new RegExp(item[1], 'gs'),
        })
      }
    } catch {
      console.warn('prettier-plugin-latte-tailwind: Invalid regex in tailwindClassRegex, skipping pattern')
    }
  }

  return patterns
}

interface Replacement {
  start: number
  end: number
  replacement: string
}

/**
 * Apply classRegex patterns to source code.
 * For each match, sort the captured class string using sortFn and replace in code.
 * Returns modified code.
 */
export function applyClassRegex(
  code: string,
  patterns: ClassRegexPattern[],
  sortFn: (classes: string) => string,
): string {
  const replacements: Replacement[] = []

  for (const pattern of patterns) {
    if (isSimple(pattern)) {
      collectSimple(code, pattern.regex, sortFn, replacements)
    } else {
      collectTuple(code, pattern.outer, pattern.inner, sortFn, replacements)
    }
  }

  return applyReplacements(code, replacements)
}

function collectSimple(
  code: string,
  regex: RegExp,
  sortFn: (classes: string) => string,
  out: Replacement[],
): void {
  // Reset lastIndex for global regex
  regex.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(code)) !== null) {
    if (match[1] === undefined) continue // no capture group
    const captured = match[1]
    const sorted = sortFn(captured)
    if (sorted !== captured) {
      // Calculate absolute offset of capture group within the full match
      const captureStart = match.index + match[0].indexOf(captured)
      out.push({
        start: captureStart,
        end: captureStart + captured.length,
        replacement: sorted,
      })
    }
  }
}

function collectTuple(
  code: string,
  outer: RegExp,
  inner: RegExp,
  sortFn: (classes: string) => string,
  out: Replacement[],
): void {
  outer.lastIndex = 0
  let outerMatch: RegExpExecArray | null
  while ((outerMatch = outer.exec(code)) !== null) {
    const outerStr = outerMatch[0]
    const outerStart = outerMatch.index

    inner.lastIndex = 0
    let innerMatch: RegExpExecArray | null
    while ((innerMatch = inner.exec(outerStr)) !== null) {
      if (innerMatch[1] === undefined) continue
      const captured = innerMatch[1]
      const sorted = sortFn(captured)
      if (sorted !== captured) {
        const captureStartInOuter = innerMatch.index + innerMatch[0].indexOf(captured)
        const absStart = outerStart + captureStartInOuter
        out.push({
          start: absStart,
          end: absStart + captured.length,
          replacement: sorted,
        })
      }
    }
  }
}

/**
 * Apply collected replacements from end to start so offsets stay valid.
 */
function applyReplacements(code: string, replacements: Replacement[]): string {
  // Sort by start offset descending — apply from end to preserve earlier offsets
  replacements.sort((a, b) => b.start - a.start)

  let result = code
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end)
  }
  return result
}
