import { describe, expect, it } from 'vitest'
import { defaultClassOrderContext } from '../src/class-order'
import { sortClasses, sortClassList } from '../src/sorting'
import type { TailwindContext } from '../src/types'

// Sort order: unknown(null) < flex(10) < block(20) < hidden(30)
// < w-5(100) < text-sm(200) < mt-1(300) < mb-2(310)
function mockContext(order: Record<string, bigint>): TailwindContext {
  return {
    getClassOrder: (classList: string[]) => classList.map((c): [string, bigint | null] => [c, order[c] ?? null]),
    classOrder: defaultClassOrderContext()
  }
}

const ctx = mockContext({
  flex: 10n,
  block: 20n,
  hidden: 30n,
  'w-5': 100n,
  'text-sm': 200n,
  'mt-1': 300n,
  'mb-2': 310n
})

// ─── sortClassList ───

describe('sortClassList', () => {
  it('unknown (null bigint) classes come first', () => {
    const result = sortClassList(['flex', 'custom', 'block'], ctx, true)
    expect(result.classList).toEqual(['custom', 'flex', 'block'])
  })

  it('sorts by ascending bigint order', () => {
    const result = sortClassList(['mt-1', 'flex', 'w-5'], ctx, true)
    expect(result.classList).toEqual(['flex', 'w-5', 'mt-1'])
  })

  it('dynamic placeholders "..." are bucketed as unknown (null bigint)', () => {
    // With the bucket algorithm, placeholders have null bigint → fall into the "unknown"
    // bucket in stable input order (Latte templates never produce such placeholders).
    const result = sortClassList(['flex', '...', 'custom'], ctx, true)
    expect(result.classList).toEqual(['...', 'custom', 'flex'])
  })

  it('removes duplicate known classes', () => {
    const result = sortClassList(['flex', 'block', 'flex'], ctx, true)
    expect(result.classList).toEqual(['flex', 'block'])
    expect(result.removedIndices.size).toBe(1)
  })

  it('keeps duplicate unknown classes (null order)', () => {
    const result = sortClassList(['custom', 'flex', 'custom'], ctx, true)
    // Unknown classes (null) are not deduplicated
    expect(result.classList).toEqual(['custom', 'custom', 'flex'])
    expect(result.removedIndices.size).toBe(0)
  })

  it('preserves duplicates when removeDuplicates is false', () => {
    const result = sortClassList(['flex', 'block', 'flex'], ctx, false)
    expect(result.classList).toEqual(['flex', 'flex', 'block'])
    expect(result.removedIndices.size).toBe(0)
  })
})

// ─── sortClasses ───

describe('sortClasses', () => {
  it('sorts space-separated class string', () => {
    expect(sortClasses('mt-1 flex w-5', ctx)).toBe('flex w-5 mt-1')
  })

  it('returns unchanged when context is null', () => {
    expect(sortClasses('mt-1 flex', null)).toBe('mt-1 flex')
  })

  it('returns empty string unchanged', () => {
    expect(sortClasses('', ctx)).toBe('')
  })

  it('normalizes whitespace-only string to single space', () => {
    expect(sortClasses('  \t\n  ', ctx)).toBe(' ')
  })

  it('preserves whitespace-only string when preserveWhitespace is set', () => {
    expect(sortClasses('  \t  ', ctx, { preserveWhitespace: true })).toBe('  \t  ')
  })

  it('skips strings containing Latte expressions (curly braces)', () => {
    const input = '{$var} flex mt-1'
    expect(sortClasses(input, ctx)).toBe(input)
  })

  it('collapses multi-space separators by default', () => {
    expect(sortClasses('mt-1   flex', ctx)).toBe('flex mt-1')
  })

  it('preserves original whitespace separators when preserveWhitespace is set', () => {
    expect(sortClasses('mt-1  flex', ctx, { preserveWhitespace: true })).toBe('flex  mt-1')
  })

  it('removes duplicate classes by default', () => {
    expect(sortClasses('flex mt-1 flex', ctx)).toBe('flex mt-1')
  })

  it('preserves duplicate classes when removeDuplicates is false', () => {
    expect(sortClasses('flex mt-1 flex', ctx, { removeDuplicates: false })).toBe('flex flex mt-1')
  })

  it('handles single class', () => {
    expect(sortClasses('flex', ctx)).toBe('flex')
  })

  it('strips trailing whitespace when preserveWhitespace is false', () => {
    expect(sortClasses('mt-1 flex ', ctx)).toBe('flex mt-1')
  })

  it('preserves trailing whitespace when preserveWhitespace is true', () => {
    expect(sortClasses('mt-1 flex ', ctx, { preserveWhitespace: true })).toBe('flex mt-1 ')
  })

  it('treats newlines as barriers when preserveWhitespace is set', () => {
    expect(sortClasses('mt-1 flex\n  block w-5', ctx, { preserveWhitespace: true })).toBe('flex mt-1\n  block w-5')
  })
})
