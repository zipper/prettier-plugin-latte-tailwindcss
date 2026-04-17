import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyBuckets,
  defaultClassOrderContext,
  parseClassOrderConfig,
  resolveClassOrderConfig,
  type ClassOrderContext
} from '../src/class-order'

// ─── parseClassOrderConfig ───

describe('parseClassOrderConfig', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('parses flat array form ["unknown", "tailwind"]', () => {
    const ctx = parseClassOrderConfig(['unknown', 'tailwind'])
    expect(ctx).not.toBeNull()
    expect(ctx!.buckets).toEqual([
      { kind: 'unknown', raw: 'unknown' },
      { kind: 'tailwind', raw: 'tailwind' }
    ])
    expect(ctx!.unspecified).toBe('top')
  })

  it('parses tuple form [[items], {unspecified:"bottom"}]', () => {
    const ctx = parseClassOrderConfig([['unknown', 'tailwind'], { unspecified: 'bottom' }])
    expect(ctx).not.toBeNull()
    expect(ctx!.buckets.map((b) => b.kind)).toEqual(['unknown', 'tailwind'])
    expect(ctx!.unspecified).toBe('bottom')
  })

  it('tuple form without unspecified defaults to "top"', () => {
    const ctx = parseClassOrderConfig([['unknown', 'tailwind'], {}])
    expect(ctx!.unspecified).toBe('top')
  })

  it('warns on invalid unspecified value and defaults to "top"', () => {
    const ctx = parseClassOrderConfig([['unknown'], { unspecified: 'middle' }])
    expect(ctx!.unspecified).toBe('top')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('normalizes "tailwindcss" alias to kind:"tailwind"', () => {
    const aliased = parseClassOrderConfig(['tailwindcss'])
    const canonical = parseClassOrderConfig(['tailwind'])
    expect(aliased!.buckets[0].kind).toBe('tailwind')
    expect(canonical!.buckets[0].kind).toBe('tailwind')
    // raw preserved for diagnostics
    expect(aliased!.buckets[0].raw).toBe('tailwindcss')
    expect(canonical!.buckets[0].raw).toBe('tailwind')
  })

  it('compiles pattern bucket into RegExp', () => {
    const ctx = parseClassOrderConfig([{ pattern: '^js-' }])
    expect(ctx!.buckets).toHaveLength(1)
    const b = ctx!.buckets[0]
    expect(b.kind).toBe('pattern')
    expect(b.regex).toBeInstanceOf(RegExp)
    expect(b.regex!.test('js-toggle')).toBe(true)
    expect(b.regex!.test('flex')).toBe(false)
  })

  it('drops invalid regex bucket but keeps the rest of the config', () => {
    const ctx = parseClassOrderConfig(['unknown', { pattern: '[' }, 'tailwind'])
    expect(ctx).not.toBeNull()
    expect(ctx!.buckets.map((b) => b.kind)).toEqual(['unknown', 'tailwind'])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns null for empty array (warn)', () => {
    const ctx = parseClassOrderConfig([])
    expect(ctx).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns null when every bucket is invalid', () => {
    const ctx = parseClassOrderConfig([{ pattern: '[' }, 'bogus'])
    expect(ctx).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns null for non-array input', () => {
    expect(parseClassOrderConfig('unknown' as any)).toBeNull()
    expect(parseClassOrderConfig({} as any)).toBeNull()
    expect(parseClassOrderConfig(null)).toBeNull()
    expect(parseClassOrderConfig(undefined)).toBeNull()
  })

  it('warns and skips object bucket without "pattern" field', () => {
    const ctx = parseClassOrderConfig(['tailwind', { foo: 'bar' } as any])
    expect(ctx!.buckets.map((b) => b.kind)).toEqual(['tailwind'])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('warns and skips unknown string bucket', () => {
    const ctx = parseClassOrderConfig(['tailwind', 'weird-bucket'])
    expect(ctx!.buckets.map((b) => b.kind)).toEqual(['tailwind'])
    expect(warnSpy).toHaveBeenCalled()
  })
})

// ─── resolveClassOrderConfig ───

describe('resolveClassOrderConfig', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  const fixtureDir = path.resolve(__dirname, 'fixtures', 'class-order')
  const testCwd = __dirname // directory tests/ — from here `./fixtures/class-order/basic.json` works

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns default for undefined', async () => {
    const ctx = await resolveClassOrderConfig(undefined, testCwd)
    expect(ctx.buckets.map((b) => b.kind)).toEqual(['unknown', 'tailwind'])
    expect(ctx.unspecified).toBe('top')
  })

  it('returns default for empty string', async () => {
    const ctx = await resolveClassOrderConfig('', testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
  })

  it('returns default for whitespace-only string without loading from disk', async () => {
    const ctx = await resolveClassOrderConfig('   ', testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    // no warn expected — empty string is a valid "off" signal
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('parses a direct array', async () => {
    const ctx = await resolveClassOrderConfig(
      [['unknown', { pattern: '^js-' }, 'tailwind'], { unspecified: 'bottom' }],
      testCwd
    )
    expect(ctx.buckets.map((b) => b.kind)).toEqual(['unknown', 'pattern', 'tailwind'])
    expect(ctx.unspecified).toBe('bottom')
  })

  it('falls back to default when array config is invalid (empty)', async () => {
    const ctx = await resolveClassOrderConfig([], testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    expect(warnSpy).toHaveBeenCalled()
  })

  it('loads a JSON file via jiti (relative path)', async () => {
    const ctx = await resolveClassOrderConfig('./fixtures/class-order/basic.json', testCwd)
    expect(ctx.buckets.map((b) => b.kind)).toEqual(['unknown', 'pattern', 'tailwind'])
    expect(ctx.unspecified).toBe('bottom')
  })

  it('loads a JSON file via jiti (absolute path)', async () => {
    const ctx = await resolveClassOrderConfig(path.join(fixtureDir, 'flat.json'), testCwd)
    expect(ctx.buckets.map((b) => b.kind)).toEqual(['unknown', 'tailwind'])
  })

  it('falls back to default when loaded file has invalid shape', async () => {
    const ctx = await resolveClassOrderConfig('./fixtures/class-order/invalid.json', testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    expect(warnSpy).toHaveBeenCalled()
  })

  it('falls back to default for non-existent path', async () => {
    const ctx = await resolveClassOrderConfig('./fixtures/class-order/does-not-exist.json', testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    expect(warnSpy).toHaveBeenCalled()
  })

  it('warns and falls back for object input', async () => {
    const ctx = await resolveClassOrderConfig({ foo: 'bar' } as any, testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    expect(warnSpy).toHaveBeenCalled()
  })

  it('warns and falls back for number input', async () => {
    const ctx = await resolveClassOrderConfig(42 as any, testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    expect(warnSpy).toHaveBeenCalled()
  })

  it('warns and falls back for boolean input', async () => {
    const ctx = await resolveClassOrderConfig(true as any, testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    expect(warnSpy).toHaveBeenCalled()
  })

  it('warns and falls back for null input', async () => {
    const ctx = await resolveClassOrderConfig(null as any, testCwd)
    expect(ctx).toEqual(defaultClassOrderContext())
    expect(warnSpy).toHaveBeenCalled()
  })
})

// ─── applyBuckets ───

/** Minimal entry shape used by the tests. */
interface E {
  name: string
  bigint: bigint | null
}

function mkEntry(name: string, bigint: bigint | null): E {
  return { name, bigint }
}

const nameOf = (e: E) => e.name
const twBigintOf = (e: E) => e.bigint
/** Standard Tailwind comparator: sort by ascending bigint (non-null by contract). */
const cmpByBigint = (a: E, b: E): number => {
  if (a.bigint! < b.bigint!) return -1
  if (a.bigint! > b.bigint!) return 1
  return 0
}

describe('applyBuckets', () => {
  it('greedy: pattern bucket steals known TW utility when placed before "tailwind"', () => {
    const ctx: ClassOrderContext = {
      buckets: [
        { kind: 'pattern', regex: /^js-/, raw: { pattern: '^js-' } },
        { kind: 'tailwind', raw: 'tailwind' },
        { kind: 'unknown', raw: 'unknown' }
      ],
      unspecified: 'top'
    }
    // js-foo has a non-null bigint (simulating a hypothetical TW utility starting with "js-").
    const entries = [
      mkEntry('flex', 10n),
      mkEntry('js-toggle', null),
      mkEntry('js-foo', 5n), // "steal" candidate
      mkEntry('w-4', 7n)
    ]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    expect(sorted.map((e) => e.name)).toEqual([
      'js-toggle', // pattern bucket, input order
      'js-foo',
      'w-4', // tailwind bucket, sorted by bigint asc (5 already in js-, so just 7, 10)
      'flex'
    ])
  })

  it('missing "tailwind" bucket → known utilities go to unspecified position', () => {
    const ctxTop: ClassOrderContext = {
      buckets: [{ kind: 'unknown', raw: 'unknown' }],
      unspecified: 'top'
    }
    const entries = [mkEntry('flex', 10n), mkEntry('custom', null), mkEntry('w-4', 7n)]
    const sorted = applyBuckets(entries, ctxTop, nameOf, twBigintOf, cmpByBigint)
    // known utilities (flex, w-4) are unmatched → with unspecified:'top' they land first in input order
    expect(sorted.map((e) => e.name)).toEqual(['flex', 'w-4', 'custom'])
  })

  it('missing "unknown" bucket → unknown classes go to unspecified position', () => {
    const ctxBottom: ClassOrderContext = {
      buckets: [{ kind: 'tailwind', raw: 'tailwind' }],
      unspecified: 'bottom'
    }
    const entries = [mkEntry('js-hook', null), mkEntry('flex', 10n), mkEntry('w-4', 7n)]
    const sorted = applyBuckets(entries, ctxBottom, nameOf, twBigintOf, cmpByBigint)
    // tailwind bucket: [w-4 (7), flex (10)]; unknown unmatched → bottom
    expect(sorted.map((e) => e.name)).toEqual(['w-4', 'flex', 'js-hook'])
  })

  it('unspecified:"top" vs "bottom" placement of leftovers', () => {
    const leftoversOnly: ClassOrderContext = {
      buckets: [{ kind: 'pattern', regex: /^never-matches-anything$/, raw: { pattern: '^never-matches-anything$' } }],
      unspecified: 'top'
    }
    const entries = [mkEntry('a', null), mkEntry('b', 1n), mkEntry('c', null)]

    const top = applyBuckets(entries, leftoversOnly, nameOf, twBigintOf, cmpByBigint)
    expect(top.map((e) => e.name)).toEqual(['a', 'b', 'c'])

    const bottom = applyBuckets(entries, { ...leftoversOnly, unspecified: 'bottom' }, nameOf, twBigintOf, cmpByBigint)
    expect(bottom.map((e) => e.name)).toEqual(['a', 'b', 'c'])
  })

  it('combines matched + leftovers respecting unspecified=bottom', () => {
    const ctx: ClassOrderContext = {
      buckets: [{ kind: 'tailwind', raw: 'tailwind' }],
      unspecified: 'bottom'
    }
    const entries = [mkEntry('x', null), mkEntry('w-4', 7n), mkEntry('y', null), mkEntry('flex', 10n)]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    // tailwind bucket [w-4, flex] first, then leftover in input order
    expect(sorted.map((e) => e.name)).toEqual(['w-4', 'flex', 'x', 'y'])
  })

  it('stable input order in pattern bucket (BEM: icon--check-circle, icon)', () => {
    const ctx: ClassOrderContext = {
      buckets: [
        { kind: 'pattern', regex: /^icon/, raw: { pattern: '^icon' } },
        { kind: 'tailwind', raw: 'tailwind' },
        { kind: 'unknown', raw: 'unknown' }
      ],
      unspecified: 'top'
    }
    const entries = [mkEntry('icon--check-circle', null), mkEntry('icon', null)]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    // pattern bucket preserves input order — NO sort
    expect(sorted.map((e) => e.name)).toEqual(['icon--check-circle', 'icon'])
  })

  it('BEM scenario: "icon" then "icon--check-circle" both match ^icon — input order preserved', () => {
    const ctx: ClassOrderContext = {
      buckets: [
        { kind: 'pattern', regex: /^icon/, raw: { pattern: '^icon' } },
        { kind: 'tailwind', raw: 'tailwind' }
      ],
      unspecified: 'top'
    }
    const entries = [mkEntry('icon', null), mkEntry('icon--check-circle', null), mkEntry('flex', 10n)]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    expect(sorted.map((e) => e.name)).toEqual(['icon', 'icon--check-circle', 'flex'])
  })

  it('stable input order in unknown bucket', () => {
    const ctx: ClassOrderContext = {
      buckets: [
        { kind: 'unknown', raw: 'unknown' },
        { kind: 'tailwind', raw: 'tailwind' }
      ],
      unspecified: 'top'
    }
    const entries = [mkEntry('zeta', null), mkEntry('alpha', null), mkEntry('middle', null)]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    // unknown bucket preserves input order — NO alphabetical sort
    expect(sorted.map((e) => e.name)).toEqual(['zeta', 'alpha', 'middle'])
  })

  it('tailwind bucket calls the compareTailwind callback', () => {
    const ctx: ClassOrderContext = {
      buckets: [{ kind: 'tailwind', raw: 'tailwind' }],
      unspecified: 'top'
    }
    const entries = [mkEntry('c', 30n), mkEntry('a', 10n), mkEntry('b', 20n)]
    const spy = vi.fn(cmpByBigint)
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, spy)
    expect(sorted.map((e) => e.name)).toEqual(['a', 'b', 'c'])
    expect(spy).toHaveBeenCalled()
  })

  it('pattern does NOT invoke compareTailwind (no sort inside pattern bucket)', () => {
    const ctx: ClassOrderContext = {
      buckets: [{ kind: 'pattern', regex: /^x-/, raw: { pattern: '^x-' } }],
      unspecified: 'top'
    }
    const entries = [mkEntry('x-beta', 10n), mkEntry('x-alpha', 5n)]
    const spy = vi.fn(cmpByBigint)
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, spy)
    expect(sorted.map((e) => e.name)).toEqual(['x-beta', 'x-alpha'])
    expect(spy).not.toHaveBeenCalled()
  })

  it('unknown does NOT invoke compareTailwind', () => {
    const ctx: ClassOrderContext = {
      buckets: [{ kind: 'unknown', raw: 'unknown' }],
      unspecified: 'top'
    }
    const entries = [mkEntry('b', null), mkEntry('a', null)]
    const spy = vi.fn(cmpByBigint)
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, spy)
    expect(sorted.map((e) => e.name)).toEqual(['b', 'a'])
    expect(spy).not.toHaveBeenCalled()
  })

  it('greedy: first-matching bucket wins even when later ones could also match', () => {
    const ctx: ClassOrderContext = {
      // Order: js-* first, then tailwind — js-foo gets taken by js-* even though it has a bigint.
      buckets: [
        { kind: 'pattern', regex: /^js-/, raw: { pattern: '^js-' } },
        { kind: 'tailwind', raw: 'tailwind' }
      ],
      unspecified: 'top'
    }
    const entries = [mkEntry('js-foo', 5n), mkEntry('w-4', 7n)]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    expect(sorted.map((e) => e.name)).toEqual(['js-foo', 'w-4'])
  })

  it('empty input returns empty output', () => {
    const ctx = defaultClassOrderContext()
    expect(applyBuckets<E>([], ctx, nameOf, twBigintOf, cmpByBigint)).toEqual([])
  })

  it('default context replicates legacy "unknown FIRST → tailwind ASC" behavior', () => {
    const ctx = defaultClassOrderContext()
    const entries = [mkEntry('custom-a', null), mkEntry('flex', 10n), mkEntry('custom-b', null), mkEntry('w-4', 7n)]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    // unknown bucket (stable input order): custom-a, custom-b
    // tailwind bucket (sorted): w-4 (7), flex (10)
    expect(sorted.map((e) => e.name)).toEqual(['custom-a', 'custom-b', 'w-4', 'flex'])
  })

  it('full pipeline: ["unknown", {pattern:"^icon"}, "tailwind", {pattern:"^js-"}]', () => {
    const ctx: ClassOrderContext = {
      buckets: [
        { kind: 'unknown', raw: 'unknown' },
        { kind: 'pattern', regex: /^icon/, raw: { pattern: '^icon' } },
        { kind: 'tailwind', raw: 'tailwind' },
        { kind: 'pattern', regex: /^js-/, raw: { pattern: '^js-' } }
      ],
      unspecified: 'top'
    }
    const entries = [
      mkEntry('js-toggle', null),
      mkEntry('flex', 10n),
      mkEntry('icon--lg', null),
      mkEntry('custom-thing', null),
      mkEntry('icon', null),
      mkEntry('w-4', 7n)
    ]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    // unknown (null bigint, input order, minus anything that later patterns would
    // re-claim — but "unknown" runs first and subtracts):
    //   null entries are: js-toggle, icon--lg, custom-thing, icon
    //   → all go to unknown bucket in input order.
    // Nothing left for pattern^icon or pattern^js- because unknown took them.
    // tailwind bucket: [w-4 (7), flex (10)]
    expect(sorted.map((e) => e.name)).toEqual(['js-toggle', 'icon--lg', 'custom-thing', 'icon', 'w-4', 'flex'])
  })

  it('full pipeline ordering changes when pattern precedes unknown', () => {
    const ctx: ClassOrderContext = {
      buckets: [
        { kind: 'pattern', regex: /^icon/, raw: { pattern: '^icon' } },
        { kind: 'unknown', raw: 'unknown' },
        { kind: 'tailwind', raw: 'tailwind' },
        { kind: 'pattern', regex: /^js-/, raw: { pattern: '^js-' } }
      ],
      unspecified: 'top'
    }
    const entries = [
      mkEntry('js-toggle', null),
      mkEntry('flex', 10n),
      mkEntry('icon--lg', null),
      mkEntry('custom-thing', null),
      mkEntry('icon', null),
      mkEntry('w-4', 7n)
    ]
    const sorted = applyBuckets(entries, ctx, nameOf, twBigintOf, cmpByBigint)
    // pattern ^icon (input order): icon--lg, icon
    // unknown (remaining nulls): js-toggle, custom-thing
    // tailwind (sorted): w-4, flex
    // pattern ^js- (remaining after unknown stole it — none)
    expect(sorted.map((e) => e.name)).toEqual(['icon--lg', 'icon', 'js-toggle', 'custom-thing', 'w-4', 'flex'])
  })
})
