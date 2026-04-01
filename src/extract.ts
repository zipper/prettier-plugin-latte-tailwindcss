// ─── Public types ───

export interface ClassMatch {
  /** Byte offset in the preprocessed text where the VALUE starts (after opening quote) */
  offset: number
  /** Length of the value (before closing quote) */
  length: number
  /** The extracted value string */
  value: string
  /** Type of the match */
  type: 'class' | 'n:class' | 'array-class' | 'tailwind-attribute'
  /** The attribute name (for tailwind-attribute type) */
  attributeName?: string
}

// ─── Constants ───

/** Placeholder prefix used by preprocessLatte */
const _PLACEHOLDER_PREFIX = '__LP_'
/** Total length of a placeholder: __LP_ (5) + 16 hex chars + __ (2) = 23 */
const PLACEHOLDER_LENGTH = 23

// ─── Helpers ───

function isTagNameChar(ch: string): boolean {
  const c = ch.charCodeAt(0)
  // a-z, A-Z, 0-9, '-', '_', '.', ':'
  return (
    (c >= 97 && c <= 122) || // a-z
    (c >= 65 && c <= 90) || // A-Z
    (c >= 48 && c <= 57) || // 0-9
    c === 45 || // -
    c === 95 || // _
    c === 46 || // .
    c === 58 // :
  )
}

function isAttrNameChar(ch: string): boolean {
  const c = ch.charCodeAt(0)
  // letters, digits, '-', ':', '_'
  return (
    (c >= 97 && c <= 122) || // a-z
    (c >= 65 && c <= 90) || // A-Z
    (c >= 48 && c <= 57) || // 0-9
    c === 45 || // -
    c === 58 || // :
    c === 95 // _
  )
}

function isWhitespace(ch: string): boolean {
  const c = ch.charCodeAt(0)
  return c === 32 || c === 9 || c === 10 || c === 13 // space, tab, LF, CR
}

function isAlpha(ch: string): boolean {
  const c = ch.charCodeAt(0)
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90)
}

// ─── Main API ───

/**
 * Extract class attribute values from preprocessed HTML/Latte text.
 * Uses char-by-char scanning — no regex for attribute finding.
 *
 * Finds:
 * - class="..." or class='...'
 * - class={[...]} (array class syntax — value includes {[...]})
 * - n:class="..." or n:class='...'
 * - Any attribute from tailwindAttributes list
 *
 * Does NOT find:
 * - Attributes inside Latte tags (placeholders)
 * - Unquoted attribute values
 */
export function extractClassAttributes(code: string, tailwindAttributes: string[]): ClassMatch[] {
  const matches: ClassMatch[] = []
  const len = code.length
  let i = 0

  // Build a Set for fast lookup of tailwind attribute names
  const twAttrSet = new Set(tailwindAttributes)

  while (i < len) {
    // Skip placeholders anywhere in the text
    if (code[i] === '_' && code[i + 1] === '_' && code[i + 2] === 'L' && code[i + 3] === 'P' && code[i + 4] === '_') {
      i += PLACEHOLDER_LENGTH
      continue
    }

    // Detect HTML comment: <!-- ... -->
    if (code[i] === '<' && code[i + 1] === '!' && code[i + 2] === '-' && code[i + 3] === '-') {
      i = skipHtmlComment(code, i, len)
      continue
    }

    // Detect start of HTML tag
    if (code[i] === '<') {
      const nextCh = code[i + 1]
      if (nextCh === undefined) {
        i++
        continue
      }

      // Opening tag: <letter or </letter
      const isClosing = nextCh === '/'
      const nameStart = isClosing ? i + 2 : i + 1
      const nameChar = code[nameStart]

      if (nameChar !== undefined && isAlpha(nameChar)) {
        // Read tag name
        let j = nameStart
        while (j < len && isTagNameChar(code[j])) j++

        const tagName = code.slice(nameStart, j).toLowerCase()

        // Check for script/style — skip their content
        if (!isClosing && (tagName === 'script' || tagName === 'style')) {
          // Parse attributes of this tag first, then skip content
          const tagEnd = scanTagAttributes(code, j, len, twAttrSet, matches)
          i = skipRawContent(code, tagEnd, len, tagName)
          continue
        }

        // Regular tag — scan its attributes
        if (!isClosing) {
          const tagEnd = scanTagAttributes(code, j, len, twAttrSet, matches)
          i = tagEnd
          continue
        } else {
          // Closing tag — skip to >
          while (j < len && code[j] !== '>') j++
          i = j < len ? j + 1 : j
          continue
        }
      }
    }

    i++
  }

  return matches
}

// ─── Tag attribute scanner ───

/**
 * Scan attributes inside a tag starting from position `pos` (after tag name).
 * Returns the position after the closing `>`.
 */
function scanTagAttributes(
  code: string,
  pos: number,
  len: number,
  twAttrSet: Set<string>,
  matches: ClassMatch[]
): number {
  let i = pos

  while (i < len) {
    // Skip whitespace
    while (i < len && isWhitespace(code[i])) i++

    // End of tag
    if (i >= len) break
    if (code[i] === '>') return i + 1
    if (code[i] === '/' && code[i + 1] === '>') return i + 2

    // Skip placeholders inside tags
    if (code[i] === '_' && code[i + 1] === '_' && code[i + 2] === 'L' && code[i + 3] === 'P' && code[i + 4] === '_') {
      i += PLACEHOLDER_LENGTH
      continue
    }

    // Read attribute name
    if (!isAttrNameChar(code[i])) {
      // Unexpected character — advance to avoid infinite loop
      i++
      continue
    }

    const attrStart = i
    while (i < len && isAttrNameChar(code[i])) i++
    const attrName = code.slice(attrStart, i)

    // Skip whitespace before =
    while (i < len && isWhitespace(code[i])) i++

    // No = sign → attribute without value (e.g. `hidden`)
    if (i >= len || code[i] !== '=') {
      continue
    }

    // Skip =
    i++

    // Skip whitespace after =
    while (i < len && isWhitespace(code[i])) i++

    if (i >= len) break

    // Determine value type
    const quoteChar = code[i]

    if (quoteChar === '"' || quoteChar === "'") {
      // Quoted value
      i++ // skip opening quote
      const valueStart = i

      // Scan to closing quote
      while (i < len && code[i] !== quoteChar) i++

      const valueEnd = i
      const value = code.slice(valueStart, valueEnd)

      if (i < len) i++ // skip closing quote

      // Check attribute name
      if (attrName === 'class') {
        matches.push({
          offset: valueStart,
          length: valueEnd - valueStart,
          value,
          type: 'class'
        })
      } else if (attrName === 'n:class') {
        matches.push({
          offset: valueStart,
          length: valueEnd - valueStart,
          value,
          type: 'n:class'
        })
      } else if (twAttrSet.has(attrName)) {
        matches.push({
          offset: valueStart,
          length: valueEnd - valueStart,
          value,
          type: 'tailwind-attribute',
          attributeName: attrName
        })
      }
    } else if (quoteChar === '{' && code[i + 1] === '[') {
      // Array class syntax: {[...]}
      const bracketStart = i
      i += 2 // skip {[

      let depth = 1
      while (i < len && depth > 0) {
        if (code[i] === '[') depth++
        else if (code[i] === ']') {
          depth--
          if (depth === 0) {
            // Check for closing }
            if (code[i + 1] === '}') {
              i += 2 // skip ]}
              break
            }
            // Not the matching ]} — continue
            depth++
          }
        }
        i++
      }

      const value = code.slice(bracketStart, i)

      if (attrName === 'class') {
        matches.push({
          offset: bracketStart,
          length: i - bracketStart,
          value,
          type: 'array-class'
        })
      }
    } else {
      // Unquoted value — skip until whitespace or >
      while (i < len && !isWhitespace(code[i]) && code[i] !== '>' && !(code[i] === '/' && code[i + 1] === '>')) {
        i++
      }
      // Unquoted values are not matched (per spec)
    }
  }

  return i
}

// ─── Content skippers ───

/**
 * Skip an HTML comment starting at position `pos`.
 * Returns position after `-->`.
 */
function skipHtmlComment(code: string, pos: number, len: number): number {
  let i = pos + 4 // skip <!--
  while (i < len) {
    if (code[i] === '-' && code[i + 1] === '-' && code[i + 2] === '>') {
      return i + 3
    }
    i++
  }
  return len
}

/**
 * Skip raw content of a script or style tag.
 * `pos` is the position right after the opening tag's `>`.
 * Returns position after the closing tag `</tagName>`.
 */
function skipRawContent(code: string, pos: number, len: number, tagName: string): number {
  let i = pos
  const closingTag = `</${tagName}`

  while (i < len) {
    if (code[i] === '<' && code[i + 1] === '/') {
      const remaining = code.slice(i, i + closingTag.length).toLowerCase()
      if (remaining === closingTag) {
        // Skip to end of closing tag
        let j = i + closingTag.length
        while (j < len && code[j] !== '>') j++
        return j < len ? j + 1 : j
      }
    }
    i++
  }

  return len
}
