import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock all heavy dependencies before importing the module under test
vi.mock('jiti', () => ({
  createJiti: vi.fn(() => ({
    import: vi.fn(),
  })),
}))

vi.mock('../src/resolve', () => ({
  resolveJsFrom: vi.fn(),
  resolveCssFrom: vi.fn(),
}))

vi.mock('prettier', () => ({
  default: {
    resolveConfigFile: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('@import "tailwindcss";'),
}))

describe('loadTailwindContext', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns null when @tailwindcss/node is not found', async () => {
    const { resolveJsFrom } = await import('../src/resolve')
    vi.mocked(resolveJsFrom).mockImplementation(() => {
      throw new Error('Module not found')
    })

    // Fresh import to bypass module-level cache
    const { loadTailwindContext } = await import('../src/tailwind')
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await loadTailwindContext(undefined, '/test/file.latte')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('@tailwindcss/node not found'),
    )
    consoleSpy.mockRestore()
  })

  it('returns null when __unstable__loadDesignSystem is not a function', async () => {
    const { resolveJsFrom } = await import('../src/resolve')
    vi.mocked(resolveJsFrom).mockReturnValue('/fake/node_modules/@tailwindcss/node/index.mjs')

    const { createJiti } = await import('jiti')
    vi.mocked(createJiti).mockReturnValue({
      import: vi.fn().mockResolvedValue({ notTheRightExport: true }),
      esmResolve: vi.fn(),
    } as any)

    const { loadTailwindContext } = await import('../src/tailwind')
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await loadTailwindContext(undefined, '/test/file.latte')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not export __unstable__loadDesignSystem'),
    )
    consoleSpy.mockRestore()
  })

  it('returns context with getClassOrder when loading succeeds', async () => {
    const mockDesignSystem = {
      getClassOrder: vi.fn((classes: string[]) =>
        classes.map((c): [string, bigint | null] => [c, BigInt(0)]),
      ),
    }

    const { resolveJsFrom } = await import('../src/resolve')
    vi.mocked(resolveJsFrom).mockReturnValue('/fake/node_modules/@tailwindcss/node/index.mjs')

    const { createJiti } = await import('jiti')
    vi.mocked(createJiti).mockReturnValue({
      import: vi.fn().mockResolvedValue({
        __unstable__loadDesignSystem: vi.fn().mockResolvedValue(mockDesignSystem),
      }),
      esmResolve: vi.fn(),
    } as any)

    const { loadTailwindContext } = await import('../src/tailwind')
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await loadTailwindContext(undefined, '/test/file.latte')

    expect(result).not.toBeNull()
    expect(typeof result!.getClassOrder).toBe('function')

    const order = result!.getClassOrder(['flex', 'block'])
    expect(order).toHaveLength(2)
    expect(order[0][0]).toBe('flex')

    consoleSpy.mockRestore()
  })

  it('caches the context and calls __unstable__loadDesignSystem only once', async () => {
    const mockLoadDesignSystem = vi.fn().mockResolvedValue({
      getClassOrder: vi.fn((classes: string[]) =>
        classes.map((c): [string, bigint | null] => [c, BigInt(0)]),
      ),
    })

    const { resolveJsFrom } = await import('../src/resolve')
    vi.mocked(resolveJsFrom).mockReturnValue('/fake/node_modules/@tailwindcss/node/index.mjs')

    const { createJiti } = await import('jiti')
    vi.mocked(createJiti).mockReturnValue({
      import: vi.fn().mockResolvedValue({
        __unstable__loadDesignSystem: mockLoadDesignSystem,
      }),
      esmResolve: vi.fn(),
    } as any)

    const { loadTailwindContext } = await import('../src/tailwind')
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Call twice with the same stylesheet (undefined = default)
    const result1 = await loadTailwindContext(undefined, '/test/file.latte')
    const result2 = await loadTailwindContext(undefined, '/test/other.latte')

    // Both calls should return the exact same cached instance
    expect(result1).toBe(result2)

    // __unstable__loadDesignSystem should have been invoked only once
    expect(mockLoadDesignSystem).toHaveBeenCalledTimes(1)

    consoleSpy.mockRestore()
  })

  it('returns null when design system loading fails', async () => {
    const { resolveJsFrom } = await import('../src/resolve')
    vi.mocked(resolveJsFrom).mockReturnValue('/fake/node_modules/@tailwindcss/node/index.mjs')

    const { createJiti } = await import('jiti')
    vi.mocked(createJiti).mockReturnValue({
      import: vi.fn().mockResolvedValue({
        __unstable__loadDesignSystem: vi.fn().mockRejectedValue(new Error('CSS parse error')),
      }),
      esmResolve: vi.fn(),
    } as any)

    const { loadTailwindContext } = await import('../src/tailwind')
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await loadTailwindContext(undefined, '/test/file.latte')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load Tailwind design system'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})
