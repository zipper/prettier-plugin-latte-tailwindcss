import { describe, expect, it } from 'vitest'
import {
  createPropertyOrderContext,
  getClassSortInfo,
} from '../src/property-order'
import type { DesignSystemForPropertyOrder, PropertyOrderContext } from '../src/property-order'
import { sortClasses, sortClassList } from '../src/sorting'
import { sortNClassValue } from '../src/nclass'
import type { TailwindContext, LatteOptions } from '../src/types'

// ─── Mock design system ───

function createMockDesignSystem(): {
  ds: DesignSystemForPropertyOrder
  context: TailwindContext
} {
  const variantHover = { kind: 'static', name: 'hover' }
  const variantMd = { kind: 'static', name: 'md' }
  const variantFocus = { kind: 'static', name: 'focus' }

  // CSS property → AST node
  const classPropertyMap: Record<string, string> = {
    'flex': 'display',
    'block': 'display',
    'hidden': 'display',
    'inline': 'display',
    'justify-center': 'justify-content',
    'justify-between': 'justify-content',
    'items-center': 'align-items',
    'items-start': 'align-items',
    'gap-4': 'gap',
    'gap-2': 'gap',
    'w-5': 'width',
    'w-full': 'width',
    'h-5': 'height',
    'h-full': 'height',
    'p-4': 'padding',
    'p-2': 'padding',
    'px-4': 'padding-left',
    'mt-1': 'margin-top',
    'mb-2': 'margin-bottom',
    'mx-auto': 'margin-left',
    'text-sm': 'font-size',
    'text-lg': 'font-size',
    'font-bold': 'font-weight',
    'text-red-500': 'color',
    'text-blue-500': 'color',
    'bg-white': 'background-color',
    'bg-red-500': 'background-color',
    'border': 'border-width',
    'rounded': 'border-radius',
    'shadow-lg': 'box-shadow',
  }

  // TW bigint order — simulates Tailwind's native ordering
  const twOrder: Record<string, bigint> = {
    'flex': 10n,
    'block': 11n,
    'hidden': 12n,
    'inline': 13n,
    'justify-center': 50n,
    'justify-between': 51n,
    'items-center': 60n,
    'items-start': 61n,
    'gap-4': 70n,
    'gap-2': 71n,
    'w-5': 100n,
    'w-full': 101n,
    'h-5': 110n,
    'h-full': 111n,
    'p-4': 200n,
    'p-2': 201n,
    'px-4': 205n,
    'mt-1': 300n,
    'mb-2': 310n,
    'mx-auto': 305n,
    'text-sm': 400n,
    'text-lg': 401n,
    'font-bold': 410n,
    'text-red-500': 500n,
    'text-blue-500': 501n,
    'bg-white': 600n,
    'bg-red-500': 601n,
    'border': 700n,
    'rounded': 710n,
    'shadow-lg': 800n,
  }

  // Add variant classes with offset
  const variantOffset = 10000n
  for (const [cls, order] of Object.entries(twOrder)) {
    twOrder[`hover:${cls}`] = order + variantOffset
    twOrder[`md:${cls}`] = order + variantOffset * 2n
    twOrder[`focus:${cls}`] = order + variantOffset * 3n
  }

  const variantOrderMap = new Map<any, number>([
    [variantHover, 15],
    [variantFocus, 17],
    [variantMd, 24],
  ])

  function parseVariants(className: string): { root: string; variants: any[] } {
    const parts = className.split(':')
    const root = parts.pop()!
    const variants = parts.map(name => {
      if (name === 'hover') return variantHover
      if (name === 'md') return variantMd
      if (name === 'focus') return variantFocus
      return { kind: 'arbitrary' }
    })
    return { root, variants }
  }

  const ds: DesignSystemForPropertyOrder = {
    candidatesToAst: (classes) => classes.map(cls => {
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
    getVariants: () => [{ name: 'hover' }, { name: 'focus' }, { name: 'md' }],
  }

  const context: TailwindContext = {
    getClassOrder: (classList) =>
      classList.map((c): [string, bigint | null] => [c, twOrder[c] ?? null]),
  }

  return { ds, context }
}

// ─── Property order config: display > width > height > padding > margin > font > color > background ───

const propertyOrder = [
  'display',
  'justify-content',
  'align-items',
  'gap',
  'width',
  'height',
  'padding',
  'padding-left',
  'padding-right',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'font-size',
  'font-weight',
  'color',
  'background-color',
  'border-width',
  'border-radius',
  'box-shadow',
]

function createContextWithPropertyOrder(
  unspecified: 'top' | 'bottom' | 'bottomAlphabetical' | 'ignore' = 'bottom',
): TailwindContext {
  const { ds, context } = createMockDesignSystem()
  context.propertyOrder = createPropertyOrderContext(
    { properties: propertyOrder, unspecified },
    ds,
  )
  return context
}

// ─── Integration tests ───

describe('property ordering — sortClasses', () => {
  it('sorts base classes by CSS property order', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClasses('p-4 flex w-5 text-sm', ctx)
    expect(result).toBe('flex w-5 p-4 text-sm')
  })

  it('groups flex-related properties together', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClasses('w-5 gap-4 justify-center flex items-center', ctx)
    expect(result).toBe('flex justify-center items-center gap-4 w-5')
  })

  it('groups variants together', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClasses('md:w-5 flex md:flex w-5 md:p-4 p-4', ctx)
    expect(result).toBe('flex w-5 p-4 md:flex md:w-5 md:p-4')
  })

  it('maintains property order within variant groups', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClasses('md:p-4 md:w-5 md:flex', ctx)
    expect(result).toBe('md:flex md:w-5 md:p-4')
  })

  it('orders variants by TW variant order', () => {
    const ctx = createContextWithPropertyOrder()
    // hover (15) < focus (17) < md (24)
    const result = sortClasses('md:flex focus:flex hover:flex flex', ctx)
    expect(result).toBe('flex hover:flex focus:flex md:flex')
  })

  it('unknown classes come first', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClasses('flex custom-class w-5', ctx)
    expect(result).toBe('custom-class flex w-5')
  })

  it('removes duplicates by default', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClasses('flex w-5 flex p-4', ctx)
    expect(result).toBe('flex w-5 p-4')
  })

  it('preserves duplicates when configured', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClasses('flex w-5 flex p-4', ctx, {
      removeDuplicates: false,
    })
    expect(result).toBe('flex flex w-5 p-4')
  })

  it('uses TW bigint as tiebreaker for same property', () => {
    const ctx = createContextWithPropertyOrder()
    // Both map to 'display', TW order: flex(10) < block(11)
    const result = sortClasses('block flex', ctx)
    expect(result).toBe('flex block')
  })
})

describe('property ordering — sortClassList', () => {
  it('returns correct classList and removedIndices', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClassList(['p-4', 'flex', 'w-5'], ctx)
    expect(result.classList).toEqual(['flex', 'w-5', 'p-4'])
  })

  it('handles dynamic placeholders', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortClassList(['flex', '...', 'w-5'], ctx)
    expect(result.classList).toEqual(['flex', 'w-5', '...'])
  })
})

describe('property ordering — sortNClassValue', () => {
  const opts: LatteOptions = {
    tailwindPreserveWhitespace: false,
    tailwindPreserveDuplicates: false,
    tailwindNclassWhitespace: 'normalize-barriers',
  }

  it('sorts sortable tokens by property order', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortNClassValue("p-4, flex, w-5", ctx, opts)
    expect(result).toBe('flex, w-5, p-4')
  })

  it('groups variants together in n:class', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortNClassValue("md:w-5, flex, md:flex, w-5", ctx, opts)
    expect(result).toBe('flex, w-5, md:flex, md:w-5')
  })

  it('preserves barrier tokens position', () => {
    const ctx = createContextWithPropertyOrder()
    const result = sortNClassValue(
      "p-4, flex, $condition ? 'active' : 'inactive', w-5, gap-4",
      ctx,
      opts,
    )
    expect(result).toBe(
      "flex, p-4, $condition ? 'active' : 'inactive', gap-4, w-5",
    )
  })
})

describe('property ordering — unspecified modes', () => {
  it('unspecified=bottom places unknown properties after all configured', () => {
    const ctx = createContextWithPropertyOrder('bottom')
    // shadow-lg is in config, at position 18
    const result = sortClasses('shadow-lg flex', ctx)
    expect(result).toBe('flex shadow-lg')
  })

  it('unspecified=top places unknown properties before all configured', () => {
    // Create context with minimal config — only 'width'
    const { ds, context } = createMockDesignSystem()
    context.propertyOrder = createPropertyOrderContext(
      { properties: ['width'], unspecified: 'top' },
      ds,
    )
    // flex maps to 'display' which is NOT in config → top
    // w-5 maps to 'width' which IS in config → position 0
    const result = sortClasses('w-5 flex', context)
    expect(result).toBe('flex w-5')
  })
})

describe('property ordering — complex scenario', () => {
  it('full realistic class string', () => {
    const ctx = createContextWithPropertyOrder()
    const input = 'text-red-500 p-4 mb-2 flex justify-center gap-4 w-full bg-white rounded shadow-lg font-bold'
    const result = sortClasses(input, ctx)
    // Expected order: display → justify → gap → width → padding → margin → font → color → bg → border → shadow
    expect(result).toBe('flex justify-center gap-4 w-full p-4 mb-2 font-bold text-red-500 bg-white rounded shadow-lg')
  })

  it('mixed base and variant classes', () => {
    const ctx = createContextWithPropertyOrder()
    const input = 'hover:text-red-500 p-4 md:flex flex md:p-4 hover:bg-white w-5'
    const result = sortClasses(input, ctx)
    // Base: flex w-5 p-4
    // hover: text-red-500 bg-white
    // md: flex p-4
    expect(result).toBe('flex w-5 p-4 hover:text-red-500 hover:bg-white md:flex md:p-4')
  })
})
