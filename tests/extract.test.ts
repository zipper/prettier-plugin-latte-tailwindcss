import { describe, expect, it } from 'vitest'
import { extractClassAttributes } from '../src/extract'

describe('extractClassAttributes', () => {
  it('finds basic class="..."', () => {
    const code = '<div class="flex items-center">hello</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'flex items-center'
    })
    expect(code.slice(matches[0].offset, matches[0].offset + matches[0].length)).toBe('flex items-center')
  })

  it("finds class='...' (single quotes)", () => {
    const code = "<div class='mt-4 p-2'>text</div>"
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'mt-4 p-2'
    })
  })

  it('finds n:class="..."', () => {
    const code = '<div n:class="btn, flex, $active ? active">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'n:class',
      value: 'btn, flex, $active ? active'
    })
  })

  it('finds class={[...]} (array syntax)', () => {
    const code = '<div class={[btn, flex, active]}>text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'array-class',
      value: '{[btn, flex, active]}'
    })
  })

  it('finds tailwindAttributes — custom attribute', () => {
    const code = '<div my-class="p-4 m-2">text</div>'
    const matches = extractClassAttributes(code, ['my-class'])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'tailwind-attribute',
      value: 'p-4 m-2',
      attributeName: 'my-class'
    })
  })

  it('handles multiline attributes', () => {
    const code = `<div
  class="flex
    items-center
    justify-between"
>text</div>`
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe('flex\n    items-center\n    justify-between')
  })

  it('skips attribute without value', () => {
    const code = '<div hidden class="flex">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'flex'
    })
  })

  it('finds multiple attributes on one element', () => {
    const code = '<div class="flex" n:class="btn, active">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({ type: 'class', value: 'flex' })
    expect(matches[1]).toMatchObject({ type: 'n:class', value: 'btn, active' })
  })

  it('includes placeholders in values (does not interpret them)', () => {
    const code = '<div class="flex __LP_0000000000000001__ items-center">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe('flex __LP_0000000000000001__ items-center')
  })

  it('ignores content inside HTML comments', () => {
    const code = '<!-- <div class="hidden"> --><span class="visible">text</span>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'visible'
    })
  })

  it('handles self-closing tags', () => {
    const code = '<img class="w-full h-auto" />'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'w-full h-auto'
    })
  })

  it("handles nested brackets in array class: class={['a', $cond ? 'b' : 'c']}", () => {
    const code = "<div class={['a', $cond ? 'b' : 'c']}>text</div>"
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'array-class'
    })
    expect(matches[0].value).toContain("{['a', $cond ? 'b' : 'c']}")
  })

  it('no false positives in text outside tags', () => {
    const code = 'This is class="not-a-match" plain text <div class="real">ok</div>'
    const matches = extractClassAttributes(code, [])
    // Only the one inside the actual tag should match
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'real'
    })
  })

  it('ignores content inside script tags', () => {
    const code = '<script>const x = "<div class=\\"hidden\\">";</script><div class="visible">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'visible'
    })
  })

  it('ignores content inside style tags', () => {
    const code = '<style>.foo { display: none; }</style><div class="flex">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      type: 'class',
      value: 'flex'
    })
  })

  it('handles multiple elements', () => {
    const code = '<div class="a"><span class="b"><p class="c">text</p></span></div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(3)
    expect(matches[0].value).toBe('a')
    expect(matches[1].value).toBe('b')
    expect(matches[2].value).toBe('c')
  })

  it('returns correct offsets', () => {
    const code = '<div class="flex">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    const m = matches[0]
    // Verify offset points to the value
    expect(code.slice(m.offset, m.offset + m.length)).toBe('flex')
  })

  it('does not match attributes from placeholder content (replaced Latte tags)', () => {
    // A placeholder replaces an entire Latte tag — class inside should not be found
    const code = '<div __LP_0000000000000000__ class="real">text</div>'
    const matches = extractClassAttributes(code, [])
    // The placeholder is skipped, only the real class attribute is found
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe('real')
  })

  it('handles adjacent placeholders in class value', () => {
    // Two Latte expressions side by side, e.g. class="{$a}{$b} flex"
    const code = '<div class="__LP_aaaaaaaaaaaaaaaa____LP_bbbbbbbbbbbbbbbb__ flex">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe('__LP_aaaaaaaaaaaaaaaa____LP_bbbbbbbbbbbbbbbb__ flex')
    expect(matches[0].type).toBe('class')
  })

  it('handles placeholder immediately before tag', () => {
    // Placeholder followed by a tag start
    const code = '__LP_0000000000000000__<div class="flex">text</div>'
    const matches = extractClassAttributes(code, [])
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe('flex')
  })
})
