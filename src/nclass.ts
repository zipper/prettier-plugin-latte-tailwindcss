import { sortClasses } from './sorting'
import type { LatteOptions, TailwindContext } from './types'

// ─── Public types ───

export interface NClassToken {
  /** Trimmed token content */
  content: string
  /** Trailing separator: comma + whitespace to the next token */
  trailingSep: string
  /** Whether this token can be reordered within its group */
  sortable: boolean
  /** Sort key for token-level sorting (single class name for sortable tokens) */
  sortKey: string
}

export interface ParsedNClass {
  /** Whitespace before the first token */
  prefix: string
  /** Parsed tokens with trailing separators */
  tokens: NClassToken[]
  /** Whitespace after the last token */
  suffix: string
}

// ─── Main API ───

/**
 * Sort an n:class attribute value.
 *
 * 1. Sort classes WITHIN each token (quoted multi-class strings, conditional branches)
 * 2. Sort sortable tokens within groups separated by barrier tokens
 * 3. Reassemble with whitespace handled per tailwindNclassWhitespace option
 */
export function sortNClassValue(
  value: string,
  context: TailwindContext | null,
  options: LatteOptions,
): string {
  if (!context) return value
  if (!value.trim()) return value

  const parsed = parseNClass(value)
  if (parsed.tokens.length === 0) return value

  // Save original positional separators before tokens are reordered
  const originalSeps = parsed.tokens.map(t => t.trailingSep)

  // 1. Sort classes WITHIN each token (branches, multi-class quoted strings)
  for (const token of parsed.tokens) {
    sortTokenInternalClasses(token, context, options)
  }

  // 2. Sort sortable tokens within groups (between barriers)
  sortTokenGroups(parsed.tokens, context)

  // 3. Serialize with whitespace mode
  const mode = options.tailwindNclassWhitespace ?? 'normalize-barriers'
  return serializeNClass(parsed, originalSeps, mode)
}

// ─── Parsing ───

/** Parse n:class value into tokens with trailing separators. */
export function parseNClass(value: string): ParsedNClass {
  // Extract leading whitespace (prefix)
  let prefixEnd = 0
  while (prefixEnd < value.length && /\s/.test(value[prefixEnd])) prefixEnd++
  const prefix = value.slice(0, prefixEnd)

  // Extract trailing whitespace (suffix)
  let suffixStart = value.length
  while (suffixStart > prefixEnd && /\s/.test(value[suffixStart - 1])) suffixStart--
  const suffix = value.slice(suffixStart)

  const body = value.slice(prefixEnd, suffixStart)
  if (!body) return { prefix, tokens: [], suffix }

  // Split by top-level commas, tracking trailing separators
  const tokens: NClassToken[] = []
  let current = ''
  let depth = 0
  let inString = false

  for (let i = 0; i <= body.length; i++) {
    if (i === body.length) {
      const trimmed = current.trim()
      if (trimmed) tokens.push(classifyToken(trimmed, ''))
      break
    }

    const ch = body[i]

    if (inString) {
      current += ch
      if (ch === "'" && (i === 0 || body[i - 1] !== '\\')) inString = false
      continue
    }

    if (ch === "'") { inString = true; current += ch; continue }
    if (ch === '(' || ch === '[') { depth++; current += ch; continue }
    if ((ch === ')' || ch === ']') && depth > 0) { depth--; current += ch; continue }

    if (ch === ',' && depth === 0) {
      const trimmed = current.trim()
      // Capture trailing separator: comma + whitespace until next non-whitespace
      let sep = ','
      let j = i + 1
      while (j < body.length && /\s/.test(body[j])) {
        sep += body[j]
        j++
      }
      if (trimmed) tokens.push(classifyToken(trimmed, sep))
      current = ''
      i = j - 1 // -1 because loop increments
      continue
    }

    current += ch
  }

  return { prefix, tokens, suffix }
}

// ─── Serialization ───

/** Reassemble n:class value from parsed tokens with whitespace mode applied. */
export function serializeNClass(
  parsed: ParsedNClass,
  originalSeps: string[],
  mode: 'preserve' | 'normalize-barriers' | 'normalize',
): string {
  const { prefix, tokens, suffix } = parsed
  if (tokens.length === 0) return prefix + suffix

  let result = prefix

  for (let i = 0; i < tokens.length; i++) {
    result += tokens[i].content

    if (i < tokens.length - 1) {
      switch (mode) {
        case 'preserve':
          // Separator travels with its token
          result += tokens[i].trailingSep
          break
        case 'normalize':
          // All separators normalized to single-line
          result += ', '
          break
        case 'normalize-barriers': {
          // Normalize within sortable groups; preserve at group boundaries and after barriers
          const bothSortable = tokens[i].sortable && tokens[i + 1]?.sortable
          result += bothSortable ? ', ' : (originalSeps[i] || ', ')
          break
        }
      }
    }
  }

  result += suffix
  return result
}

// ─── Token classification ───

function classifyToken(content: string, trailingSep: string): NClassToken {
  // Conditional: has top-level ? (ternary operator)
  if (findTopLevelQuestion(content) !== -1) {
    return { content, trailingSep, sortable: false, sortKey: '' }
  }

  // Dynamic: starts with $ (variable, property chain, method call)
  if (content.startsWith('$')) {
    return { content, trailingSep, sortable: false, sortKey: '' }
  }

  // Quoted string
  if (content.startsWith("'") && content.endsWith("'") && content.length >= 2) {
    const inner = content.slice(1, -1)
    // Multi-class (contains whitespace) → barrier
    if (/\s/.test(inner)) {
      return { content, trailingSep, sortable: false, sortKey: '' }
    }
    // Single-class → sortable
    return { content, trailingSep, sortable: true, sortKey: inner }
  }

  // Bare identifier → sortable (single CSS class name)
  return { content, trailingSep, sortable: true, sortKey: content }
}

// ─── Find ternary operators ───

/**
 * Find the position of the top-level ternary ? operator.
 * Skips ?-> (null-safe) and ?: (Elvis).
 * Returns -1 if not found.
 */
function findTopLevelQuestion(s: string): number {
  let depth = 0
  let inString = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]

    if (inString) {
      if (ch === "'" && s[i - 1] !== '\\') inString = false
      continue
    }

    if (ch === "'") { inString = true; continue }
    if (ch === '(' || ch === '[') { depth++; continue }
    if ((ch === ')' || ch === ']') && depth > 0) { depth--; continue }

    if (ch === '?' && depth === 0) {
      // Skip ?-> (null-safe property access)
      if (s[i + 1] === '-' && s[i + 2] === '>') continue

      // Skip ?: (Elvis) — next non-whitespace after ? is :
      let j = i + 1
      while (j < s.length && /\s/.test(s[j])) j++
      if (j < s.length && s[j] === ':') continue

      return i
    }
  }

  return -1
}

/**
 * Find the position of the top-level ternary : operator after startPos.
 * Skips :: (namespace separator) and ?: (Elvis — whitespace-tolerant lookback).
 * Returns -1 if not found.
 */
function findTopLevelColon(s: string, startPos: number): number {
  let depth = 0
  let inString = false

  for (let i = startPos; i < s.length; i++) {
    const ch = s[i]

    if (inString) {
      if (ch === "'" && s[i - 1] !== '\\') inString = false
      continue
    }

    if (ch === "'") { inString = true; continue }
    if (ch === '(' || ch === '[') { depth++; continue }
    if ((ch === ')' || ch === ']') && depth > 0) { depth--; continue }

    if (ch === ':' && depth === 0) {
      // Skip :: (namespace separator)
      if (s[i + 1] === ':') { i++; continue }

      // Skip ?: — lookback through whitespace for ?
      let j = i - 1
      while (j >= 0 && /\s/.test(s[j])) j--
      if (j >= 0 && s[j] === '?') continue

      return i
    }
  }

  return -1
}

// ─── Internal class sorting within tokens ───

/** Sort classes inside a token's quoted strings and conditional branches. */
function sortTokenInternalClasses(
  token: NClassToken,
  context: TailwindContext,
  options: LatteOptions,
): void {
  const sortOpts = {
    removeDuplicates: !options.tailwindPreserveDuplicates,
    preserveWhitespace: options.tailwindPreserveWhitespace,
  }
  const content = token.content

  // Conditional: sort classes in true/false branches
  const qPos = findTopLevelQuestion(content)
  if (qPos !== -1) {
    const condition = content.slice(0, qPos).trimEnd()
    const afterQ = content.slice(qPos + 1).trimStart()
    const cPos = findTopLevelColon(afterQ, 0)

    if (cPos !== -1) {
      // Ternary: condition ? trueBranch : falseBranch
      const truePart = afterQ.slice(0, cPos).trim()
      const falsePart = afterQ.slice(cPos + 1).trim()
      token.content = `${condition} ? ${sortBranch(truePart, context, sortOpts)} : ${sortBranch(falsePart, context, sortOpts)}`
    } else {
      // Conditional with true branch only: condition ? trueBranch
      const truePart = afterQ.trim()
      token.content = `${condition} ? ${sortBranch(truePart, context, sortOpts)}`
    }
    return
  }

  // Multi-class quoted string: sort inner classes
  if (content.startsWith("'") && content.endsWith("'") && content.length >= 2) {
    const inner = content.slice(1, -1)
    if (/\s/.test(inner)) {
      token.content = `'${sortClasses(inner, context, sortOpts)}'`
    }
  }
}

/** Sort classes within a conditional branch (quoted or bare). */
function sortBranch(
  branch: string,
  context: TailwindContext,
  sortOpts: { removeDuplicates?: boolean; preserveWhitespace?: boolean },
): string {
  // Quoted string — sort inner classes if multi-class
  if (branch.startsWith("'") && branch.endsWith("'") && branch.length >= 2) {
    const inner = branch.slice(1, -1)
    if (/\s/.test(inner)) {
      return `'${sortClasses(inner, context, sortOpts)}'`
    }
    return branch
  }

  // Bare multi-word — sort as space-separated classes
  if (branch.includes(' ') && !branch.startsWith('$')) {
    return sortClasses(branch, context, sortOpts)
  }

  // Single bare class or dynamic — unchanged
  return branch
}

// ─── Token-level sorting ───

/**
 * Find groups of consecutive sortable tokens between barriers
 * and sort each group by Tailwind class order.
 */
function sortTokenGroups(tokens: NClassToken[], context: TailwindContext): void {
  let groupStart = -1

  for (let i = 0; i <= tokens.length; i++) {
    const isSortable = i < tokens.length && tokens[i].sortable

    if (isSortable && groupStart === -1) {
      groupStart = i
    } else if (!isSortable && groupStart !== -1) {
      sortGroup(tokens, groupStart, i, context)
      groupStart = -1
    }
  }
}

/** Sort a contiguous group of sortable tokens by Tailwind order. */
function sortGroup(
  tokens: NClassToken[],
  start: number,
  end: number,
  context: TailwindContext,
): void {
  if (end - start <= 1) return

  const group = tokens.slice(start, end)
  const classNames = group.map(t => t.sortKey)
  const order = context.getClassOrder(classNames)

  // Sort indices by Tailwind bigint order (null = FIRST)
  const indices = order.map(([, bigint], i) => ({ i, bigint }))
  indices.sort((a, b) => {
    if (a.bigint === b.bigint) return 0
    if (a.bigint === null) return -1
    if (b.bigint === null) return 1
    return a.bigint < b.bigint ? -1 : 1
  })

  // Write sorted tokens back into the main array
  const sorted = indices.map(({ i }) => group[i])
  for (let i = 0; i < sorted.length; i++) {
    tokens[start + i] = sorted[i]
  }
}
