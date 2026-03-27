import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    platform: 'node',
    external: ['prettier', '@tailwindcss/node'],
    clean: true,
    // Bundled deps (jiti, enhanced-resolve) use require() for Node.js built-ins.
    // In ESM output, tsup converts these to __require() shims that fail at runtime.
    // Providing a real require via createRequire fixes this.
    banner: {
      js: "import { createRequire as __pluginCreateRequire } from 'module'; const require = __pluginCreateRequire(import.meta.url);",
    },
  },
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    sourcemap: true,
    platform: 'node',
    external: ['prettier', '@tailwindcss/node'],
    shims: true,
  },
])
