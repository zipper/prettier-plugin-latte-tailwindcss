import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  // prettier and @tailwindcss/node are peer deps — installed by the user
  // jiti and enhanced-resolve are bundled into dist
  external: ['prettier', '@tailwindcss/node'],
  clean: true,
  // Shim import.meta.url for CJS output (used by jiti in tailwind.ts)
  shims: true,
})
