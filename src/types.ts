/** Tailwind context — wraps getClassOrder from @tailwindcss/node */
export interface TailwindContext {
  getClassOrder(classList: string[]): [string, bigint | null][]
}

/** Plugin-specific options declared in options.ts */
export interface LatteOptions {
  tailwindStylesheet?: string
  tailwindAttributes?: string[]
  tailwindPreserveWhitespace?: boolean
  tailwindPreserveDuplicates?: boolean
  /** JSON array of classRegex patterns for sorting classes in arbitrary contexts */
  tailwindClassRegex?: string
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
