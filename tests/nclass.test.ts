import { describe, expect, it } from 'vitest'
import { defaultClassOrderContext } from '../src/class-order'
import { parseNClass, sortNClassValue } from '../src/nclass'
import type { TailwindContext } from '../src/types'

function mockContext(order: Record<string, bigint>): TailwindContext {
  return {
    getClassOrder: (classList: string[]) => classList.map((c): [string, bigint | null] => [c, order[c] ?? null]),
    classOrder: defaultClassOrderContext()
  }
}

// Sort order: unknown(null) < flex(10) < block(20) < hidden(30) < active(50)
// < w-5(100) < h-5(110) < text-left(200) < text-sm(210) < mt-1(300) < mb-2(310)
const ctx = mockContext({
  flex: 10n,
  block: 20n,
  hidden: 30n,
  active: 50n,
  inactive: 60n,
  'w-5': 100n,
  'h-5': 110n,
  'text-left': 200n,
  'text-sm': 210n,
  'mt-1': 300n,
  'mb-2': 310n
})

const defaults = {}

// ─── Parsing ───

describe('parseNClass', () => {
  it('single static bare', () => {
    const r = parseNClass('active')
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].content).toBe('active')
    expect(r.tokens[0].sortable).toBe(true)
    expect(r.tokens[0].sortKey).toBe('active')
  })

  it('single static quoted', () => {
    const r = parseNClass("'active'")
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].sortable).toBe(true)
    expect(r.tokens[0].sortKey).toBe('active')
  })

  it('multi-class quoted is a barrier', () => {
    const r = parseNClass("'flex btn'")
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].sortable).toBe(false)
  })

  it('dynamic variable is a barrier', () => {
    const r = parseNClass('$var')
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].sortable).toBe(false)
  })

  it('conditional is a barrier', () => {
    const r = parseNClass("$x ? 'active'")
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].sortable).toBe(false)
  })

  it('PHP concatenation with variable is a barrier', () => {
    const r = parseNClass("'icon--' . $icon['icon']")
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].sortable).toBe(false)
  })

  it('comma-separated tokens with separators', () => {
    const r = parseNClass("'foo', 'bar', 'baz'")
    expect(r.tokens).toHaveLength(3)
    expect(r.tokens[0].trailingSep).toBe(', ')
    expect(r.tokens[1].trailingSep).toBe(', ')
    expect(r.tokens[2].trailingSep).toBe('')
  })

  it('multiline preserves separators', () => {
    const r = parseNClass("'foo',\n  'bar',\n  'baz'")
    expect(r.tokens[0].trailingSep).toBe(',\n  ')
    expect(r.tokens[1].trailingSep).toBe(',\n  ')
    expect(r.tokens[2].trailingSep).toBe('')
  })

  it('handles prefix and suffix whitespace', () => {
    const r = parseNClass("\n  'foo', 'bar'\n")
    expect(r.prefix).toBe('\n  ')
    expect(r.suffix).toBe('\n')
    expect(r.tokens).toHaveLength(2)
  })

  it('handles bare arbitrary value with commas as single token', () => {
    const r = parseNClass('mt-4, bg-[rgb(255,0,0)], flex')
    expect(r.tokens).toHaveLength(3)
    expect(r.tokens[0].content).toBe('mt-4')
    expect(r.tokens[1].content).toBe('bg-[rgb(255,0,0)]')
    expect(r.tokens[2].content).toBe('flex')
  })

  it('handles quoted arbitrary value with commas as single token', () => {
    const r = parseNClass("'mt-4', 'bg-[rgb(255,0,0)]', 'flex'")
    expect(r.tokens).toHaveLength(3)
    expect(r.tokens[1].content).toBe("'bg-[rgb(255,0,0)]'")
    expect(r.tokens[1].sortable).toBe(true)
    expect(r.tokens[1].sortKey).toBe('bg-[rgb(255,0,0)]')
  })

  it('skips ?-> (null-safe)', () => {
    const r = parseNClass('$obj?->method()')
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].sortable).toBe(false) // dynamic
  })

  it('skips ?: (Elvis)', () => {
    const r = parseNClass("$x ?: 'default'")
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0].sortable).toBe(false) // dynamic (starts with $, no top-level ?)
  })
})

// ─── Internal class sorting (within tokens) ───

describe('sortNClassValue — internal class sorting', () => {
  it('sorts classes within multi-class quoted string', () => {
    const result = sortNClassValue("'flex btn'", ctx, defaults)
    // btn is unknown (null → first), flex is known (10n)
    expect(result).toBe("'btn flex'")
  })

  it('sorts both branches of ternary', () => {
    const result = sortNClassValue("$x ? 'flex btn' : 'block hidden'", ctx, defaults)
    expect(result).toBe("$x ? 'btn flex' : 'block hidden'")
  })

  it('sorts true-only conditional branch', () => {
    const result = sortNClassValue("$x ? 'flex btn'", ctx, defaults)
    expect(result).toBe("$x ? 'btn flex'")
  })

  it('does not sort single-class quoted strings internally', () => {
    const result = sortNClassValue("'active'", ctx, defaults)
    expect(result).toBe("'active'")
  })

  it('does not touch dynamic tokens', () => {
    const result = sortNClassValue('$var', ctx, defaults)
    expect(result).toBe('$var')
  })
})

// ─── Token-level sorting ───

describe('sortNClassValue — token-level sorting', () => {
  it('sorts sortable single-class tokens', () => {
    // text-left(200n) should come after w-5(100n), foo is unknown(null → first)
    const result = sortNClassValue("'text-left', 'w-5', 'foo'", ctx, defaults)
    expect(result).toBe("'foo', 'w-5', 'text-left'")
  })

  it('sorts bare identifiers', () => {
    const result = sortNClassValue('text-left, w-5, foo', ctx, defaults)
    expect(result).toBe('foo, w-5, text-left')
  })

  it('does not reorder across barriers', () => {
    // text-left should stay before $bar (barrier blocks reordering)
    const result = sortNClassValue("'text-left', $bar ? 'h-5', 'w-5'", ctx, defaults)
    expect(result).toBe("'text-left', $bar ? 'h-5', 'w-5'")
  })

  it('sorts groups on both sides of a barrier', () => {
    const result = sortNClassValue("'text-left', 'w-5', $bar ? 'h-5', 'text-sm', 'flex'", ctx, defaults)
    // Group 1: ['text-left'(200n), 'w-5'(100n)] → ['w-5', 'text-left']
    // Barrier: $bar ? 'h-5'
    // Group 2: ['text-sm'(210n), 'flex'(10n)] → ['flex', 'text-sm']
    expect(result).toBe("'w-5', 'text-left', $bar ? 'h-5', 'flex', 'text-sm'")
  })

  it('PHP concatenation acts as barrier', () => {
    // icon is known (bigint), concatenation is unknown — without barrier, unknown sorts first
    const ctxWithIcon = mockContext({ flex: 10n, icon: 20n })
    const result = sortNClassValue("'icon', 'icon--' . $icon['icon'], 'flex'", ctxWithIcon, defaults)
    // 'icon' alone before barrier, 'flex' alone after → no token reordering
    expect(result).toBe("'icon', 'icon--' . $icon['icon'], 'flex'")
  })

  it('PHP concatenation preserves space around dot operator', () => {
    const result = sortNClassValue(
      "'icon', 'icon--' . $icon['icon'], 'flex items-center w-5', $icon['class'], $iconClass",
      ctx,
      defaults
    )
    expect(result).toContain("'icon--' . $icon['icon']")
  })

  it('PHP concatenation inside a conditional branch is preserved atomically', () => {
    // Regression: sortBranch previously split the branch on whitespace and fed it to
    // sortClasses, which corrupted `'a b c' . $x->m()` into a reordered token mess
    // where the `.$x->m()` part landed in the middle of the class list.
    const input =
      "'relative block', $hasAjaxRule ? '[--spinner-inset:1px] [--spinner-left:auto] pdforms-ajax-spinner--' . $control->getHtmlId()"
    const result = sortNClassValue(input, ctx, defaults)
    // Branch is NOT a plain quoted string (ends with `)`, not `'`), so it must stay
    // untouched verbatim.
    expect(result).toContain(
      "$hasAjaxRule ? '[--spinner-inset:1px] [--spinner-left:auto] pdforms-ajax-spinner--' . $control->getHtmlId()"
    )
  })

  it('multi-class quoted string acts as barrier', () => {
    const result = sortNClassValue("'text-left', 'flex btn', 'w-5'", ctx, defaults)
    // 'text-left' alone in group (before barrier 'flex btn')
    // 'w-5' alone in group (after barrier)
    // Internal sort: 'flex btn' → 'btn flex'
    expect(result).toBe("'text-left', 'btn flex', 'w-5'")
  })

  it('preserves separator after ternary barrier', () => {
    const result = sortNClassValue(
      "'icon', $isFavorite ? 'icon--heart-solid text-promo-primary' : 'icon--heart-outline', 'leading-none'",
      ctx,
      defaults
    )
    expect(result).toBe(
      "'icon', $isFavorite ? 'icon--heart-solid text-promo-primary' : 'icon--heart-outline', 'leading-none'"
    )
  })

  it('unknown classes come first within a group', () => {
    const result = sortNClassValue("'flex', 'custom', 'w-5'", ctx, defaults)
    // custom(null → first), flex(10n), w-5(100n)
    expect(result).toBe("'custom', 'flex', 'w-5'")
  })
})

// ─── Whitespace modes ───

describe('sortNClassValue — whitespace modes', () => {
  const multiline = "'foo',\n  'text-left',\n  'w-5',\n  $bar ? 'h-5',\n  'text-sm'"

  it('preserve: separators travel with tokens', () => {
    const result = sortNClassValue(multiline, ctx, { tailwindNclassWhitespace: 'preserve' })
    // Group 1: [foo(null), text-left(200n), w-5(100n)] → [foo, w-5, text-left]
    // foo carries ',\n  ', w-5 carries ',\n  ', text-left carries ',\n  '
    expect(result).toBe("'foo',\n  'w-5',\n  'text-left',\n  $bar ? 'h-5',\n  'text-sm'")
  })

  it('normalize-barriers: normalizes within groups, preserves at boundaries', () => {
    const result = sortNClassValue(multiline, ctx, { tailwindNclassWhitespace: 'normalize-barriers' })
    expect(result).toBe("'foo', 'w-5', 'text-left',\n  $bar ? 'h-5',\n  'text-sm'")
  })

  it('normalize: all separators become ", "', () => {
    const result = sortNClassValue(multiline, ctx, { tailwindNclassWhitespace: 'normalize' })
    expect(result).toBe("'foo', 'w-5', 'text-left', $bar ? 'h-5', 'text-sm'")
  })

  it('default mode is normalize-barriers', () => {
    const result = sortNClassValue(multiline, ctx, {})
    expect(result).toBe("'foo', 'w-5', 'text-left',\n  $bar ? 'h-5',\n  'text-sm'")
  })

  it('preserves prefix and suffix whitespace', () => {
    const result = sortNClassValue("\n  'text-left', 'w-5'\n", ctx, defaults)
    expect(result).toBe("\n  'w-5', 'text-left'\n")
  })

  it('normalize-barriers: ensures space after comma at barrier boundaries', () => {
    // Missing space after barrier: ,'leading-none' → should become , 'leading-none'
    const result = sortNClassValue("'icon',$bar ? 'h-5','text-sm'", ctx, {
      tailwindNclassWhitespace: 'normalize-barriers'
    })
    expect(result).toBe("'icon', $bar ? 'h-5', 'text-sm'")
  })

  it('preserve: does NOT add space after comma at barrier boundaries', () => {
    const result = sortNClassValue("'icon',$bar ? 'h-5','text-sm'", ctx, { tailwindNclassWhitespace: 'preserve' })
    expect(result).toBe("'icon',$bar ? 'h-5','text-sm'")
  })

  it('normalize-barriers: normalizes ternary spacing', () => {
    const result = sortNClassValue("$x ?'active':'inactive'", ctx, { tailwindNclassWhitespace: 'normalize-barriers' })
    expect(result).toBe("$x ? 'active' : 'inactive'")
  })

  it('preserve: does NOT normalize ternary spacing', () => {
    const result = sortNClassValue("$x ?'active':'inactive'", ctx, { tailwindNclassWhitespace: 'preserve' })
    expect(result).toBe("$x ?'active':'inactive'")
  })

  it('normalize-barriers: normalizes PHP concatenation spacing', () => {
    const result = sortNClassValue("'icon','icon--'.$icon['icon'],'flex'", ctx, {
      tailwindNclassWhitespace: 'normalize-barriers'
    })
    expect(result).toBe("'icon', 'icon--' . $icon['icon'], 'flex'")
  })

  it('preserve: does NOT normalize PHP concatenation spacing', () => {
    const result = sortNClassValue("'icon','icon--'.$icon['icon'],'flex'", ctx, {
      tailwindNclassWhitespace: 'preserve'
    })
    expect(result).toBe("'icon','icon--'.$icon['icon'],'flex'")
  })
})

// ─── Edge cases ───

describe('sortNClassValue — edge cases', () => {
  it('returns unchanged when context is null', () => {
    const result = sortNClassValue("'flex', 'w-5'", null, defaults)
    expect(result).toBe("'flex', 'w-5'")
  })

  it('handles empty string', () => {
    expect(sortNClassValue('', ctx, defaults)).toBe('')
  })

  it('handles whitespace-only string', () => {
    expect(sortNClassValue('  ', ctx, defaults)).toBe('  ')
  })

  it('single token — no reordering needed', () => {
    expect(sortNClassValue("'active'", ctx, defaults)).toBe("'active'")
  })

  it('handles ?-> (null-safe) correctly in conditional', () => {
    // $obj?->isActive() is treated as dynamic (no top-level ?)
    const result = sortNClassValue("$obj?->isActive(), 'flex'", ctx, defaults)
    expect(result).toBe("$obj?->isActive(), 'flex'")
  })

  it('handles :: (namespace) in colon search', () => {
    const result = sortNClassValue("$x ? Enum::VALUE : 'fallback'", ctx, defaults)
    // :: should not be mistaken for ternary :
    // The expression should still find the correct : before 'fallback'
    expect(result).toBe("$x ? Enum::VALUE : 'fallback'")
  })

  it('handles condition with comparison operator', () => {
    const result = sortNClassValue("($x > 5) ? 'active'", ctx, defaults)
    expect(result).toContain("($x > 5) ? 'active'")
  })
})
