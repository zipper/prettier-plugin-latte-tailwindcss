import type { ClassOrderContext } from './class-order'
import type { PropertyOrderContext } from './property-order'

/** Tailwind context — wraps getClassOrder from @tailwindcss/node */
export interface TailwindContext {
  getClassOrder(classList: string[]): [string, bigint | null][]
  /** Custom property ordering context (opt-in, null = use default TW order) */
  propertyOrder?: PropertyOrderContext
  /** Class order bucket context (always present; default = unknown → tailwind, unspecified: 'top') */
  classOrder: ClassOrderContext
}

/** Plugin-specific options declared in options.ts */
export interface LatteOptions {
  tailwindStylesheet?: string
  tailwindAttributes?: string[]
  tailwindPreserveWhitespace?: boolean
  tailwindPreserveDuplicates?: boolean
  /** JSON array of classRegex patterns for sorting classes in arbitrary contexts */
  tailwindClassRegex?: string
  /** Path to a JS/JSON file with stylelint-order compatible property order config */
  tailwindPropertyOrder?: string
  /** Class ordering buckets: either an inline array or a path to a JS/JSON config file */
  tailwindClassOrder?: string | unknown[]
  /** Controls how whitespace separators between n:class tokens are handled when tokens are reordered */
  tailwindNclassWhitespace?: 'preserve' | 'normalize-barriers' | 'normalize'
}

/** Placeholder map: placeholder token → original Latte expression */
export type PlaceholderMap = Map<string, string>

/** Result returned by preprocessLatte() */
export interface PreprocessResult {
  code: string
  map: PlaceholderMap
}
