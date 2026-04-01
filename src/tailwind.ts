import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import prettier from 'prettier'
import { createPropertyOrderContext, loadPropertyOrderConfig } from './property-order'
import type { DesignSystemForPropertyOrder } from './property-order'
import { resolveCssFrom, resolveJsFrom } from './resolve'
import type { TailwindContext } from './types'

interface DesignSystem {
  getClassOrder(classList: string[]): [string, bigint | null][]
  // Methods needed for property ordering (may not exist in older TW4 versions)
  candidatesToAst?(classes: string[]): unknown[][]
  parseCandidate?(candidate: string): readonly unknown[]
  getVariantOrder?(): Map<unknown, number>
  getVariants?(): { name: string }[]
}

interface TailwindApi {
  __unstable__loadDesignSystem(css: string, options: LoadOptions): Promise<DesignSystem>
}

interface LoadOptions {
  base: string
  loadModule?(id: string, base: string, resourceType: string): Promise<{ base: string; module: unknown }>
  loadPlugin?(id: string): Promise<unknown>
  loadConfig?(id: string): Promise<unknown>
  loadStylesheet?(id: string, base: string): Promise<{ base: string; content: string }>
}

// Cache: `${configDir}::${stylesheet}` → Promise<TailwindContext | null>
// Shared across all files in the same project directory (mirrors prettier-plugin-tailwindcss/src/config.ts)
const contextCache = new Map<string, Promise<TailwindContext | null>>()

// Cache for prettier config base dir resolution: inputDir → configDir
const prettierConfigCache = new Map<string, string>()

export async function loadTailwindContext(
  stylesheet: string | undefined,
  filepath: string,
  propertyOrderPath?: string
): Promise<TailwindContext | null> {
  const inputDir = filepath ? path.dirname(filepath) : process.cwd()
  const configDir = await resolvePrettierConfigDir(filepath, inputDir)

  // Relative paths are resolved from the .prettierrc directory
  let resolvedStylesheet: string | undefined
  if (stylesheet) {
    resolvedStylesheet = path.isAbsolute(stylesheet) ? stylesheet : path.resolve(configDir, stylesheet)
  }

  const cacheKey = `${configDir}::${resolvedStylesheet ?? ''}::${propertyOrderPath ?? ''}`

  const cached = contextCache.get(cacheKey)
  if (cached !== undefined) return cached

  const promise = doLoad(resolvedStylesheet, configDir, propertyOrderPath)
  contextCache.set(cacheKey, promise)
  return promise
}

async function doLoad(
  stylesheet: string | undefined,
  configDir: string,
  propertyOrderPath?: string
): Promise<TailwindContext | null> {
  // Locate @tailwindcss/node in the user's project
  let tailwindPath: string
  try {
    tailwindPath = resolveJsFrom(configDir, '@tailwindcss/node')
  } catch {
    console.warn(
      '[prettier-plugin-latte-tailwind] @tailwindcss/node not found — class sorting disabled.\n' +
        'Install it: npm install --save-dev @tailwindcss/node'
    )
    return null
  }

  // jiti@2 with disabled caches so changes to config are picked up immediately
  const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false })
  const cacheKey = `${+Date.now()}`

  // Load @tailwindcss/node via jiti (ESM-only package)
  let tailwindMod: TailwindApi
  try {
    const url = pathToFileURL(tailwindPath)
    url.searchParams.append('t', cacheKey)
    tailwindMod = (await jiti.import(url.href, { default: true })) as TailwindApi
  } catch (err) {
    console.warn('[prettier-plugin-latte-tailwind] Failed to load @tailwindcss/node:', err)
    return null
  }

  if (typeof tailwindMod.__unstable__loadDesignSystem !== 'function') {
    console.warn(
      '[prettier-plugin-latte-tailwind] @tailwindcss/node does not export __unstable__loadDesignSystem — ' +
        'is Tailwind CSS v4 installed?'
    )
    return null
  }

  // Read CSS content and set base path for @import resolution
  let css: string
  let importBasePath: string
  let stylesheetPath: string

  if (stylesheet) {
    css = await fs.readFile(stylesheet, 'utf-8')
    importBasePath = path.dirname(stylesheet)
    stylesheetPath = stylesheet
  } else {
    // No stylesheet configured — use minimal Tailwind CSS to get at least the default utilities
    importBasePath = configDir
    stylesheetPath = path.join(configDir, 'fake.css')
    css = '@import "tailwindcss";'
  }

  const loader = createLoader({ jiti, cacheKey, stylesheetPath })

  let design: DesignSystem
  try {
    design = await tailwindMod.__unstable__loadDesignSystem(css, {
      base: importBasePath,
      loadModule: loader.loadModule,
      loadStylesheet: loader.loadStylesheet,
      loadPlugin: loader.loadPlugin,
      loadConfig: loader.loadConfig
    })
  } catch (err) {
    console.warn('[prettier-plugin-latte-tailwind] Failed to load Tailwind design system:', err)
    return null
  }

  const context: TailwindContext = {
    getClassOrder: (classList: string[]) => design.getClassOrder(classList)
  }

  // Load property order config if specified
  if (propertyOrderPath) {
    if (
      typeof design.candidatesToAst !== 'function' ||
      typeof design.parseCandidate !== 'function' ||
      typeof design.getVariantOrder !== 'function' ||
      typeof design.getVariants !== 'function'
    ) {
      console.warn(
        '[prettier-plugin-latte-tailwind] tailwindPropertyOrder requires Tailwind CSS v4 with candidatesToAst API — ' +
          'custom property ordering disabled.'
      )
    } else {
      const config = await loadPropertyOrderConfig(propertyOrderPath, configDir)
      if (config) {
        const ds: DesignSystemForPropertyOrder = {
          candidatesToAst: (classes) => design.candidatesToAst!(classes) as any,
          parseCandidate: (candidate) => design.parseCandidate!(candidate) as any,
          getVariantOrder: () => design.getVariantOrder!() as any,
          getVariants: () => design.getVariants!() as any
        }
        context.propertyOrder = createPropertyOrderContext(config, ds)
      }
    }
  }

  return context
}

function createLoader({
  jiti,
  cacheKey,
  stylesheetPath
}: {
  jiti: ReturnType<typeof createJiti>
  cacheKey: string
  stylesheetPath: string
}) {
  const baseDir = path.dirname(stylesheetPath)

  async function loadFile(id: string, base: string): Promise<unknown> {
    const resolved = resolveJsFrom(base, id)
    const url = pathToFileURL(resolved)
    url.searchParams.append('t', cacheKey)
    return jiti.import(url.href, { default: true })
  }

  return {
    // Non-legacy signature: returns { base, module } (used by loadModule in @tailwindcss/node)
    loadModule: async (id: string, base: string, _resourceType: string) => ({
      base,
      module: await loadFile(id, base)
    }),

    // Legacy signature: returns value directly (used by loadPlugin and loadConfig)
    loadPlugin: async (id: string) => {
      try {
        return await loadFile(id, baseDir)
      } catch (err) {
        console.warn(`[prettier-plugin-latte-tailwind] Unable to load plugin: ${id}`, err)
        return () => {}
      }
    },

    loadConfig: async (id: string) => {
      try {
        return await loadFile(id, baseDir)
      } catch (err) {
        console.warn(`[prettier-plugin-latte-tailwind] Unable to load config: ${id}`, err)
        return {}
      }
    },

    // Resolve CSS @import paths using enhanced-resolve
    loadStylesheet: async (id: string, base: string) => {
      const resolved = resolveCssFrom(base, id)
      return {
        base: path.dirname(resolved),
        content: await fs.readFile(resolved, 'utf-8')
      }
    }
  }
}

async function resolvePrettierConfigDir(filePath: string, inputDir: string): Promise<string> {
  const cached = prettierConfigCache.get(inputDir)
  if (cached !== undefined) return cached

  try {
    const configFile = await prettier.resolveConfigFile(filePath)
    if (configFile) {
      const configDir = path.dirname(configFile)
      prettierConfigCache.set(inputDir, configDir)
      return configDir
    }
  } catch {
    // Prettier config not found — fall back to cwd
  }

  prettierConfigCache.set(inputDir, process.cwd())
  return process.cwd()
}
