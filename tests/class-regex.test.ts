import { describe, expect, it, vi } from 'vitest'
import { applyClassRegex, parseClassRegexPatterns, _isUnsafePattern } from '../src/class-regex'

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
    expect(warn).toHaveBeenCalledWith('prettier-plugin-latte-tailwindcss: Invalid tailwindClassRegex JSON')
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
    const json = JSON.stringify(['"([^"]+)"', ['clsx\\(([^)]+)\\)', '"([^"]+)"']])
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
    const multiSortFn = (classes: string): string => classes.split(/\s+/).sort().join(' ')
    const patterns = parseClassRegexPatterns('["\\"([^\\"]+)\\""]')
    const result = applyClassRegex(code, patterns, multiSortFn)
    expect(result).toBe('$x = "block flex mt-2";')
  })
})

// ─── isUnsafePattern ───

describe('isUnsafePattern', () => {
  it('detects [\\s\\S]* as unsafe', () => {
    expect(_isUnsafePattern(String.raw`[\s\S]*`)).toBe(true)
    expect(_isUnsafePattern(String.raw`n:class=["']([\s\S]*)["']`)).toBe(true)
  })

  it('detects [\\S\\s]* as unsafe', () => {
    expect(_isUnsafePattern(String.raw`[\S\s]*`)).toBe(true)
  })

  it('detects \\$(?:.*) as unsafe', () => {
    expect(_isUnsafePattern(String.raw`\$(?:.*)[cC]lass`)).toBe(true)
  })

  it('detects \\$(.*) as unsafe', () => {
    expect(_isUnsafePattern(String.raw`\$(.*)[cC]lass`)).toBe(true)
  })

  it('allows safe patterns', () => {
    expect(_isUnsafePattern(String.raw`[cC]lass:\s*?["'` + '`' + String.raw`]([^"'` + '`' + String.raw`]*)`)).toBe(
      false
    )
    expect(_isUnsafePattern(String.raw`n:class="([^"]*)"`)).toBe(false)
    expect(
      _isUnsafePattern(String.raw`\$\w*[cC]lass\w*\s*=\s*["'` + '`' + String.raw`]([^"'` + '`' + String.raw`]*)`)
    ).toBe(false)
  })
})

// ─── dangerous pattern handling ───

describe('dangerous pattern handling', () => {
  it('warns and skips patterns with [\\s\\S]*', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const patterns = parseClassRegexPatterns(
      JSON.stringify([
        String.raw`n:class=["']([\s\S]*)["']`,
        '"([^"]*)"' // safe pattern
      ])
    )
    expect(patterns).toHaveLength(1) // only safe pattern kept
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipping dangerous classRegex'))
    warn.mockRestore()
  })

  it('warns and skips patterns with \\$(?:.*)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const patterns = parseClassRegexPatterns(
      JSON.stringify([String.raw`\$(?:.*)[cC]lass(?:Name)?\s*?=\s*?["']([^"']*)`])
    )
    expect(patterns).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('also skips unsafe tuple outer patterns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const patterns = parseClassRegexPatterns(
      JSON.stringify([
        [
          String.raw`n:class=["']([\s\S]*)["']`,
          String.raw`["'` + '`' + String.raw`]([^"'` + '`' + String.raw`]*)["'` + '`]'
        ]
      ])
    )
    expect(patterns).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ─── runtime capture safety ───

describe('capture safety (runtime)', () => {
  it('skips capture groups containing HTML tags', () => {
    // A greedy pattern that accidentally captures HTML structure
    const code = 'class="flex mt-2 <div> block"'
    const patterns = parseClassRegexPatterns(JSON.stringify(['"([^"]*)"']))
    const result = applyClassRegex(code, patterns, sortFn)
    // Should NOT sort because capture contains <div>
    expect(result).toBe(code)
  })

  it('skips capture groups containing Latte brackets', () => {
    const code = 'class="flex {$var} mt-2"'
    const patterns = parseClassRegexPatterns(JSON.stringify(['"([^"]*)"']))
    const result = applyClassRegex(code, patterns, sortFn)
    expect(result).toBe(code)
  })

  it('regression: greedy pattern on Gallery.latte-like content', () => {
    // Simulates the Gallery.latte corruption scenario
    const code = [
      "{embed '~card',",
      "\tclass: 'col-start-1 row-span-2',",
      "\tborderRadiusClass: 'sm:rounded-md'}",
      '\t{block content}',
      "\t\t<li n:class=\"'flex items-center', $active ? 'font-bold'\">",
      "\t\t\t{embed '~link',",
      "\t\t\t\tclass: 'flex h-full items-center'}",
      '\t\t\t{/embed}',
      '\t\t</li>',
      '\t{/block}',
      '{/embed}'
    ].join('\n')

    // Apply the old dangerous PhpStorm patterns — unsafe ones get filtered out with warnings
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dangerousPatterns = parseClassRegexPatterns(
      JSON.stringify([
        String.raw`[cC]lass:\s*?["'` + '`' + String.raw`]([^"'` + '`' + String.raw`]*).*?,?`,
        [
          String.raw`n:class=["']([\s\S]*)["']`,
          String.raw`["'` + '`' + String.raw`]([^"'` + '`' + String.raw`]*)["'` + '`]'
        ],
        String.raw`\$(?:.*)[cC]lass(?:Name)?\s*?=\s*?["']([^"']*)`
      ])
    )
    // 2 dangerous patterns should have been filtered, leaving only the safe class: pattern
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()

    const result = applyClassRegex(code, dangerousPatterns, sortFn)

    // File structure must be preserved — no HTML tags or Latte brackets in wrong places
    expect(result).toContain('{block content}')
    expect(result).toContain('{/embed}')
    expect(result).toContain('{/block}')
    expect(result.split('\n').length).toBe(code.split('\n').length)
  })
})
