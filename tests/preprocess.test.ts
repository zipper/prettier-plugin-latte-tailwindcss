import { describe, expect, it } from 'vitest'
import { preprocessLatte, restorePlaceholders } from '../src/preprocess'

describe('preprocessLatte — round-trip', () => {
  it('plain HTML passes through unchanged', () => {
    const input = '<div class="flex">hello</div>'
    const { code, map } = preprocessLatte(input)
    expect(code).toBe(input)
    expect(map.size).toBe(0)
  })

  it('round-trip: block tags', () => {
    const input = '<div>{if $x}<span>{/if}</div>'
    const { code, map } = preprocessLatte(input)
    expect(code).not.toContain('{if')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('round-trip: comment', () => {
    const input = '{* this is a comment *}<div></div>'
    const { code, map } = preprocessLatte(input)
    expect(code).not.toContain('{*')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('round-trip: inline expression in attribute', () => {
    const input = '<a href="{link Home:}">click</a>'
    const { code, map } = preprocessLatte(input)
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('preserves array class syntax ={[...]}', () => {
    const input = '<div class={[btn, flex]}></div>'
    const { code, map } = preprocessLatte(input)
    // The {[ part should NOT be replaced
    expect(code).toContain('{[')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('round-trip: literal brace (non-Latte)', () => {
    const input = '<p>price: { 10 + 5 }</p>'
    const { code, map } = preprocessLatte(input)
    // { followed by space = literal, not Latte
    expect(code).toContain('{ 10 + 5 }')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('round-trip: dynamic tag name', () => {
    const input = '<h{$level} class="title">heading</h{$level}>'
    const { code, map } = preprocessLatte(input)
    expect(code).not.toContain('<h{')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('round-trip: mixed classes and expressions', () => {
    const input = '<div class="{$extra} flex btn"></div>'
    const { code, map } = preprocessLatte(input)
    expect(restorePlaceholders(code, map)).toBe(input)
  })
})

// ─── Placeholder round-trip invariant ───

describe('preprocessLatte — round-trip invariant', () => {
  const invariantCases: [string, string][] = [
    ['empty string', ''],
    ['plain HTML', '<div class="flex">hello</div>'],
    ['block tags', '<div>{if $x}<span>{/if}</div>'],
    ['nested block tags', '{if $a}{if $b}<span>{/if}{/if}'],
    ['comment', '{* this is a comment *}<div></div>'],
    ['inline expression', '<a href="{link Home:}">click</a>'],
    ['array class syntax', '<div class={[btn, flex]}></div>'],
    ['literal brace', '<p>price: { 10 + 5 }</p>'],
    ['dynamic tag name', '<h{$level} class="title">heading</h{$level}>'],
    ['mixed classes and expressions', '<div class="{$extra} flex btn"></div>'],
    ['multiple expressions', '<div data-a="{$a}" data-b="{$b}">text</div>'],
    ['nested braces', '<div>{foreach $items as $item}{$item}{/foreach}</div>'],
    ['contentType tag', '{contentType xml}<root></root>'],
    ['debugbreak tag', '{debugbreak}<div></div>'],
    ['n:class with expressions', '<div n:class="$x ? \'active\', \'flex\'">text</div>'],
    ['multiple Latte constructs', '{var $x = 1}<div class="{$x}">text</div>{* comment *}'],
  ]

  for (const [name, input] of invariantCases) {
    it(`round-trip: ${name}`, () => {
      const { code, map } = preprocessLatte(input)
      expect(restorePlaceholders(code, map)).toBe(input)
    })
  }
})

// ─── Edge cases ───

describe('preprocessLatte — edge cases', () => {
  it('handles nested Latte tags (foreach inside if)', () => {
    const input = '{if $show}{foreach $items as $item}<li>{$item}</li>{/foreach}{/if}'
    const { code, map } = preprocessLatte(input)
    expect(code).not.toContain('{if')
    expect(code).not.toContain('{foreach')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('handles {contentType xml}', () => {
    const input = '{contentType xml}'
    const { code, map } = preprocessLatte(input)
    expect(code).not.toContain('{contentType')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('handles {debugbreak}', () => {
    const input = '{debugbreak}'
    const { code, map } = preprocessLatte(input)
    expect(code).not.toContain('{debugbreak')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('handles multiple placeholders without collision', () => {
    const input = '{$a}{$b}{$c}{$d}{$e}{$f}{$g}{$h}{$i}{$j}'
    const { code, map } = preprocessLatte(input)
    expect(map.size).toBe(10)
    // Each placeholder is unique (20 chars)
    const placeholders = [...map.keys()]
    const uniqueSet = new Set(placeholders)
    expect(uniqueSet.size).toBe(10)
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('placeholder length is exactly 23 characters (__LP_ + 16 hex + __)', () => {
    const input = '{$x}'
    const { code, map } = preprocessLatte(input)
    const ph = [...map.keys()][0]
    // Format: __LP_ (5) + 16 hex digits + __ (2) = 23
    expect(ph).toMatch(/^__LP_[0-9a-f]{16}__$/)
    expect(ph.length).toBe(23)
  })

  it('handles brace at end of input', () => {
    const input = '<div>{'
    const { code, map } = preprocessLatte(input)
    // Unclosed brace — should pass through as-is
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('handles empty Latte expression {= expr}', () => {
    const input = '<span>{= $value}</span>'
    const { code, map } = preprocessLatte(input)
    expect(code).not.toContain('{=')
    expect(restorePlaceholders(code, map)).toBe(input)
  })

  it('handles Latte tag with nested braces in string', () => {
    const input = `{var $x = "{test}"}`
    const { code, map } = preprocessLatte(input)
    expect(restorePlaceholders(code, map)).toBe(input)
  })
})
