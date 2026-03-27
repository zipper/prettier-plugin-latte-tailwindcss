import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { preprocessLatte, restorePlaceholders } from '../src/preprocess'
import { transformAst } from '../src/transform'
import type { TailwindContext, TransformerEnv } from '../src/types'

// Alphabetical mock context — deterministic sorting without real Tailwind v4.
// Each class gets a bigint based on its sorted position.
function createAlphabeticalContext(): TailwindContext {
  return {
    getClassOrder: (classList: string[]) => {
      const sorted = [...classList].sort()
      return classList.map((cls): [string, bigint | null] => {
        const idx = sorted.indexOf(cls)
        return [cls, BigInt(idx)]
      })
    },
  }
}

const ctx = createAlphabeticalContext()
const fixturesDir = path.resolve(__dirname, 'fixtures')

/**
 * Simulate the full plugin pipeline:
 *   1. preprocess — replace Latte constructs with placeholders
 *   2. parse with HTML parser (via prettier/plugins/html)
 *   3. transform — sort classes and restore placeholders
 *   4. print with HTML printer
 *
 * Since Prettier's plugin loading can't handle .ts files directly,
 * we replicate the pipeline by importing functions directly and using
 * prettier.format with the built-in HTML parser for parse+print steps.
 */
async function formatLatte(input: string): Promise<string> {
  const prettier = await import('prettier')
  const html = await import('prettier/plugins/html')

  // Step 1: Latte preprocess
  const { code: processed, map } = preprocessLatte(input)

  // Step 2+4: Parse as HTML and print — hook transform between parse and print.
  const testPlugin = {
    languages: [
      {
        name: 'Latte',
        parsers: ['latte-test'],
        extensions: ['.latte'],
      },
    ],
    parsers: {
      'latte-test': {
        ...html.parsers.html,
        astFormat: 'html' as const,
        async parse(code: string, parserOptions: any) {
          const ast = await html.parsers.html.parse(processed, parserOptions)

          const env: TransformerEnv = {
            context: ctx,
            options: {
              ...parserOptions,
              tailwindPreserveWhitespace: false,
              tailwindPreserveDuplicates: false,
              tailwindNclassWhitespace: 'normalize-barriers' as const,
            },
          }

          transformAst(ast, env, map)
          return ast
        },
      },
    },
    printers: {},
  }

  return prettier.format(input, {
    parser: 'latte-test',
    plugins: [testPlugin as any],
    htmlWhitespaceSensitivity: 'ignore',
    printWidth: 200,
    singleAttributePerLine: false,
  })
}

// ─── Fixture-based integration tests ───

// Fixtures that support full idempotence testing (no unquoted array class syntax)
const idempotentFixtures = ['basic', 'nclass', 'mixed'] as const

// Fixtures that only support single-pass formatting (array class uses unquoted
// attribute values that get quoted by HTML printer, breaking re-parse)
const formatOnlyFixtures = ['array-class'] as const

for (const category of idempotentFixtures) {
  describe(`integration — ${category}`, () => {
    const inputPath = path.join(fixturesDir, category, 'input.latte')
    const snapshotPath = path.join(fixturesDir, category, 'output.latte')

    it('formats input and matches snapshot', async () => {
      const input = fs.readFileSync(inputPath, 'utf-8')
      const result = await formatLatte(input)

      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')

      await expect(result).toMatchFileSnapshot(snapshotPath)
    })

    it('is idempotent (formatting twice produces same result)', async () => {
      const input = fs.readFileSync(inputPath, 'utf-8')
      const once = await formatLatte(input)
      const twice = await formatLatte(once)
      expect(twice).toBe(once)
    })
  })
}

for (const category of formatOnlyFixtures) {
  describe(`integration — ${category}`, () => {
    const inputPath = path.join(fixturesDir, category, 'input.latte')
    const snapshotPath = path.join(fixturesDir, category, 'output.latte')

    it('formats input and matches snapshot', async () => {
      const input = fs.readFileSync(inputPath, 'utf-8')
      const result = await formatLatte(input)

      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')

      await expect(result).toMatchFileSnapshot(snapshotPath)
    })

    // Array class uses unquoted attribute values class={[...]}.
    // After HTML printer quotes them, the ={[ pattern is lost on re-parse.
    // Idempotence for array class is verified at the unit level in array-class.test.ts.
  })
}

// ─── Additional idempotence tests with inline inputs ───

describe('idempotence — inline inputs', () => {
  const cases: [string, string][] = [
    ['simple class attr', '<div class="mt-4 flex block">hello</div>\n'],
    ['n:class', `<span n:class="'mt-4', 'flex', 'block'">text</span>\n`],
    ['class with Latte expression', '<a href="{link Home:}" class="mt-4 flex">link</a>\n'],
    ['mixed attrs', `<div class="mt-4 flex" n:class="'block', 'hidden'">mixed</div>\n`],
    ['empty class', '<div class="">empty</div>\n'],
    ['single class', '<div class="flex">single</div>\n'],
  ]

  for (const [name, input] of cases) {
    it(`idempotent: ${name}`, async () => {
      const once = await formatLatte(input)
      const twice = await formatLatte(once)
      expect(twice).toBe(once)
    })
  }
})
