import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'

// ─── Types ───

/** AST node from candidatesToAst — minimal subset we need */
interface AstNode {
  kind: string
  property?: string
  nodes?: AstNode[]
}

/** Parsed candidate from parseCandidate */
interface Candidate {
  root: string
  variants: Variant[]
  important: boolean
}

/** Variant reference — opaque object used as Map key in getVariantOrder */
interface Variant {
  kind: string
  name?: string
}

/** Variant entry from getVariants */
interface VariantEntry {
  name: string
}

/** Methods from TW4 DesignSystem needed for property ordering */
export interface DesignSystemForPropertyOrder {
  candidatesToAst(classes: string[]): AstNode[][]
  parseCandidate(candidate: string): readonly Candidate[]
  getVariantOrder(): Map<Variant, number>
  getVariants(): VariantEntry[]
}

/** Resolved property order context attached to TailwindContext */
export interface PropertyOrderContext {
  /** CSS property → position index */
  propertyOrderMap: Map<string, number>
  /** Where unspecified properties go */
  unspecified: 'top' | 'bottom' | 'bottomAlphabetical' | 'ignore'
  /** Variant → sort order (populated from TW4 design system) */
  variantOrderMap: Map<Variant, number>
  /** Design system methods */
  ds: DesignSystemForPropertyOrder
  /** Cache: className → { variantKey, propIndex } */
  classInfoCache: Map<string, ClassSortInfo>
}

export interface ClassSortInfo {
  variantKey: number
  propIndex: number
}

// ─── Config loading ───

/**
 * Load and parse a property order config file.
 * Supports:
 * - Flat array of CSS property names
 * - Array of objects with { properties: [...] } (stylelint-order grouped format)
 * - Mixed arrays of strings and objects
 * - Full stylelint config with rules['order/properties-order']
 *
 * Returns null on error (with console.warn).
 */
export async function loadPropertyOrderConfig(
  configPath: string,
  configDir: string,
): Promise<{ properties: string[]; unspecified: string } | null> {
  let raw: unknown
  try {
    // Create jiti rooted at configDir so bare specifiers (npm packages) resolve from the project
    const jiti = createJiti(path.join(configDir, '__placeholder__.js'), { moduleCache: false, fsCache: false })

    let importId: string
    if (path.isAbsolute(configPath)) {
      // Absolute path → use file URL
      const url = pathToFileURL(configPath)
      url.searchParams.append('t', `${+Date.now()}`)
      importId = url.href
    } else if (configPath.startsWith('./') || configPath.startsWith('../')) {
      // Relative path → resolve from configDir
      const resolved = path.resolve(configDir, configPath)
      const url = pathToFileURL(resolved)
      url.searchParams.append('t', `${+Date.now()}`)
      importId = url.href
    } else {
      // Bare specifier (npm package) → let jiti resolve from configDir
      importId = configPath
    }

    try {
      raw = await jiti.import(importId, { default: true })
    } catch (firstErr: any) {
      // If bare specifier with .js/.ts extension fails due to exports, retry without extension
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
    console.warn(
      `[prettier-plugin-latte-tailwind] Failed to load property order config: ${configPath}`,
      err,
    )
    return null
  }

  return parsePropertyOrderConfig(raw)
}

/**
 * Parse raw export into a flat property list + unspecified setting.
 */
export function parsePropertyOrderConfig(
  raw: unknown,
): { properties: string[]; unspecified: string } | null {
  // If it's a stylelint config object with rules
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>

    // Check for rules['order/properties-order']
    if (obj.rules && typeof obj.rules === 'object') {
      const rules = obj.rules as Record<string, unknown>
      const propOrder = rules['order/properties-order']
      if (propOrder) {
        return parsePropertiesOrderRule(propOrder)
      }
    }

    // Check for direct 'order/properties-order' key (flat config)
    const directOrder = obj['order/properties-order']
    if (directOrder) {
      return parsePropertiesOrderRule(directOrder)
    }

    console.warn('[prettier-plugin-latte-tailwind] Property order config is not a recognized format')
    return null
  }

  // Direct array — treat as the properties-order value
  if (Array.isArray(raw)) {
    return parsePropertiesOrderRule(raw)
  }

  console.warn('[prettier-plugin-latte-tailwind] Property order config is not a recognized format')
  return null
}

/**
 * Parse the value of order/properties-order rule.
 * Format: [items, secondaryOptions?] where items is an array of strings/objects.
 */
function parsePropertiesOrderRule(
  value: unknown,
): { properties: string[]; unspecified: string } | null {
  if (!Array.isArray(value)) {
    console.warn('[prettier-plugin-latte-tailwind] properties-order must be an array')
    return null
  }

  // Detect format: if last element is a plain object with 'unspecified' or 'severity',
  // it's the secondary options — remaining elements are items
  let items: unknown[]
  let unspecified = 'bottom'

  // stylelint-order format: [[...items], { unspecified, severity }]
  // OR just [...items] (flat array of strings/objects)
  if (
    value.length === 2 &&
    Array.isArray(value[0]) &&
    value[1] &&
    typeof value[1] === 'object' &&
    !Array.isArray(value[1])
  ) {
    // Format: [[items...], {secondaryOptions}]
    items = value[0] as unknown[]
    const opts = value[1] as Record<string, unknown>
    if (typeof opts.unspecified === 'string') {
      unspecified = opts.unspecified
    }
  } else {
    // Flat array — all elements are items (strings or group objects)
    items = value
  }

  const properties = flattenPropertyItems(items)

  if (properties.length === 0) {
    console.warn('[prettier-plugin-latte-tailwind] Property order config contains no properties')
    return null
  }

  return { properties, unspecified }
}

/**
 * Flatten items array into a flat list of CSS property names.
 * Items can be strings or objects with { properties: [...] }.
 */
function flattenPropertyItems(items: unknown[]): string[] {
  const result: string[] = []

  for (const item of items) {
    if (typeof item === 'string') {
      result.push(item)
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>
      if (Array.isArray(obj.properties)) {
        for (const prop of obj.properties) {
          if (typeof prop === 'string') {
            result.push(prop)
          }
        }
      }
    }
    // Skip secondary options objects (have 'unspecified' or 'severity' but no 'properties')
  }

  return result
}

// ─── PropertyOrderContext creation ───

/**
 * Create a PropertyOrderContext from parsed config and TW4 design system.
 */
export function createPropertyOrderContext(
  config: { properties: string[]; unspecified: string },
  ds: DesignSystemForPropertyOrder,
): PropertyOrderContext {
  // Build property → index map
  const propertyOrderMap = new Map<string, number>()
  for (let i = 0; i < config.properties.length; i++) {
    if (!propertyOrderMap.has(config.properties[i])) {
      propertyOrderMap.set(config.properties[i], i)
    }
  }

  // Populate variant order map via dummy compilation
  const variants = ds.getVariants()
  if (variants.length > 0) {
    ds.candidatesToAst(variants.map(v => `${v.name}:flex`))
  }
  const variantOrderMap = ds.getVariantOrder()

  const unspecified = (['top', 'bottom', 'bottomAlphabetical', 'ignore'].includes(config.unspecified)
    ? config.unspecified
    : 'bottom') as PropertyOrderContext['unspecified']

  return {
    propertyOrderMap,
    unspecified,
    variantOrderMap,
    ds,
    classInfoCache: new Map(),
  }
}

// ─── CSS property extraction from AST ───

/**
 * Extract the primary CSS property from candidatesToAst output.
 * Recursively traverses nested rules (@media, @supports).
 * Skips custom properties (--tw-*).
 * Returns null if no property found.
 */
export function extractPrimaryProperty(astGroups: AstNode[][]): string | null {
  for (const group of astGroups) {
    const prop = findPropertyInNodes(group)
    if (prop) return prop
  }
  return null
}

function findPropertyInNodes(nodes: AstNode[]): string | null {
  for (const node of nodes) {
    // Declaration node — check if it's a real CSS property (not --tw-*)
    if (node.kind === 'declaration' && node.property) {
      if (!node.property.startsWith('--tw-')) {
        return node.property
      }
    }

    // Rule node (at-rule like @media, @supports) — recurse into children
    if (node.nodes && node.nodes.length > 0) {
      const found = findPropertyInNodes(node.nodes)
      if (found) return found
    }
  }
  return null
}

// ─── Variant key computation ───

/**
 * Compute a numeric sort key from a class's variants.
 * Classes without variants get -1 (sort first).
 * Multi-variant classes encode variant orders as a composite key.
 */
export function computeVariantKey(
  variants: readonly Variant[],
  variantOrderMap: Map<Variant, number>,
): number {
  if (variants.length === 0) return -1

  // Sort variant orders for consistent key regardless of order (md:hover == hover:md)
  const orders = variants.map(v => {
    const order = variantOrderMap.get(v)
    // Arbitrary variants (not in map) get high order
    return order ?? 9998
  }).sort((a, b) => a - b)

  // Encode as composite number
  let key = 0
  for (const o of orders) {
    key = key * 10000 + o
  }
  return key
}

// ─── Class info resolution ───

/**
 * Get or compute sort info for a class name.
 * Uses cache on PropertyOrderContext.
 */
export function getClassSortInfo(
  className: string,
  ctx: PropertyOrderContext,
): ClassSortInfo {
  const cached = ctx.classInfoCache.get(className)
  if (cached) return cached

  const info = computeClassSortInfo(className, ctx)
  ctx.classInfoCache.set(className, info)
  return info
}

function computeClassSortInfo(
  className: string,
  ctx: PropertyOrderContext,
): ClassSortInfo {
  // Parse candidate to extract variants
  const candidates = ctx.ds.parseCandidate(className)
  const candidate = candidates[0] as Candidate | undefined

  let variantKey = -1
  if (candidate && candidate.variants && candidate.variants.length > 0) {
    variantKey = computeVariantKey(candidate.variants, ctx.variantOrderMap)
  }

  // Get primary CSS property from AST
  let propIndex: number
  try {
    const ast = ctx.ds.candidatesToAst([className])
    const primaryProp = extractPrimaryProperty(ast)

    if (primaryProp !== null) {
      const idx = ctx.propertyOrderMap.get(primaryProp)
      if (idx !== undefined) {
        propIndex = idx
      } else {
        // Property not in user's order config → use unspecified position
        propIndex = getUnspecifiedIndex(primaryProp, ctx)
      }
    } else {
      // No CSS output → treat as unspecified
      propIndex = getUnspecifiedIndex(null, ctx)
    }
  } catch {
    propIndex = getUnspecifiedIndex(null, ctx)
  }

  return { variantKey, propIndex }
}

// Large sentinel for "bottom" positioning
const UNSPECIFIED_BOTTOM = 999_000

function getUnspecifiedIndex(
  propertyName: string | null,
  ctx: PropertyOrderContext,
): number {
  switch (ctx.unspecified) {
    case 'top':
      return -1
    case 'bottom':
      return UNSPECIFIED_BOTTOM
    case 'bottomAlphabetical':
      // Bottom + alphabetical tiebreaker via char codes
      if (propertyName) {
        let hash = UNSPECIFIED_BOTTOM
        for (let i = 0; i < Math.min(propertyName.length, 20); i++) {
          hash += propertyName.charCodeAt(i) / (256 ** (i + 1))
        }
        return hash
      }
      return UNSPECIFIED_BOTTOM + 0.5
    case 'ignore':
      // Use TW ordering — signal with a special value that sorting.ts checks
      return -2 // Special: means "use TW bigint as propIndex tiebreaker"
    default:
      return UNSPECIFIED_BOTTOM
  }
}

/** Sentinel value for 'ignore' mode — sorting.ts checks for this */
export const UNSPECIFIED_IGNORE = -2
