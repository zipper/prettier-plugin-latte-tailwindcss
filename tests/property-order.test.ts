import { describe, expect, it } from 'vitest'
import {
  computeVariantKey,
  createPropertyOrderContext,
  extractPrimaryProperty,
  getClassSortInfo,
  parsePropertyOrderConfig,
  UNSPECIFIED_IGNORE
} from '../src/property-order'
import type { DesignSystemForPropertyOrder } from '../src/property-order'

// ─── parsePropertyOrderConfig ───

describe('parsePropertyOrderConfig', () => {
  it('parses flat array of strings', () => {
    const result = parsePropertyOrderConfig(['display', 'position', 'width'])
    expect(result).toEqual({ properties: ['display', 'position', 'width'], unspecified: 'bottom' })
  })

  it('parses stylelint-order format: [items, secondaryOptions]', () => {
    const result = parsePropertyOrderConfig([
      ['display', 'position', 'width'],
      { unspecified: 'top', severity: 'warning' }
    ])
    expect(result).toEqual({ properties: ['display', 'position', 'width'], unspecified: 'top' })
  })

  it('parses grouped objects with properties', () => {
    const result = parsePropertyOrderConfig([
      { groupName: 'Layout', properties: ['display', 'flex'] },
      { groupName: 'Size', properties: ['width', 'height'] }
    ])
    expect(result).toEqual({ properties: ['display', 'flex', 'width', 'height'], unspecified: 'bottom' })
  })

  it('parses mixed strings and objects', () => {
    const result = parsePropertyOrderConfig([
      'position',
      { groupName: 'Box', properties: ['display', 'width'] },
      'color'
    ])
    expect(result).toEqual({ properties: ['position', 'display', 'width', 'color'], unspecified: 'bottom' })
  })

  it('parses stylelint config with rules', () => {
    const result = parsePropertyOrderConfig({
      rules: {
        'order/properties-order': [['display', 'width'], { unspecified: 'bottomAlphabetical' }]
      }
    })
    expect(result).toEqual({ properties: ['display', 'width'], unspecified: 'bottomAlphabetical' })
  })

  it('parses flat stylelint config (no rules wrapper)', () => {
    const result = parsePropertyOrderConfig({
      'order/properties-order': [['display', 'width'], { unspecified: 'ignore' }]
    })
    expect(result).toEqual({ properties: ['display', 'width'], unspecified: 'ignore' })
  })

  it('returns null for empty array', () => {
    expect(parsePropertyOrderConfig([])).toBeNull()
  })

  it('returns null for non-array non-object', () => {
    expect(parsePropertyOrderConfig('string' as any)).toBeNull()
  })

  it('returns null for object without recognized keys', () => {
    expect(parsePropertyOrderConfig({ foo: 'bar' })).toBeNull()
  })

  it('defaults unspecified to bottom when not provided', () => {
    const result = parsePropertyOrderConfig([['display'], {}])
    expect(result?.unspecified).toBe('bottom')
  })
})

// ─── extractPrimaryProperty ───

describe('extractPrimaryProperty', () => {
  it('extracts property from simple declaration', () => {
    const ast = [[{ kind: 'declaration', property: 'display' }]]
    expect(extractPrimaryProperty(ast as any)).toBe('display')
  })

  it('skips --tw-* custom properties', () => {
    const ast = [
      [
        { kind: 'declaration', property: '--tw-shadow' },
        { kind: 'declaration', property: 'box-shadow' }
      ]
    ]
    expect(extractPrimaryProperty(ast as any)).toBe('box-shadow')
  })

  it('traverses nested rules', () => {
    const ast = [
      [
        {
          kind: 'rule',
          nodes: [
            {
              kind: 'rule',
              nodes: [{ kind: 'declaration', property: 'width' }]
            }
          ]
        }
      ]
    ]
    expect(extractPrimaryProperty(ast as any)).toBe('width')
  })

  it('returns null for empty AST', () => {
    expect(extractPrimaryProperty([])).toBeNull()
  })

  it('returns null for AST with only --tw-* properties', () => {
    const ast = [[{ kind: 'declaration', property: '--tw-translate-x' }]]
    expect(extractPrimaryProperty(ast as any)).toBeNull()
  })

  it('returns first non-tw property from multi-property utility', () => {
    const ast = [
      [
        { kind: 'declaration', property: '--tw-font-size' },
        { kind: 'declaration', property: 'font-size' },
        { kind: 'declaration', property: 'line-height' }
      ]
    ]
    expect(extractPrimaryProperty(ast as any)).toBe('font-size')
  })
})

// ─── computeVariantKey ───

describe('computeVariantKey', () => {
  const variantA = { kind: 'static', name: 'hover' }
  const variantB = { kind: 'static', name: 'md' }
  const variantC = { kind: 'arbitrary' }

  const variantOrderMap = new Map<any, number>([
    [variantA, 15],
    [variantB, 24]
  ])

  it('returns -1 for no variants', () => {
    expect(computeVariantKey([], variantOrderMap)).toBe(-1)
  })

  it('returns variant order for single variant', () => {
    expect(computeVariantKey([variantA], variantOrderMap)).toBe(15)
  })

  it('encodes multiple variants as composite key', () => {
    expect(computeVariantKey([variantB, variantA], variantOrderMap)).toBe(15 * 10000 + 24)
  })

  it('same composite key regardless of variant order', () => {
    const key1 = computeVariantKey([variantA, variantB], variantOrderMap)
    const key2 = computeVariantKey([variantB, variantA], variantOrderMap)
    expect(key1).toBe(key2)
  })

  it('arbitrary variants get high order (9998)', () => {
    expect(computeVariantKey([variantC], variantOrderMap)).toBe(9998)
  })
})

// ─── createPropertyOrderContext + getClassSortInfo ───

describe('createPropertyOrderContext', () => {
  function mockDesignSystem(): DesignSystemForPropertyOrder {
    const variantHover = { kind: 'static', name: 'hover' }
    const variantMd = { kind: 'static', name: 'md' }

    const astMap: Record<string, any[][]> = {
      flex: [[{ kind: 'declaration', property: 'display' }]],
      'w-5': [[{ kind: 'declaration', property: 'width' }]],
      'p-4': [[{ kind: 'declaration', property: 'padding' }]],
      'text-lg': [
        [
          { kind: 'declaration', property: '--tw-font-size' },
          { kind: 'declaration', property: 'font-size' },
          { kind: 'declaration', property: 'line-height' }
        ]
      ],
      'md:flex': [[{ kind: 'rule', nodes: [{ kind: 'declaration', property: 'display' }] }]],
      'md:w-5': [[{ kind: 'rule', nodes: [{ kind: 'declaration', property: 'width' }] }]],
      'hover:flex': [[{ kind: 'declaration', property: 'display' }]],
      'unknown-class': [[]]
    }

    const candidateMap: Record<string, any[]> = {
      flex: [{ root: 'flex', variants: [], important: false }],
      'w-5': [{ root: 'w-5', variants: [], important: false }],
      'p-4': [{ root: 'p-4', variants: [], important: false }],
      'text-lg': [{ root: 'text-lg', variants: [], important: false }],
      'md:flex': [{ root: 'flex', variants: [variantMd], important: false }],
      'md:w-5': [{ root: 'w-5', variants: [variantMd], important: false }],
      'hover:flex': [{ root: 'flex', variants: [variantHover], important: false }],
      'unknown-class': []
    }

    const variantOrderMap = new Map<any, number>([
      [variantHover, 15],
      [variantMd, 24]
    ])

    return {
      candidatesToAst: (classes) => classes.map((c) => astMap[c]?.[0] ?? []),
      parseCandidate: (candidate) => candidateMap[candidate] ?? [],
      getVariantOrder: () => variantOrderMap,
      getVariants: () => [{ name: 'hover' }, { name: 'md' }]
    }
  }

  it('creates context with correct property order map', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display', 'width', 'padding'], unspecified: 'bottom' }, ds)
    expect(ctx.propertyOrderMap.get('display')).toBe(0)
    expect(ctx.propertyOrderMap.get('width')).toBe(1)
    expect(ctx.propertyOrderMap.get('padding')).toBe(2)
  })

  it('getClassSortInfo returns correct info for base class', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display', 'width', 'padding'], unspecified: 'bottom' }, ds)
    const info = getClassSortInfo('flex', ctx)
    expect(info.variantKey).toBe(-1)
    expect(info.propIndex).toBe(0) // display → index 0
  })

  it('getClassSortInfo returns correct info for variant class', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display', 'width', 'padding'], unspecified: 'bottom' }, ds)
    const info = getClassSortInfo('md:flex', ctx)
    expect(info.variantKey).toBe(24) // md variant order
    expect(info.propIndex).toBe(0) // display → index 0
  })

  it('getClassSortInfo caches results', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display', 'width'], unspecified: 'bottom' }, ds)
    const info1 = getClassSortInfo('flex', ctx)
    const info2 = getClassSortInfo('flex', ctx)
    expect(info1).toBe(info2) // Same reference
  })

  it('unspecified class gets bottom position', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display'], unspecified: 'bottom' }, ds)
    const info = getClassSortInfo('w-5', ctx) // width not in config
    expect(info.propIndex).toBe(999_000) // UNSPECIFIED_BOTTOM
  })

  it('unspecified class gets top position with unspecified=top', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display'], unspecified: 'top' }, ds)
    const info = getClassSortInfo('w-5', ctx)
    expect(info.propIndex).toBe(-1)
  })

  it('unspecified=ignore returns special UNSPECIFIED_IGNORE value', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display'], unspecified: 'ignore' }, ds)
    const info = getClassSortInfo('w-5', ctx)
    expect(info.propIndex).toBe(UNSPECIFIED_IGNORE)
  })

  it('unknown class (no AST output) gets unspecified position', () => {
    const ds = mockDesignSystem()
    const ctx = createPropertyOrderContext({ properties: ['display', 'width'], unspecified: 'bottom' }, ds)
    const info = getClassSortInfo('unknown-class', ctx)
    expect(info.propIndex).toBe(999_000)
  })
})
