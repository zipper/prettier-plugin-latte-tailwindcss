import type { Plugin } from 'prettier'
import { options as pluginOptions } from './options'
import { preprocessLatte } from './preprocess'
import { loadTailwindContext } from './tailwind'
import type { LatteOptions } from './types'
import { transformAst } from './transform'

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
    astFormat: 'html',

    async preprocess(code: string, parserOptions) {
      // Delegate BOM and line-ending normalisation to the HTML parser
      const html = await import('prettier/plugins/html')
      return html.parsers.html.preprocess?.(code, parserOptions) ?? code
    },

    async parse(code: string, parserOptions) {
      const opts = parserOptions as typeof parserOptions & LatteOptions

      const { code: processed, map } = preprocessLatte(code)

      const html = await import('prettier/plugins/html')
      const ast = await html.parsers.html.parse(processed, parserOptions)

      const ctx = await loadTailwindContext(
        opts.tailwindStylesheet,
        parserOptions.filepath ?? '',
      )

      transformAst(ast, { context: ctx, options: opts }, map)

      return ast
    },

    locStart: (node: any) => node.sourceSpan?.start?.offset ?? 0,
    locEnd: (node: any) => node.sourceSpan?.end?.offset ?? 0,
  },
}

// Empty printers — Prettier uses the built-in HTML printer
export const printers = {}
