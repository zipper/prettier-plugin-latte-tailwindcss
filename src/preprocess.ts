import type { PreprocessResult } from './types'

const PLACEHOLDER_RE = /__LP_[0-9a-f]{16}__/g

/**
 * Replace Latte constructs with fixed-length placeholders so the HTML parser can produce an AST.
 *
 * Replaced:
 *   {* comments *}
 *   {tags}, {$expressions}, {= expressions}, ... — everything except ={[...]}
 *   <tag{$dynamicName}>                           — whole opening tag with dynamic name
 *
 * NOT replaced:
 *   class={[...]}  — unquoted array class, handled in extract phase (extract.ts)
 */
export function preprocessLatte(code: string): PreprocessResult {
  const map = new Map<string, string>()
  let counter = 0

  function newPlaceholder(original: string): string {
    const ph = `__LP_${counter.toString(16).padStart(16, '0')}__`
    counter++
    map.set(ph, original)
    return ph
  }

  let result = ''
  let i = 0
  const len = code.length

  while (i < len) {
    const ch = code[i]

    // Latte comment: {* ... *}
    if (ch === '{' && code[i + 1] === '*') {
      const end = code.indexOf('*}', i + 2)
      if (end !== -1) {
        result += newPlaceholder(code.slice(i, end + 2))
        i = end + 2
        continue
      }
    }

    // Dynamic tag name: <tagname{$expr}> or <{$expr}>
    // Example: <h{$level}> or <{$tag}>
    if (ch === '<') {
      const nextCh = code[i + 1]
      // Skip closing tags, comments, and whitespace — they don't have dynamic names
      if (nextCh !== '/' && nextCh !== '!' && nextCh !== ' ' && nextCh !== '\n') {
        // Skip static prefix of tag name (e.g. "h" in "h{$level}")
        let j = i + 1
        while (j < len && /[a-zA-Z0-9_.-]/.test(code[j])) j++
        // Tag name contains { → dynamic tag, replace entire opening tag
        if (j < len && code[j] === '{') {
          const tagEnd = code.indexOf('>', j)
          if (tagEnd !== -1) {
            result += newPlaceholder(code.slice(i, tagEnd + 1))
            i = tagEnd + 1
            continue
          }
        }
      }
    }

    // Latte expression or tag: {expr}
    // Replace unless:
    //   { followed by whitespace or EOF (literal text, not Latte)
    //   ={[ pattern (array class syntax: class={[btn, flex]})
    if (ch === '{') {
      const nextCh = code[i + 1]

      // { followed by whitespace = literal brace, not Latte
      if (nextCh === ' ' || nextCh === '\t' || nextCh === '\n' || nextCh === '\r' || nextCh === undefined) {
        result += ch
        i++
        continue
      }

      // ={[ = array class syntax, do not replace
      if (nextCh === '[' && i > 0 && code[i - 1] === '=') {
        result += ch
        i++
        continue
      }

      // Find matching closing brace, tracking nesting depth
      let depth = 1
      let j = i + 1
      while (j < len && depth > 0) {
        if (code[j] === '{') depth++
        else if (code[j] === '}') depth--
        j++
      }

      if (depth === 0) {
        result += newPlaceholder(code.slice(i, j))
        i = j
        continue
      }
    }

    result += ch
    i++
  }

  return { code: result, map }
}

/**
 * Restore placeholders in a string back to their original Latte constructs.
 * Called in index.ts after sorting to restore original Latte constructs.
 */
export function restorePlaceholders(str: string, map: Map<string, string>): string {
  return str.replace(PLACEHOLDER_RE, (ph) => map.get(ph) ?? ph)
}
