import { describe, expect, it } from 'vitest'
import { parseArrayClass, serializeArrayClass, sortArrayClassValue, type ArrayClassItem } from '../src/array-class'

// ─── Helper: mock sortFn simulating Tailwind order ───
// Uses a predefined order map; unknown classes go first (like null bigint)

const TW_ORDER: Record<string, number> = {
  // Layout
  container: 1,
  block: 2,
  inline: 3,
  flex: 4,
  grid: 5,
  hidden: 6,
  // Flexbox
  'items-center': 10,
  'justify-center': 11,
  'gap-2': 12,
  'gap-4': 13,
  // Spacing
  'p-2': 20,
  'p-4': 21,
  'px-4': 22,
  'py-2': 23,
  'm-2': 24,
  'mt-4': 25,
  'mx-auto': 26,
  // Sizing
  'w-full': 30,
  'h-10': 31,
  // Typography
  'text-sm': 40,
  'text-lg': 41,
  'text-xl': 42,
  'font-bold': 43,
  'text-center': 44,
  // Colors
  'text-white': 50,
  'text-red-500': 51,
  'bg-blue-500': 60,
  'bg-red-500': 61,
  // Border
  rounded: 70,
  'rounded-lg': 71,
  border: 72,
  // Effects
  shadow: 80,
  'shadow-lg': 81,
  'opacity-50': 82,
  // Transitions
  transition: 90,
  'duration-200': 91,
  // Hover
  'hover:bg-blue-600': 100,
  'hover:text-white': 101
}

function tailwindSortFn(classes: string): string {
  return classes
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => {
      const orderA = TW_ORDER[a] ?? -1 // unknown = first (null bigint behavior)
      const orderB = TW_ORDER[b] ?? -1
      if (orderA === orderB) return 0
      return orderA < orderB ? -1 : 1
    })
    .join(' ')
}

// ─── parseArrayClass ───

describe('parseArrayClass', () => {
  it('parses bare identifiers', () => {
    const items = parseArrayClass('btn, flex, hidden')
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'plain', className: 'btn', quoted: false })
    expect(items[1]).toMatchObject({ type: 'plain', className: 'flex', quoted: false })
    expect(items[2]).toMatchObject({ type: 'plain', className: 'hidden', quoted: false })
  })

  it('parses quoted strings', () => {
    const items = parseArrayClass("'btn', 'flex', 'hidden'")
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'plain', className: 'btn', quoted: true })
    expect(items[1]).toMatchObject({ type: 'plain', className: 'flex', quoted: true })
    expect(items[2]).toMatchObject({ type: 'plain', className: 'hidden', quoted: true })
  })

  it('parses double-quoted strings', () => {
    const items = parseArrayClass('"btn", "flex"')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ type: 'plain', className: 'btn', quoted: true })
    expect(items[1]).toMatchObject({ type: 'plain', className: 'flex', quoted: true })
  })

  it('parses keyed pairs with bare key', () => {
    const items = parseArrayClass('active => $isActive, hidden => $isHidden')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'keyed',
      className: 'active',
      condition: '$isActive',
      quoted: false
    })
    expect(items[1]).toMatchObject({
      type: 'keyed',
      className: 'hidden',
      condition: '$isHidden',
      quoted: false
    })
  })

  it('parses keyed pairs with quoted key', () => {
    const items = parseArrayClass("'text-red-500' => $hasError, 'font-bold' => true")
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'keyed',
      className: 'text-red-500',
      condition: '$hasError',
      quoted: true
    })
    expect(items[1]).toMatchObject({
      type: 'keyed',
      className: 'font-bold',
      condition: 'true',
      quoted: true
    })
  })

  it('parses dynamic items ($variable)', () => {
    const items = parseArrayClass('btn, $dynamicClass, flex')
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'plain', className: 'btn' })
    expect(items[1]).toMatchObject({ type: 'dynamic', raw: '$dynamicClass' })
    expect(items[2]).toMatchObject({ type: 'plain', className: 'flex' })
  })

  it('parses spread operator as dynamic', () => {
    const items = parseArrayClass('btn, ...$extraClasses, flex')
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'plain' })
    expect(items[1]).toMatchObject({ type: 'dynamic', raw: '...$extraClasses' })
    expect(items[2]).toMatchObject({ type: 'plain' })
  })

  it('parses mixed items', () => {
    const items = parseArrayClass("btn, flex, 'text-red-500' => $hasError, $dyn, hidden")
    expect(items).toHaveLength(5)
    expect(items[0].type).toBe('plain')
    expect(items[1].type).toBe('plain')
    expect(items[2].type).toBe('keyed')
    expect(items[3].type).toBe('dynamic')
    expect(items[4].type).toBe('plain')
  })

  it('handles Tailwind class names with special characters', () => {
    const items = parseArrayClass("'sm:text-lg', 'hover:bg-blue-600', 'w-1/2'")
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'plain', className: 'sm:text-lg' })
    expect(items[1]).toMatchObject({ type: 'plain', className: 'hover:bg-blue-600' })
    expect(items[2]).toMatchObject({ type: 'plain', className: 'w-1/2' })
  })

  it('handles bare Tailwind class names with colons and slashes', () => {
    const items = parseArrayClass('sm:text-lg, hover:bg-blue-600, w-1/2')
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'plain', className: 'sm:text-lg', quoted: false })
    expect(items[1]).toMatchObject({ type: 'plain', className: 'hover:bg-blue-600', quoted: false })
    expect(items[2]).toMatchObject({ type: 'plain', className: 'w-1/2', quoted: false })
  })

  it('preserves trailing separators', () => {
    const items = parseArrayClass('btn,  flex,\n\thidden')
    expect(items).toHaveLength(3)
    expect(items[0].trailingSep).toBe(',  ')
    expect(items[1].trailingSep).toBe(',\n\t')
    expect(items[2].trailingSep).toBe('')
  })

  it('handles empty input', () => {
    expect(parseArrayClass('')).toEqual([])
    expect(parseArrayClass('   ')).toEqual([])
  })

  it('handles function call as dynamic', () => {
    const items = parseArrayClass("btn, getClass('foo'), flex")
    expect(items).toHaveLength(3)
    expect(items[1]).toMatchObject({ type: 'dynamic' })
  })

  it('handles method call as keyed condition', () => {
    const items = parseArrayClass('active => $obj->isActive(), hidden => !$show')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'keyed',
      className: 'active',
      condition: '$obj->isActive()'
    })
    expect(items[1]).toMatchObject({
      type: 'keyed',
      className: 'hidden',
      condition: '!$show'
    })
  })

  it('handles dynamic key in keyed pair as dynamic', () => {
    const items = parseArrayClass('$dynamicKey => true, btn')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ type: 'dynamic' })
    expect(items[1]).toMatchObject({ type: 'plain', className: 'btn' })
  })
})

// ─── serializeArrayClass ───

describe('serializeArrayClass', () => {
  it('serializes plain items', () => {
    const items: ArrayClassItem[] = [
      { type: 'plain', raw: 'btn', className: 'btn', quoted: false, trailingSep: ', ' },
      { type: 'plain', raw: 'flex', className: 'flex', quoted: false, trailingSep: '' }
    ]
    expect(serializeArrayClass(items)).toBe('btn, flex')
  })

  it('serializes quoted items', () => {
    const items: ArrayClassItem[] = [
      { type: 'plain', raw: "'btn'", className: 'btn', quoted: true, trailingSep: ', ' },
      { type: 'plain', raw: "'flex'", className: 'flex', quoted: true, trailingSep: '' }
    ]
    expect(serializeArrayClass(items)).toBe("'btn', 'flex'")
  })

  it('serializes keyed items', () => {
    const items: ArrayClassItem[] = [
      { type: 'keyed', raw: 'active => $x', className: 'active', condition: '$x', quoted: false, trailingSep: ', ' },
      { type: 'keyed', raw: "'hidden' => $y", className: 'hidden', condition: '$y', quoted: true, trailingSep: '' }
    ]
    expect(serializeArrayClass(items)).toBe("active => $x, 'hidden' => $y")
  })

  it('serializes dynamic items using raw', () => {
    const items: ArrayClassItem[] = [
      { type: 'plain', raw: 'btn', className: 'btn', quoted: false, trailingSep: ', ' },
      { type: 'dynamic', raw: '$dyn', trailingSep: ', ' },
      { type: 'plain', raw: 'flex', className: 'flex', quoted: false, trailingSep: '' }
    ]
    expect(serializeArrayClass(items)).toBe('btn, $dyn, flex')
  })

  it('preserves custom separators', () => {
    const items: ArrayClassItem[] = [
      { type: 'plain', raw: 'btn', className: 'btn', quoted: false, trailingSep: ',  ' },
      { type: 'plain', raw: 'flex', className: 'flex', quoted: false, trailingSep: '' }
    ]
    expect(serializeArrayClass(items)).toBe('btn,  flex')
  })
})

// ─── sortArrayClassValue ───

describe('sortArrayClassValue', () => {
  it('sorts plain bare items', () => {
    const result = sortArrayClassValue('{[flex, block, grid]}', tailwindSortFn)
    expect(result).toBe('{[block, flex, grid]}')
  })

  it('sorts plain quoted items', () => {
    const result = sortArrayClassValue("{['flex', 'block', 'grid']}", tailwindSortFn)
    expect(result).toBe("{['block', 'flex', 'grid']}")
  })

  it('sorts keyed items by class name', () => {
    const result = sortArrayClassValue('{[flex => $a, block => $b, grid => $c]}', tailwindSortFn)
    expect(result).toBe('{[block => $b, flex => $a, grid => $c]}')
  })

  it('preserves keyed pair atomicity', () => {
    const result = sortArrayClassValue(
      "{['font-bold' => $bold, 'flex' => $isFlex, 'block' => $isBlock]}",
      tailwindSortFn
    )
    // block (2) < flex (4) < font-bold (43)
    expect(result).toBe("{['block' => $isBlock, 'flex' => $isFlex, 'font-bold' => $bold]}")
  })

  it('keeps dynamic items in place as barriers', () => {
    const result = sortArrayClassValue('{[flex, block, $dyn, grid, hidden]}', tailwindSortFn)
    // Group 1: flex, block → sorted: block, flex
    // Barrier: $dyn
    // Group 2: grid, hidden → sorted: grid, hidden (already sorted)
    expect(result).toBe('{[block, flex, $dyn, grid, hidden]}')
  })

  it('keeps dynamic items in place — groups sorted independently', () => {
    const result = sortArrayClassValue('{[grid, flex, $dyn, hidden, block]}', tailwindSortFn)
    // Group 1: grid, flex → sorted: flex, grid
    // Barrier: $dyn
    // Group 2: hidden, block → sorted: block, hidden
    expect(result).toBe('{[flex, grid, $dyn, block, hidden]}')
  })

  it('handles spread as dynamic barrier', () => {
    const result = sortArrayClassValue('{[flex, block, ...$extra, grid, hidden]}', tailwindSortFn)
    expect(result).toBe('{[block, flex, ...$extra, grid, hidden]}')
  })

  it('sorts mixed plain and keyed items', () => {
    const result = sortArrayClassValue("{[flex, 'font-bold' => $bold, block]}", tailwindSortFn)
    // All three are static: block (2), flex (4), font-bold (43)
    expect(result).toBe("{[block, flex, 'font-bold' => $bold]}")
  })

  it('handles single item', () => {
    const result = sortArrayClassValue('{[flex]}', tailwindSortFn)
    expect(result).toBe('{[flex]}')
  })

  it('handles empty array', () => {
    expect(sortArrayClassValue('{[]}', tailwindSortFn)).toBe('{[]}')
  })

  it('returns value unchanged if not array class syntax', () => {
    expect(sortArrayClassValue('regular-class', tailwindSortFn)).toBe('regular-class')
    expect(sortArrayClassValue('{notarray}', tailwindSortFn)).toBe('{notarray}')
  })

  it('handles only dynamic items (no sorting needed)', () => {
    const result = sortArrayClassValue('{[$a, $b, $c]}', tailwindSortFn)
    expect(result).toBe('{[$a, $b, $c]}')
  })

  it('unknown classes go first (null bigint behavior)', () => {
    // 'custom-class' is not in TW_ORDER → gets -1 (first)
    const result = sortArrayClassValue('{[flex, custom-class, block]}', tailwindSortFn)
    // custom-class (-1) < block (2) < flex (4)
    expect(result).toBe('{[custom-class, block, flex]}')
  })

  it('preserves original separator style', () => {
    const result = sortArrayClassValue('{[flex,  block,\n\tgrid]}', tailwindSortFn)
    // After sort: block, flex, grid — separators from original positions
    expect(result).toBe('{[block,  flex,\n\tgrid]}')
  })

  it('is idempotent', () => {
    const input = "{[flex, 'font-bold' => $bold, block, $dyn, grid]}"
    const once = sortArrayClassValue(input, tailwindSortFn)
    const twice = sortArrayClassValue(once, tailwindSortFn)
    expect(twice).toBe(once)
  })

  it('handles dynamic item at the start', () => {
    const result = sortArrayClassValue('{[$dyn, flex, block]}', tailwindSortFn)
    expect(result).toBe('{[$dyn, block, flex]}')
  })

  it('handles dynamic item at the end', () => {
    const result = sortArrayClassValue('{[flex, block, $dyn]}', tailwindSortFn)
    expect(result).toBe('{[block, flex, $dyn]}')
  })

  it('handles multiple dynamic barriers', () => {
    const result = sortArrayClassValue('{[grid, flex, $a, hidden, block, $b, shadow, rounded]}', tailwindSortFn)
    // Group 1: grid, flex → flex, grid
    // Barrier: $a
    // Group 2: hidden, block → block, hidden
    // Barrier: $b
    // Group 3: shadow, rounded → rounded, shadow
    expect(result).toBe('{[flex, grid, $a, block, hidden, $b, rounded, shadow]}')
  })

  it('handles keyed pair with complex condition', () => {
    const result = sortArrayClassValue("{['font-bold' => ($count > 5), 'flex' => $show]}", tailwindSortFn)
    expect(result).toBe("{['flex' => $show, 'font-bold' => ($count > 5)]}")
  })

  it('handles all keyed items', () => {
    const result = sortArrayClassValue('{[shadow => $a, flex => $b, block => $c]}', tailwindSortFn)
    expect(result).toBe('{[block => $c, flex => $b, shadow => $a]}')
  })

  it('silently drops trailing comma (empty item is skipped)', () => {
    const result = sortArrayClassValue('{[flex, block,]}', tailwindSortFn)
    // trailing comma produces an empty item that is skipped by the parser
    expect(result).toBe('{[block, flex]}')
  })

  it('handles keyed pair where condition contains array access with fat arrow inside brackets', () => {
    // The top-level => should be found correctly even when the condition
    // contains => inside bracket expressions like $arr['key']
    const result = sortArrayClassValue("{['font-bold' => $arr['key'], 'flex' => $show]}", tailwindSortFn)
    expect(result).toBe("{['flex' => $show, 'font-bold' => $arr['key']]}")
  })

  it('does not deduplicate classes (duplicate class names with different conditions are valid)', () => {
    // A non-deduplicating sortFn is required for array class
    const result = sortArrayClassValue("{['flex' => $a, 'block' => $b, 'flex' => $c]}", tailwindSortFn)
    // block (2) < flex (4) < flex (4) — both flex items preserved
    expect(result).toBe("{['block' => $b, 'flex' => $a, 'flex' => $c]}")
  })
})
