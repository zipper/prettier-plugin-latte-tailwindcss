import type { Plugin } from 'prettier'
import { sortArrayClassValue } from './array-class'
import { applyClassRegex, resolveClassRegexPatterns } from './class-regex'
import { extractClassAttributes } from './extract'
import { sortNClassValue } from './nclass'
import { options as pluginOptions } from './options'
import { preprocessLatte, restorePlaceholders } from './preprocess'
import type { LatteAstNode } from './printer'
import { printer } from './printer'
import { sortClasses } from './sorting'
import { loadTailwindContext } from './tailwind'
import type { LatteOptions, TailwindContext } from './types'

export { pluginOptions as options }

export const languages = [
  {
    name: 'Latte',
    parsers: ['latte'],
    extensions: ['.latte'],
    vscodeLanguageIds: ['latte'],
    linguistLanguageId: 196,
  },
]

export const parsers: Plugin['parsers'] = {
  latte: {
    astFormat: 'latte-ast',

    async parse(code: string, parserOptions) {
      const opts = parserOptions as typeof parserOptions & LatteOptions

      const ctx = await loadTailwindContext(
        opts.tailwindStylesheet,
        parserOptions.filepath ?? '',
        opts.tailwindPropertyOrder || undefined,
      )

      // Pass 1: classRegex on original text (before preprocess)
      const classRegexPatterns = resolveClassRegexPatterns(
        (opts as any).tailwindClassRegex,
        parserOptions.filepath ?? '',
      )
      let text = code
      if (classRegexPatterns.length > 0 && ctx) {
        text = applyClassRegex(text, classRegexPatterns, (classes) =>
          sortClasses(classes, ctx, {
            removeDuplicates: !opts.tailwindPreserveDuplicates,
            preserveWhitespace: opts.tailwindPreserveWhitespace,
          }),
        )
      }

      // Pass 2: preprocess Latte → placeholders, extract HTML attributes, sort, replace
      const { code: processed, map } = preprocessLatte(text)
      const matches = extractClassAttributes(processed, opts.tailwindAttributes ?? [])

      let result = processed
      if (ctx) {
        result = applyClassMatches(result, matches, ctx, opts)
      }

      // Restore placeholders
      result = restorePlaceholders(result, map)

      return { body: result } satisfies LatteAstNode
    },

    locStart: () => 0,
    locEnd: (node: any) => (node as LatteAstNode).body.length,
  },
}

export const printers: Plugin['printers'] = {
  'latte-ast': printer as any,
}

/**
 * Apply sorting to extracted class matches, replacing values in the processed text.
 * Applies from end to start to preserve offsets.
 */
function applyClassMatches(
  code: string,
  matches: import('./extract').ClassMatch[],
  ctx: TailwindContext,
  opts: LatteOptions,
): string {
  // Sort matches by offset descending so replacements don't shift earlier offsets
  const sorted = [...matches].sort((a, b) => b.offset - a.offset)

  let result = code
  for (const match of sorted) {
    let replacement: string

    switch (match.type) {
      case 'class':
        replacement = sortClasses(match.value, ctx, {
          removeDuplicates: !opts.tailwindPreserveDuplicates,
          preserveWhitespace: opts.tailwindPreserveWhitespace,
        })
        break

      case 'n:class':
        replacement = sortNClassValue(match.value, ctx, opts)
        break

      case 'array-class': {
        const sortFn = (classes: string) =>
          sortClasses(classes, ctx, {
            removeDuplicates: false,
            preserveWhitespace: false,
          })
        replacement = sortArrayClassValue(match.value, sortFn)
        break
      }

      case 'tailwind-attribute':
        replacement = sortClasses(match.value, ctx, {
          removeDuplicates: !opts.tailwindPreserveDuplicates,
          preserveWhitespace: opts.tailwindPreserveWhitespace,
        })
        break

      default:
        continue
    }

    if (replacement !== match.value) {
      result =
        result.slice(0, match.offset) +
        replacement +
        result.slice(match.offset + match.length)
    }
  }

  return result
}
