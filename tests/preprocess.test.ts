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
