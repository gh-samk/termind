import { defineConfig } from 'tsup'

/**
 * Der Server wird in eine Datei gebündelt. Nur Pakete mit nativen Binärdateien bleiben extern,
 * so braucht das Docker-Image fast keine node_modules.
 */
export const NATIVE = ['@libsql/client', '@node-rs/argon2']

export default defineConfig({
  entry: { 'server/index': 'server/index.ts' },
  outDir: 'dist',
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: false,
  sourcemap: true,
  minify: true,
  noExternal: [/^(?!@libsql\/|@node-rs\/|libsql).*/],
  external: NATIVE,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
})
