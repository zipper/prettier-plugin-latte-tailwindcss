import type { ParserOptions } from 'prettier'

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
  /** Controls how whitespace separators between n:class tokens are handled when tokens are reordered */
  tailwindNclassWhitespace?: 'preserve' | 'normalize-barriers' | 'normalize'
}

/** Environment passed to transformation functions */
export interface TransformerEnv {
  context: TailwindContext | null
  options: ParserOptions & LatteOptions
}

/** Placeholder map: placeholder token → original Latte expression */
export type PlaceholderMap = Map<string, string>

/** Result returned by preprocessLatte() */
export interface PreprocessResult {
  code: string
  map: PlaceholderMap
}
