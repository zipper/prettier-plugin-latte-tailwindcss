import { describe, expect, it } from 'vitest'
import { defaultClassOrderContext, parseClassOrderConfig } from '../src/class-order'
import { createPropertyOrderContext, type DesignSystemForPropertyOrder } from '../src/property-order'
import { sortClasses } from '../src/sorting'
import { sortNClassValue } from '../src/nclass'
import type { LatteOptions, TailwindContext } from '../src/types'

// ─── Mock design system (TW bigint + property map) ───
//
// Inlined here — duplicating the pattern from integration-property-order.test.ts
// is preferable to exporting helpers out of shared test utilities (out of scope
// for this task). Each real Tailwind utility gets a non-null bigint; anything
// not in this map is treated as "unknown" (null bigint) — that includes custom
// classes like `icon`, `icon--check`, `js-toggle`, `search-input`.
function createMockDesignSystem(): {
  ds: DesignSystemForPropertyOrder
  context: TailwindContext
} {
  const variantHover = { kind: 'static', name: 'hover' }
  const variantMd = { kind: 'static', name: 'md' }
  const variantFocus = { kind: 'static', name: 'focus' }

  const classPropertyMap: Record<string, string> = {
    flex: 'display',
    block: 'display',
    hidden: 'display',
    inline: 'display',
    'justify-center': 'justify-content',
    'items-center': 'align-items',
    'gap-4': 'gap',
    'w-5': 'width',
    'w-full': 'width',
    'h-5': 'height',
    'p-4': 'padding',
    'p-2': 'padding',
    'mt-1': 'margin-top',
    'mb-2': 'margin-bottom',
    'text-sm': 'font-size',
    'text-lg': 'font-size',
    'font-bold': 'font-weight',
    'text-red-500': 'color',
    'bg-white': 'background-color',
    border: 'border-width',
    rounded: 'border-radius',
    'shadow-lg': 'box-shadow'
  }

  const twOrder: Record<string, bigint> = {
    flex: 10n,
    block: 11n,
    hidden: 12n,
    inline: 13n,
    'justify-center': 50n,
    'items-center': 60n,
    'gap-4': 70n,
    'w-5': 100n,
    'w-full': 101n,
    'h-5': 110n,
    'p-4': 200n,
    'p-2': 201n,
    'mt-1': 300n,
    'mb-2': 310n,
    'text-sm': 400n,
    'text-lg': 401n,
    'font-bold': 410n,
    'text-red-500': 500n,
    'bg-white': 600n,
    border: 700n,
    rounded: 710n,
    'shadow-lg': 800n
  }

  // Variants
  const variantOffset = 10000n
  for (const [cls, order] of Object.entries({ ...twOrder })) {
    twOrder[`hover:${cls}`] = order + variantOffset
    twOrder[`md:${cls}`] = order + variantOffset * 2n
    twOrder[`focus:${cls}`] = order + variantOffset * 3n
  }

  const variantOrderMap = new Map<any, number>([
    [variantHover, 15],
    [variantFocus, 17],
    [variantMd, 24]
  ])

  function parseVariants(className: string): { root: string; variants: any[] } {
    const parts = className.split(':')
    const root = parts.pop()!
    const variants = parts.map((name) => {
      if (name === 'hover') return variantHover
      if (name === 'md') return variantMd
      if (name === 'focus') return variantFocus
      return { kind: 'arbitrary' }
    })
    return { root, variants }
  }

  const ds: DesignSystemForPropertyOrder = {
    candidatesToAst: (classes) =>
      classes.map((cls) => {
        const { root } = parseVariants(cls)
        const prop = classPropertyMap[root]
        if (!prop) return []
        return [{ kind: 'declaration', property: prop }]
      }),
    parseCandidate: (candidate) => {
      const { root, variants } = parseVariants(candidate)
      if (!classPropertyMap[root] && !twOrder[candidate]) return []
      return [{ root, variants, important: false }]
    },
    getVariantOrder: () => variantOrderMap,
    getVariants: () => [{ name: 'hover' }, { name: 'focus' }, { name: 'md' }]
  }

  const context: TailwindContext = {
    getClassOrder: (classList) => classList.map((c): [string, bigint | null] => [c, twOrder[c] ?? null]),
    classOrder: defaultClassOrderContext()
  }

  return { ds, context }
}

// ─── Context helpers ───

/**
 * Build a TailwindContext with a user-supplied classOrder config (or default when omitted).
 * Mirrors the pattern from integration.test.ts / integration-property-order.test.ts —
 * mock TW context, no prettier.format, no .prettierrc.
 */
function createMockContext(classOrderRaw?: unknown): TailwindContext {
  const { context } = createMockDesignSystem()
  if (classOrderRaw !== undefined) {
    const parsed = parseClassOrderConfig(classOrderRaw)
    if (parsed) context.classOrder = parsed
  }
  return context
}

/**
 * Build a context with both tailwindClassOrder and tailwindPropertyOrder.
 * Property order is applied ONLY inside the "tailwind" bucket.
 */
function createMockContextWithPropertyOrder(classOrderRaw?: unknown): TailwindContext {
  const { ds, context } = createMockDesignSystem()
  if (classOrderRaw !== undefined) {
    const parsed = parseClassOrderConfig(classOrderRaw)
    if (parsed) context.classOrder = parsed
  }
  context.propertyOrder = createPropertyOrderContext(
    {
      properties: [
        'display',
        'justify-content',
        'align-items',
        'gap',
        'width',
        'height',
        'padding',
        'margin-top',
        'margin-bottom',
        'font-size',
        'font-weight',
        'color',
        'background-color',
        'border-width',
        'border-radius',
        'box-shadow'
      ],
      unspecified: 'bottom'
    },
    ds
  )
  return context
}

const nclassOpts: LatteOptions = {
  tailwindPreserveWhitespace: false,
  tailwindPreserveDuplicates: false,
  tailwindNclassWhitespace: 'normalize-barriers'
}

// ─── a) tailwindClassOrder + tailwindPropertyOrder combination ───

describe('integration — class order + property order', () => {
  it('applies property order INSIDE the "tailwind" bucket (not in pattern/unknown)', () => {
    const ctx = createMockContextWithPropertyOrder([
      [{ pattern: '^icon' }, 'tailwind', { pattern: '^js-' }],
      { unspecified: 'top' }
    ])
    // icon/icon--check: pattern bucket (stable, input order)
    // p-4, flex, w-5: tailwind bucket → property order (display → width → padding)
    // js-toggle: last pattern bucket (stable)
    // Nothing unspecified → `top` has no effect here.
    const result = sortClasses('p-4 icon flex icon--check w-5 js-toggle', ctx)
    expect(result).toBe('icon icon--check flex w-5 p-4 js-toggle')
  })

  it('property order governs tailwind bucket; pattern bucket stays in input order', () => {
    const ctx = createMockContextWithPropertyOrder([
      ['unknown', { pattern: '^bg-' }, 'tailwind'],
      { unspecified: 'top' }
    ])
    // unknown: custom-a, custom-b (input order)
    // pattern ^bg-: bg-white (stable)
    // tailwind: flex, p-4, text-red-500 — ordered by property (display → padding → color)
    const result = sortClasses('p-4 bg-white custom-a text-red-500 flex custom-b', ctx)
    expect(result).toBe('custom-a custom-b bg-white flex p-4 text-red-500')
  })
})

// ─── b) Realistic example from spec ───

describe('integration — realistic class-order example from spec', () => {
  it('["unknown", {pattern:"^icon"}, "tailwind", {pattern:"^js-"}] — patterns win, unknown catches only leftover nulls', () => {
    // Priority-based: explicit patterns always win over `unknown` / `tailwind` catchalls,
    // regardless of position. `unknown` receives only null-bigint classes that no pattern claims.
    const ctx = createMockContext([
      ['unknown', { pattern: '^icon' }, 'tailwind', { pattern: '^js-' }],
      { unspecified: 'top' }
    ])
    const result = sortClasses('p-4 icon js-toggle search-input text-lg icon--search flex', ctx)
    // Priority assignment: icon/icon--search → ^icon, js-toggle → ^js-,
    //                     search-input → unknown, flex/p-4/text-lg → tailwind.
    // Output order follows config:
    //   unknown:   [search-input]
    //   ^icon:     [icon, icon--search]
    //   tailwind:  [flex, p-4, text-lg]   (sorted)
    //   ^js-:      [js-toggle]
    expect(result).toBe('search-input icon icon--search flex p-4 text-lg js-toggle')
  })

  it('moving pattern BEFORE "unknown" in config only changes output order — membership is unchanged', () => {
    // Same classes are routed to the same buckets; only where each bucket appears in the
    // final output differs (^icon is now emitted first).
    const ctx = createMockContext([
      [{ pattern: '^icon' }, 'unknown', 'tailwind', { pattern: '^js-' }],
      { unspecified: 'top' }
    ])
    const result = sortClasses('p-4 icon js-toggle search-input text-lg icon--search flex', ctx)
    // Output order:
    //   ^icon:     [icon, icon--search]
    //   unknown:   [search-input]
    //   tailwind:  [flex, p-4, text-lg]
    //   ^js-:      [js-toggle]
    expect(result).toBe('icon icon--search search-input flex p-4 text-lg js-toggle')
  })
})

// ─── c) n:class with pattern bucket — token-level sorter parity ───

describe('integration — n:class class-order parity with sortClasses', () => {
  it('applies bucket algorithm at token level (matches sortClasses behavior)', () => {
    const ctx = createMockContext([
      [{ pattern: '^icon' }, 'unknown', 'tailwind', { pattern: '^js-' }],
      { unspecified: 'top' }
    ])
    // Bare-identifier sortable tokens route through the same bucketing as sortClasses
    const result = sortNClassValue('p-4, icon, js-toggle, search-input, text-lg, icon--search, flex', ctx, nclassOpts)
    // ^icon:    [icon, icon--search]
    // unknown:  [search-input]
    // tailwind: [flex, p-4, text-lg]
    // ^js-:     [js-toggle]
    expect(result).toBe('icon, icon--search, search-input, flex, p-4, text-lg, js-toggle')
  })

  it('barrier tokens split bucketing per group', () => {
    const ctx = createMockContext([[{ pattern: '^icon' }, 'tailwind'], { unspecified: 'top' }])
    // Group 1: icon, flex, p-4 — icon goes to pattern bucket, flex/p-4 to tailwind
    // Barrier: $isOpen ? 'block' : 'hidden' (non-sortable)
    // Group 2: icon--open, text-lg — icon--open to pattern bucket, text-lg to tailwind
    const result = sortNClassValue(
      "icon, flex, p-4, $isOpen ? 'block' : 'hidden', icon--open, text-lg",
      ctx,
      nclassOpts
    )
    expect(result).toBe("icon, flex, p-4, $isOpen ? 'block' : 'hidden', icon--open, text-lg")
  })

  it('pattern bucket inside a multi-class quoted token (via sortClasses recursion)', () => {
    const ctx = createMockContext([['unknown', { pattern: '^icon' }, 'tailwind'], { unspecified: 'top' }])
    // Multi-class quoted string is sorted via sortClasses internally
    const result = sortNClassValue("'p-4 icon flex icon--x'", ctx, nclassOpts)
    expect(result).toBe("'icon icon--x flex p-4'")
  })
})

// ─── d) Pattern priority: patterns always win over tailwind catchall ───

describe('integration — pattern priority over tailwind catchall', () => {
  it('pattern defined BEFORE "tailwind" claims matching TW utilities; output starts with pattern bucket', () => {
    const ctx = createMockContext([[{ pattern: '^b' }, 'tailwind'], { unspecified: 'top' }])
    const result = sortClasses('flex border bg-white p-4', ctx)
    // ^b (stable):  [border, bg-white]    (input order; both are known TW but pattern wins)
    // tailwind:     [flex, p-4]           (sorted)
    expect(result).toBe('border bg-white flex p-4')
  })

  it('pattern defined AFTER "tailwind" also claims matches — same membership, later output position', () => {
    const ctx = createMockContext([['tailwind', { pattern: '^b' }], { unspecified: 'top' }])
    const result = sortClasses('flex border bg-white p-4', ctx)
    // tailwind:  [flex, p-4]
    // ^b:        [border, bg-white]
    expect(result).toBe('flex p-4 border bg-white')
  })
})

// ─── d.2) Priority model beats catchall position — fokus-optik real case ───

describe('integration — priority model: patterns beat tailwind/unknown catchalls', () => {
  it('pattern AFTER "tailwind" still claims classes with non-null bigint (fokus-optik ajax case)', () => {
    // Simulates the fokus-optik scenario where `ajax` and `js-*` would be mapped by
    // Tailwind as known utilities (non-null bigint) via user CSS. A naive greedy
    // algorithm with tailwind-before-pattern would put them in the tailwind bucket,
    // breaking the user's intent. Priority model ensures patterns always win.
    const { context } = createMockDesignSystem()
    // Simulate ajax being a known TW utility (e.g. from @utility or @source)
    const origGetClassOrder = context.getClassOrder
    context.getClassOrder = (classList) =>
      classList.map((c): [string, bigint | null] => {
        if (c === 'ajax') return [c, 5000n]
        const pair = origGetClassOrder([c])[0]
        return pair
      })
    const parsed = parseClassOrderConfig([
      ['unknown', { pattern: '^icon(?:--|$)' }, 'tailwind', { pattern: '^ajax' }, { pattern: '^js-' }],
      { unspecified: 'top' }
    ])
    if (parsed) context.classOrder = parsed

    const result = sortClasses('w-full ajax', context)
    // w-full → tailwind, ajax → ^ajax pattern (priority, even though after tailwind)
    // Output: tailwind [w-full], then ^ajax [ajax]
    expect(result).toBe('w-full ajax')
  })

  it('pattern position in config controls output position only', () => {
    const { context } = createMockDesignSystem()
    const origGetClassOrder = context.getClassOrder
    context.getClassOrder = (classList) =>
      classList.map((c): [string, bigint | null] => (c === 'ajax' ? [c, 5000n] : origGetClassOrder([c])[0]))

    const parsedAfter = parseClassOrderConfig([['tailwind', { pattern: '^ajax' }], { unspecified: 'top' }])
    const parsedBefore = parseClassOrderConfig([[{ pattern: '^ajax' }, 'tailwind'], { unspecified: 'top' }])

    const ctxAfter = { ...context, classOrder: parsedAfter! }
    const ctxBefore = { ...context, classOrder: parsedBefore! }

    // w-full bigint=101, p-4 bigint=200 → tailwind sort ascending: w-full, p-4
    expect(sortClasses('w-full ajax p-4', ctxAfter)).toBe('w-full p-4 ajax')
    expect(sortClasses('w-full ajax p-4', ctxBefore)).toBe('ajax w-full p-4')
    // Same membership (ajax → ^ajax, w-full/p-4 → tailwind), different output order
  })
})

// ─── e) unspecified: 'bottom' in realistic Latte-like input ───

describe('integration — unspecified: bottom', () => {
  it('places unmatched classes at the END when unspecified is bottom', () => {
    // Buckets cover tailwind + ^icon only; custom (leftover-unknown) and js-toggle
    // (non-matching) fall into "unspecified".
    const ctx = createMockContext([[{ pattern: '^icon' }, 'tailwind'], { unspecified: 'bottom' }])
    const result = sortClasses('p-4 js-toggle icon flex custom-a icon--x', ctx)
    // pattern ^icon: icon, icon--x (stable)
    // tailwind: flex, p-4 (bigint sort)
    // unspecified @ bottom (stable input order of remaining): js-toggle, custom-a
    expect(result).toBe('icon icon--x flex p-4 js-toggle custom-a')
  })

  it('places unmatched classes at the TOP when unspecified is top', () => {
    const ctx = createMockContext([[{ pattern: '^icon' }, 'tailwind'], { unspecified: 'top' }])
    const result = sortClasses('p-4 js-toggle icon flex custom-a icon--x', ctx)
    // unspecified @ top (stable): js-toggle, custom-a
    // pattern ^icon: icon, icon--x
    // tailwind: flex, p-4
    expect(result).toBe('js-toggle custom-a icon icon--x flex p-4')
  })
})

// ─── f) Default context (no option) preserves today's behavior ───

describe('integration — default class-order context (no option)', () => {
  it('equals implicit config [["unknown","tailwind"], {unspecified:"top"}]', () => {
    // Build two contexts: one with no class-order config (→ default), one with
    // the explicit equivalent — both must produce the same output.
    const ctxDefault = createMockContext()
    const ctxExplicit = createMockContext([['unknown', 'tailwind'], { unspecified: 'top' }])
    const input = 'p-4 custom-a flex custom-b w-5'
    expect(sortClasses(input, ctxDefault)).toBe(sortClasses(input, ctxExplicit))
    // Both should produce: unknown first (stable), tailwind after (bigint asc)
    expect(sortClasses(input, ctxDefault)).toBe('custom-a custom-b flex w-5 p-4')
  })

  it('default context matches legacy "unknown FIRST → tailwind ASC" behavior', () => {
    const ctx = createMockContext()
    const result = sortClasses('p-4 js-hook flex w-5 some-custom', ctx)
    // unknown (stable): js-hook, some-custom
    // tailwind (bigint asc): flex(10) w-5(100) p-4(200)
    expect(result).toBe('js-hook some-custom flex w-5 p-4')
  })
})

// ─── g) BEM scenario in a realistic context ───

describe('integration — BEM classes in pattern bucket', () => {
  it('keeps icon + icon--check in input order inside pattern bucket; TW utilities sorted', () => {
    const ctx = createMockContext([[{ pattern: '^icon' }, 'tailwind'], { unspecified: 'top' }])
    const result = sortClasses('p-4 icon icon--check flex', ctx)
    // pattern ^icon (stable): icon, icon--check
    // tailwind (sorted): flex, p-4
    expect(result).toBe('icon icon--check flex p-4')
  })

  it('BEM base/modifier order preserved even when modifier precedes base in input', () => {
    const ctx = createMockContext([[{ pattern: '^icon' }, 'tailwind'], { unspecified: 'top' }])
    // Stable = respects input order — if user writes modifier first, it stays first
    const result = sortClasses('icon--check icon flex', ctx)
    expect(result).toBe('icon--check icon flex')
  })

  it('BEM works the same inside n:class token group', () => {
    const ctx = createMockContext([[{ pattern: '^icon' }, 'tailwind'], { unspecified: 'top' }])
    const result = sortNClassValue('p-4, icon, icon--check, flex', ctx, nclassOpts)
    expect(result).toBe('icon, icon--check, flex, p-4')
  })
})
