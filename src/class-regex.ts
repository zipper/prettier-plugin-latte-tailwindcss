import * as path from 'node:path'
import { resolveIdeClassRegex } from './ide-config'

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

  return parseClassRegexArray(raw)
}

/**
 * Parse raw array of classRegex patterns (already deserialized).
 * Dangerous patterns (unbounded greedy quantifiers) are detected, warned about, and skipped.
 */
function parseClassRegexArray(raw: unknown[]): ClassRegexPattern[] {
  const patterns: ClassRegexPattern[] = []

  for (const item of raw) {
    try {
      if (typeof item === 'string') {
        if (isUnsafePattern(item)) {
          warnUnsafe(item)
          continue
        }
        patterns.push({ regex: new RegExp(item, 'gs') })
      } else if (
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === 'string' &&
        typeof item[1] === 'string'
      ) {
        if (isUnsafePattern(item[0])) {
          warnUnsafe(item[0])
          continue
        }
        patterns.push({
          outer: new RegExp(item[0], 'gs'),
          inner: new RegExp(item[1], 'gs')
        })
      }
    } catch {
      console.warn('prettier-plugin-latte-tailwind: Invalid regex in tailwindClassRegex, skipping pattern')
    }
  }

  return patterns
}

/**
 * Detect patterns with unbounded greedy quantifiers that can match entire files.
 * - `[\s\S]*` / `[\S\s]*` — explicitly matches everything including newlines
 * - `(?:.*)` or bare `.*` in a context that with dotall flag spans the whole input
 */
function isUnsafePattern(source: string): boolean {
  // [\s\S]* or [\S\s]* — common "match everything" idiom
  if (/\[\\?[sS]\\?[Ss]\]\*/.test(source)) return true
  // \$(?:.*) or \$(.*) — greedy from first $ across entire input with dotall
  if (/\\\$\((?:\?:)?\.\*\)/.test(source)) return true
  return false
}

function warnUnsafe(source: string): void {
  console.warn(
    `prettier-plugin-latte-tailwind: Skipping dangerous classRegex pattern "${source}" — ` +
      'unbounded greedy quantifier can match entire file content. ' +
      'Use bounded patterns like [^"]*  or [^\\]]*  instead.'
  )
}

/**
 * Runtime safety: skip capture groups that contain structural characters
 * which indicate the regex matched beyond class attribute boundaries.
 * Valid CSS class strings never contain < > { } , (commas indicate
 * inter-token separators were captured instead of class names).
 */
function isSafeCapture(captured: string): boolean {
  return !/[<>{},]/.test(captured)
}

// Re-export for testing
export { isUnsafePattern as _isUnsafePattern }

/**
 * Resolve classRegex patterns from explicit config or IDE auto-detection.
 * Priority: explicit .prettierrc > .vscode/settings.json > .idea/tailwindcss.xml > []
 */
export function resolveClassRegexPatterns(explicitJson: string | undefined, filepath: string): ClassRegexPattern[] {
  // Explicit config has highest priority
  if (explicitJson !== undefined && explicitJson !== '') {
    return parseClassRegexPatterns(explicitJson)
  }

  // Empty string (default) → try IDE config auto-detection
  const dir = filepath ? path.dirname(path.resolve(filepath)) : process.cwd()
  const idePatterns = resolveIdeClassRegex(dir)

  if (idePatterns !== null) {
    return parseClassRegexArray(idePatterns)
  }

  return []
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
  sortFn: (classes: string) => string
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

function collectSimple(code: string, regex: RegExp, sortFn: (classes: string) => string, out: Replacement[]): void {
  // Use 'd' flag for capture group indices when available
  const dRegex = addIndicesFlag(regex)
  dRegex.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = dRegex.exec(code)) !== null) {
    if (match[1] === undefined) continue // no capture group
    const captured = match[1]
    if (!isSafeCapture(captured)) continue
    const sorted = sortFn(captured)
    if (sorted !== captured) {
      const captureStart = getCaptureOffset(match, 1)
      out.push({
        start: captureStart,
        end: captureStart + captured.length,
        replacement: sorted
      })
    }
  }
}

function collectTuple(
  code: string,
  outer: RegExp,
  inner: RegExp,
  sortFn: (classes: string) => string,
  out: Replacement[]
): void {
  outer.lastIndex = 0
  let outerMatch: RegExpExecArray | null
  while ((outerMatch = outer.exec(code)) !== null) {
    const outerStr = outerMatch[0]
    const outerStart = outerMatch.index

    const dInner = addIndicesFlag(inner)
    dInner.lastIndex = 0
    let innerMatch: RegExpExecArray | null
    while ((innerMatch = dInner.exec(outerStr)) !== null) {
      if (innerMatch[1] === undefined) continue
      const captured = innerMatch[1]
      if (!isSafeCapture(captured)) continue
      const sorted = sortFn(captured)
      if (sorted !== captured) {
        const captureStartInOuter = getCaptureOffset(innerMatch, 1)
        const absStart = outerStart + captureStartInOuter
        out.push({
          start: absStart,
          end: absStart + captured.length,
          replacement: sorted
        })
      }
    }
  }
}

/**
 * Add 'd' (hasIndices) flag to a regex if not already present.
 * This enables match.indices for precise capture group offsets.
 */
function addIndicesFlag(regex: RegExp): RegExp {
  if (regex.hasIndices) return regex
  return new RegExp(regex.source, regex.flags + 'd')
}

/**
 * Get the start offset of capture group N from a match.
 * Uses match.indices (from 'd' flag) if available, falls back to indexOf.
 */
function getCaptureOffset(match: RegExpExecArray, group: number): number {
  const indices = (match as any).indices as [number, number][] | undefined
  if (indices?.[group]) {
    return indices[group][0]
  }
  // Fallback: indexOf (may be incorrect if captured text appears multiple times)
  return match.index + match[0].indexOf(match[group])
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
