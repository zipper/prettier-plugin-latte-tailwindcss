import fs from 'node:fs'
import { CachedInputFileSystem, ResolverFactory } from 'enhanced-resolve'

// Shared filesystem cache with 30s TTL (mirrors prettier-plugin-tailwindcss/src/resolve.ts)
const fileSystem = new CachedInputFileSystem(fs, 30_000)

const esmResolver = ResolverFactory.createResolver({
  fileSystem,
  useSyncFileSystemCalls: true,
  extensions: ['.mjs', '.js'],
  mainFields: ['module'],
  conditionNames: ['node', 'import']
})

const cjsResolver = ResolverFactory.createResolver({
  fileSystem,
  useSyncFileSystemCalls: true,
  extensions: ['.js', '.cjs'],
  mainFields: ['main'],
  conditionNames: ['node', 'require']
})

const cssResolver = ResolverFactory.createResolver({
  fileSystem,
  useSyncFileSystemCalls: true,
  extensions: ['.css'],
  mainFields: ['style'],
  conditionNames: ['style']
})

/** Resolve a JS/TS module — ESM first, fallback to CJS */
export function resolveJsFrom(base: string, id: string): string {
  try {
    return esmResolver.resolveSync({}, base, id) || id
  } catch {
    return cjsResolver.resolveSync({}, base, id) || id
  }
}

/** Resolve a CSS file path (@import) */
export function resolveCssFrom(base: string, id: string): string {
  return cssResolver.resolveSync({}, base, id) || id
}
