import * as fs from 'node:fs'
import * as path from 'node:path'

const MAX_TRAVERSAL_DEPTH = 20

// ─── Module-level cache ───

const NOT_FOUND = Symbol('not-found')
let cachedResult: unknown[] | typeof NOT_FOUND | null = null

/** Reset cache — exported for testing */
export function _resetIdeConfigCache(): void {
  cachedResult = null
}

// ─── Public API ───

/**
 * Find classRegex patterns from IDE configuration files.
 * Traverses from startDir upward, checking .vscode/settings.json
 * and .idea/tailwindcss.xml in priority order.
 * Returns raw pattern array or null if nothing found.
 * Results are cached per prettier run.
 */
export function resolveIdeClassRegex(startDir: string): unknown[] | null {
  if (cachedResult !== null) {
    return cachedResult === NOT_FOUND ? null : cachedResult
  }

  const result = findIdeClassRegex(startDir)
  cachedResult = result ?? NOT_FOUND
  return result
}

function findIdeClassRegex(startDir: string): unknown[] | null {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root

  for (let depth = 0; depth < MAX_TRAVERSAL_DEPTH; depth++) {
    // Priority: VS Code > PhpStorm
    const vscode = readVscodeClassRegex(dir)
    if (vscode !== null) {
      console.log(
        `[prettier-plugin-latte-tailwindcss] Using classRegex from ${path.join(dir, '.vscode', 'settings.json')}`
      )
      return vscode
    }

    const phpstorm = readPhpStormClassRegex(dir)
    if (phpstorm !== null) {
      console.log(
        `[prettier-plugin-latte-tailwindcss] Using classRegex from ${path.join(dir, '.idea', 'tailwindcss.xml')}`
      )
      return phpstorm
    }

    if (dir === root) break
    dir = path.dirname(dir)
  }

  return null
}

// ─── VS Code ───

function readVscodeClassRegex(dir: string): unknown[] | null {
  try {
    const filePath = path.join(dir, '.vscode', 'settings.json')
    if (!fs.existsSync(filePath)) return null

    const raw = fs.readFileSync(filePath, 'utf-8')
    const cleaned = stripJsonComments(raw)
    const parsed = JSON.parse(cleaned)
    const regex = parsed?.['tailwindCSS.experimental.classRegex']

    return Array.isArray(regex) && regex.length > 0 ? regex : null
  } catch {
    return null
  }
}

// ─── PhpStorm / JetBrains ───

function readPhpStormClassRegex(dir: string): unknown[] | null {
  try {
    const filePath = path.join(dir, '.idea', 'tailwindcss.xml')
    if (!fs.existsSync(filePath)) return null

    const xml = fs.readFileSync(filePath, 'utf-8')

    // Extract lspConfiguration value — " inside value is always &quot;
    const match = xml.match(/name="lspConfiguration"\s+value="([^"]*)"/)
    if (!match) return null

    const decoded = decodeXmlEntities(match[1])
    const parsed = JSON.parse(decoded)
    const regex = parsed?.experimental?.classRegex

    return Array.isArray(regex) && regex.length > 0 ? regex : null
  } catch {
    return null
  }
}

// ─── Utilities ───

/**
 * Decode XML/HTML entities in attribute values.
 * Covers: &#N; &#xHH; &quot; &apos; &lt; &gt; &amp;
 * Note: &amp; must be replaced last.
 */
export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Strip JSONC comments (line and block) and trailing commas.
 * Uses a char-by-char state machine to avoid stripping inside strings.
 */
export function stripJsonComments(str: string): string {
  let result = ''
  let i = 0
  let inString = false

  while (i < str.length) {
    const ch = str[i]

    if (inString) {
      result += ch
      if (ch === '\\') {
        // Skip escaped character
        i++
        if (i < str.length) result += str[i]
      } else if (ch === '"') {
        inString = false
      }
      i++
      continue
    }

    // Outside string
    if (ch === '"') {
      inString = true
      result += ch
      i++
      continue
    }

    // Line comment
    if (ch === '/' && str[i + 1] === '/') {
      // Skip until end of line
      i += 2
      while (i < str.length && str[i] !== '\n') i++
      continue
    }

    // Block comment
    if (ch === '/' && str[i + 1] === '*') {
      i += 2
      while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++
      i += 2 // skip */
      continue
    }

    result += ch
    i++
  }

  // Strip trailing commas before } or ]
  return result.replace(/,\s*([}\]])/g, '$1')
}
