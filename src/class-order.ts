import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'

// ─── Types ───

export type Unspecified = 'top' | 'bottom'

/** User-facing bucket specification (raw config form). */
export type BucketSpec = 'unknown' | 'tailwind' | 'tailwindcss' | { pattern: string }

/** Compiled bucket ready for the matching loop. */
export interface CompiledBucket {
  /** 'tailwindcss' alias is normalized to 'tailwind'. */
  kind: 'unknown' | 'tailwind' | 'pattern'
  /** Present only for kind='pattern'. */
  regex?: RegExp
  /** Original spec (preserved for diagnostics). */
  raw: BucketSpec
}

/** Resolved class order config attached to TailwindContext. */
export interface ClassOrderContext {
  buckets: CompiledBucket[]
  unspecified: Unspecified
}

// ─── Default config ───

/**
 * Implicit default — equivalent to the previous fixed "unknown FIRST → tailwind ASC" behavior.
 * Used whenever the user hasn't configured `tailwindClassOrder` (or configured it incorrectly).
 */
export function defaultClassOrderContext(): ClassOrderContext {
  return {
    buckets: [
      { kind: 'unknown', raw: 'unknown' },
      { kind: 'tailwind', raw: 'tailwind' }
    ],
    unspecified: 'top'
  }
}

// ─── Parsing ───

/**
 * Parse a raw config array into a ClassOrderContext.
 *
 * Accepts:
 *   - Flat: `["unknown", "tailwind", {pattern:"^js-"}]`
 *   - Tuple: `[[...items], {unspecified:"top"}]` (stylelint-order style)
 *
 * Invalid regex patterns produce a warning and the offending bucket is dropped
 * (the rest of the config survives). If no buckets remain after compilation,
 * returns null so the caller can fall back to the default.
 */
export function parseClassOrderConfig(raw: unknown): ClassOrderContext | null {
  if (!Array.isArray(raw)) {
    console.warn('[prettier-plugin-latte-tailwindcss] tailwindClassOrder: config must be an array')
    return null
  }

  // Tuple form: [[items...], {unspecified?: 'top'|'bottom'}]
  // Heuristic analogous to parsePropertiesOrderRule in property-order.ts: exactly 2 elements,
  // first is an array, second is a plain (non-array) object.
  let items: unknown[]
  let unspecified: Unspecified = 'top'

  if (raw.length === 2 && Array.isArray(raw[0]) && raw[1] && typeof raw[1] === 'object' && !Array.isArray(raw[1])) {
    items = raw[0] as unknown[]
    const opts = raw[1] as Record<string, unknown>
    if (opts.unspecified === 'top' || opts.unspecified === 'bottom') {
      unspecified = opts.unspecified
    } else if (opts.unspecified !== undefined) {
      console.warn(
        `[prettier-plugin-latte-tailwindcss] tailwindClassOrder: invalid unspecified value '${String(
          opts.unspecified
        )}' — falling back to 'top'`
      )
    }
  } else {
    // Flat form — entire array is the items list
    items = raw
  }

  const buckets: CompiledBucket[] = []
  for (const item of items) {
    const compiled = compileBucket(item)
    if (compiled) buckets.push(compiled)
  }

  if (buckets.length === 0) {
    console.warn(
      '[prettier-plugin-latte-tailwindcss] tailwindClassOrder: no valid buckets after compilation — falling back to default'
    )
    return null
  }

  return { buckets, unspecified }
}

function compileBucket(item: unknown): CompiledBucket | null {
  if (typeof item === 'string') {
    if (item === 'unknown') {
      return { kind: 'unknown', raw: 'unknown' }
    }
    if (item === 'tailwind' || item === 'tailwindcss') {
      return { kind: 'tailwind', raw: item as 'tailwind' | 'tailwindcss' }
    }
    console.warn(`[prettier-plugin-latte-tailwindcss] tailwindClassOrder: unknown bucket string '${item}' — skipping`)
    return null
  }

  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>
    if (typeof obj.pattern === 'string') {
      try {
        const regex = new RegExp(obj.pattern)
        return { kind: 'pattern', regex, raw: { pattern: obj.pattern } }
      } catch (err) {
        console.warn(
          `[prettier-plugin-latte-tailwindcss] tailwindClassOrder: invalid regex pattern '${obj.pattern}' — skipping bucket`,
          err
        )
        return null
      }
    }
    console.warn(
      '[prettier-plugin-latte-tailwindcss] tailwindClassOrder: object bucket must have a string "pattern" field — skipping'
    )
    return null
  }

  console.warn(
    `[prettier-plugin-latte-tailwindcss] tailwindClassOrder: invalid bucket entry '${String(item)}' — skipping`
  )
  return null
}

// ─── Config loading via jiti ───

/**
 * Load a class order config from a JS/JSON/TS file via jiti.
 * Mirrors the resolution strategy of `loadPropertyOrderConfig` in property-order.ts.
 * Returns null on error (with console.warn).
 */
export async function loadClassOrderConfig(configPath: string, configDir: string): Promise<ClassOrderContext | null> {
  let raw: unknown
  try {
    const jiti = createJiti(path.join(configDir, '__placeholder__.js'), { moduleCache: false, fsCache: false })

    let importId: string
    if (path.isAbsolute(configPath)) {
      const url = pathToFileURL(configPath)
      url.searchParams.append('t', `${+Date.now()}`)
      importId = url.href
    } else if (configPath.startsWith('./') || configPath.startsWith('../')) {
      const resolved = path.resolve(configDir, configPath)
      const url = pathToFileURL(resolved)
      url.searchParams.append('t', `${+Date.now()}`)
      importId = url.href
    } else {
      importId = configPath
    }

    try {
      raw = await jiti.import(importId, { default: true })
    } catch (firstErr: any) {
      if (
        firstErr?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' &&
        !importId.startsWith('file:') &&
        /\.[jt]sx?$/.test(importId)
      ) {
        const withoutExt = importId.replace(/\.[jt]sx?$/, '')
        raw = await jiti.import(withoutExt, { default: true })
      } else {
        throw firstErr
      }
    }
  } catch (err) {
    console.warn(`[prettier-plugin-latte-tailwindcss] Failed to load class order config: ${configPath}`, err)
    return null
  }

  return parseClassOrderConfig(raw)
}

// ─── Resolver ───

/**
 * Resolve the user-provided `tailwindClassOrder` value into a ClassOrderContext.
 *
 * Dispatch:
 *  - Array → parse directly.
 *  - Non-empty string → treat as path and load via jiti.
 *  - undefined / empty or whitespace-only string → implicit default.
 *  - Anything else (object, number, boolean, null) → warn + default.
 *
 * Never throws; always returns a valid context so call-sites can unconditionally
 * run the bucket algorithm (single code-path).
 */
export async function resolveClassOrderConfig(value: unknown, configDir: string): Promise<ClassOrderContext> {
  if (Array.isArray(value)) {
    return parseClassOrderConfig(value) ?? defaultClassOrderContext()
  }

  if (typeof value === 'string') {
    if (value.trim() === '') {
      return defaultClassOrderContext()
    }
    const loaded = await loadClassOrderConfig(value, configDir)
    return loaded ?? defaultClassOrderContext()
  }

  if (value === undefined) {
    return defaultClassOrderContext()
  }

  console.warn(
    `[prettier-plugin-latte-tailwindcss] tailwindClassOrder: expected array or string path, got ${typeof value} — falling back to default`
  )
  return defaultClassOrderContext()
}

// ─── Bucket algorithm ───

/**
 * Greedy bucket-by-bucket sorter.
 *
 * For each bucket in order:
 *   1. Select entries from `remaining` that match the bucket.
 *   2. For `tailwind` buckets, sort the selection via the comparator.
 *      For `unknown` / `pattern` buckets, preserve input order (stable).
 *   3. Append selection to result; subtract it from remaining.
 *
 * Leftover (unmatched) entries go to the front or back based on `ctx.unspecified`.
 *
 * Generic over the entry shape so call-sites (`sortClassList`, `sortGroup`) can pass
 * their native representations (plain `[name, bigint]` tuples or richer objects)
 * without an adapter layer.
 *
 * @param entries    input list in original order
 * @param ctx        resolved class order context (buckets + unspecified)
 * @param nameOf     extracts the class name for regex matching
 * @param twBigintOf extracts the Tailwind bigint (null = unknown utility)
 * @param compareTailwind comparator used only inside the `tailwind` bucket;
 *                        callers guarantee both entries have non-null bigints
 */
export function applyBuckets<T>(
  entries: T[],
  ctx: ClassOrderContext,
  nameOf: (e: T) => string,
  twBigintOf: (e: T) => bigint | null,
  compareTailwind: (a: T, b: T) => number
): T[] {
  let remaining = entries.slice()
  const result: T[] = []

  for (const bucket of ctx.buckets) {
    if (bucket.kind === 'tailwind') {
      const matched = remaining.filter((e) => twBigintOf(e) !== null)
      matched.sort(compareTailwind)
      result.push(...matched)
      remaining = remaining.filter((e) => twBigintOf(e) === null)
    } else if (bucket.kind === 'unknown') {
      const matched = remaining.filter((e) => twBigintOf(e) === null)
      // stable — no sort
      result.push(...matched)
      remaining = remaining.filter((e) => twBigintOf(e) !== null)
    } else {
      // pattern
      const regex = bucket.regex!
      const matched = remaining.filter((e) => regex.test(nameOf(e)))
      // stable — no sort
      result.push(...matched)
      remaining = remaining.filter((e) => !regex.test(nameOf(e)))
    }
  }

  return ctx.unspecified === 'top' ? [...remaining, ...result] : [...result, ...remaining]
}
