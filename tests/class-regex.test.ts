import { describe, expect, it, vi } from 'vitest'
import { applyClassRegex, parseClassRegexPatterns } from '../src/class-regex'

/** Simple alphabetical sort mock */
const sortFn = (classes: string): string => classes.split(' ').sort().join(' ')

// ─── parseClassRegexPatterns ───

describe('parseClassRegexPatterns', () => {
  it('parses empty array', () => {
    expect(parseClassRegexPatterns('[]')).toEqual([])
  })

  it('warns and returns empty on invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = parseClassRegexPatterns('not json')
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalledWith('prettier-plugin-latte-tailwind: Invalid tailwindClassRegex JSON')
    warn.mockRestore()
  })

  it('skips invalid regex and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Invalid regex: unbalanced group
    const result = parseClassRegexPatterns('["(unclosed"]')
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ─── applyClassRegex ───

describe('applyClassRegex', () => {
  it('returns code unchanged for empty patterns', () => {
    const patterns = parseClassRegexPatterns('[]')
    expect(applyClassRegex('hello world', patterns, sortFn)).toBe('hello world')
  })

  it('returns code unchanged for invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const patterns = parseClassRegexPatterns('{bad}')
    expect(applyClassRegex('hello world', patterns, sortFn)).toBe('hello world')
    warn.mockRestore()
  })

  it('simple pattern — single match', () => {
    const code = '$classes = "mt-2 flex block";'
    const patterns = parseClassRegexPatterns('["\\"([^\\"]+)\\""]')
    const result = applyClassRegex(code, patterns, sortFn)
    expect(result).toBe('$classes = "block flex mt-2";')
  })

  it('simple pattern — multiple matches (global)', () => {
    const code = 'a="mt-2 flex" b="z-10 block"'
    const patterns = parseClassRegexPatterns('["\\"([^\\"]+)\\""]')
    const result = applyClassRegex(code, patterns, sortFn)
    expect(result).toBe('a="flex mt-2" b="block z-10"')
  })

  it('tuple pattern — outer+inner', () => {
    const code = 'clsx("mt-2 flex block")'
    // outer captures clsx(...), inner captures string content
    const patterns = parseClassRegexPatterns('[["clsx\\\\(([^)]+)\\\\)", "\\"([^\\"]+)\\"" ]]')
    const result = applyClassRegex(code, patterns, sortFn)
    expect(result).toBe('clsx("block flex mt-2")')
  })

  it('tuple pattern — multiple inner matches in one outer', () => {
    const code = 'clsx("mt-2 flex", "z-10 block")'
    const patterns = parseClassRegexPatterns('[["clsx\\\\(([^)]+)\\\\)", "\\"([^\\"]+)\\"" ]]')
    const result = applyClassRegex(code, patterns, sortFn)
    expect(result).toBe('clsx("flex mt-2", "block z-10")')
  })

  it('combination of simple + tuple patterns', () => {
    const code = 'cls="mt-2 flex" clsx("z-10 block")'
    const json = JSON.stringify([
      '"([^"]+)"',
      ['clsx\\(([^)]+)\\)', '"([^"]+)"'],
    ])
    const patterns = parseClassRegexPatterns(json)
    const result = applyClassRegex(code, patterns, sortFn)
    // Simple pattern sorts both quoted strings, tuple pattern also targets clsx content
    expect(result).toBe('cls="flex mt-2" clsx("block z-10")')
  })

  it('pattern without capture group — skip', () => {
    const code = 'hello world'
    // Regex matches but has no capture group
    const patterns = parseClassRegexPatterns('["hello"]')
    const result = applyClassRegex(code, patterns, sortFn)
    expect(result).toBe('hello world')
  })

  it('multiline match (dotAll flag)', () => {
    const code = `$x = "mt-2\nflex\nblock";`
    // dotAll flag allows . to match newlines; use whitespace-aware sort
    const multiSortFn = (classes: string): string =>
      classes.split(/\s+/).sort().join(' ')
    const patterns = parseClassRegexPatterns('["\\"([^\\"]+)\\""]')
    const result = applyClassRegex(code, patterns, multiSortFn)
    expect(result).toBe('$x = "block flex mt-2";')
  })
})
