import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { extractClassAttributes } from '../src/extract'
import { preprocessLatte, restorePlaceholders } from '../src/preprocess'
import { sortClasses } from '../src/sorting'
import { sortNClassValue } from '../src/nclass'
import { sortArrayClassValue } from '../src/array-class'
import type { TailwindContext, LatteOptions } from '../src/types'

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

const defaultOpts: LatteOptions = {
  tailwindPreserveWhitespace: false,
  tailwindPreserveDuplicates: false,
  tailwindNclassWhitespace: 'normalize-barriers',
}

/**
 * Simulate the full text-based plugin pipeline:
 *   1. preprocess — replace Latte constructs with placeholders
 *   2. extract — find class attributes in preprocessed text
 *   3. sort — sort class values
 *   4. restore — replace placeholders back
 *
 * This matches the actual plugin flow in index.ts.
 */
function formatLatte(input: string): string {
  // Step 1: Latte preprocess
  const { code: processed, map } = preprocessLatte(input)

  // Step 2: Extract class attributes
  const matches = extractClassAttributes(processed, [])

  // Step 3: Sort — apply from end to start to preserve offsets
  const sorted = [...matches].sort((a, b) => b.offset - a.offset)
  let result = processed

  for (const match of sorted) {
    let replacement: string

    switch (match.type) {
      case 'class':
        replacement = sortClasses(match.value, ctx, {
          removeDuplicates: !defaultOpts.tailwindPreserveDuplicates,
          preserveWhitespace: defaultOpts.tailwindPreserveWhitespace,
        })
        break

      case 'n:class':
        replacement = sortNClassValue(match.value, ctx, defaultOpts)
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
          removeDuplicates: !defaultOpts.tailwindPreserveDuplicates,
          preserveWhitespace: defaultOpts.tailwindPreserveWhitespace,
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

  // Step 4: Restore placeholders
  return restorePlaceholders(result, map)
}

// ─── Fixture-based integration tests ───

// All fixtures support idempotence with text-based processing
// (no HTML printer to mangle unquoted attributes)
const fixtures = ['basic', 'nclass', 'mixed', 'array-class'] as const

for (const category of fixtures) {
  describe(`integration — ${category}`, () => {
    const inputPath = path.join(fixturesDir, category, 'input.latte')
    const snapshotPath = path.join(fixturesDir, category, 'output.latte')

    it('formats input and matches snapshot', async () => {
      const input = fs.readFileSync(inputPath, 'utf-8')
      const result = formatLatte(input)

      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')

      await expect(result).toMatchFileSnapshot(snapshotPath)
    })

    it('is idempotent (formatting twice produces same result)', () => {
      const input = fs.readFileSync(inputPath, 'utf-8')
      const once = formatLatte(input)
      const twice = formatLatte(once)
      expect(twice).toBe(once)
    })
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
    it(`idempotent: ${name}`, () => {
      const once = formatLatte(input)
      const twice = formatLatte(once)
      expect(twice).toBe(once)
    })
  }
})
