import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeXmlEntities, stripJsonComments, resolveIdeClassRegex, _resetIdeConfigCache } from '../src/ide-config'
import { resolveClassRegexPatterns } from '../src/class-regex'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-config-test-'))
})

afterEach(() => {
  _resetIdeConfigCache()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── decodeXmlEntities ───

describe('decodeXmlEntities', () => {
  it('decodes &#10; to newline and &#9; to tab', () => {
    expect(decodeXmlEntities('&#10;')).toBe('\n')
    expect(decodeXmlEntities('&#9;')).toBe('\t')
  })

  it('decodes named entities', () => {
    expect(decodeXmlEntities('&quot;')).toBe('"')
    expect(decodeXmlEntities('&amp;')).toBe('&')
    expect(decodeXmlEntities('&lt;')).toBe('<')
    expect(decodeXmlEntities('&gt;')).toBe('>')
  })

  it('decodes hex entity &#x41; to A', () => {
    expect(decodeXmlEntities('&#x41;')).toBe('A')
  })

  it('decodes mixed entities in one string', () => {
    expect(decodeXmlEntities('&lt;div class=&quot;foo&quot;&gt;')).toBe('<div class="foo">')
  })

  it('returns string without entities unchanged', () => {
    expect(decodeXmlEntities('hello world')).toBe('hello world')
  })
})

// ─── stripJsonComments ───

describe('stripJsonComments', () => {
  it('strips line comment at end of line', () => {
    const input = '{\n  "a": 1 // comment\n}'
    expect(stripJsonComments(input)).toBe('{\n  "a": 1 \n}')
  })

  it('strips block comment', () => {
    const input = '{\n  /* block */\n  "a": 1\n}'
    expect(stripJsonComments(input)).toBe('{\n  \n  "a": 1\n}')
  })

  it('preserves // inside string values', () => {
    const input = '{"url": "http://example.com"}'
    expect(stripJsonComments(input)).toBe('{"url": "http://example.com"}')
  })

  it('removes trailing comma before }', () => {
    const input = '{"a": 1,}'
    expect(stripJsonComments(input)).toBe('{"a": 1}')
  })

  it('removes trailing comma before ]', () => {
    const input = '[1, 2,]'
    expect(stripJsonComments(input)).toBe('[1, 2]')
  })

  it('handles combination of comments and trailing commas', () => {
    const input = '{\n  "a": 1, // first\n  "b": 2, /* second */\n}'
    const result = stripJsonComments(input)
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({ a: 1, b: 2 })
  })
})

// ─── readVscodeClassRegex (via resolveIdeClassRegex) ───

describe('readVscodeClassRegex via resolveIdeClassRegex', () => {
  it('returns patterns from valid .vscode/settings.json', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ["class:\\s*?'([^']*)'"]
      })
    )

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toEqual(["class:\\s*?'([^']*)'"])
  })

  it('returns null when file is missing', () => {
    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toBeNull()
  })

  it('returns null when key is missing', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'editor.fontSize': 14
      })
    )

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(path.join(vscodeDir, 'settings.json'), '{not valid json}')

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toBeNull()
  })

  it('handles JSONC with comments and trailing commas', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      `{
  // Tailwind class regex
  "tailwindCSS.experimental.classRegex": [
    "class:\\\\s*?'([^']*)'", /* pattern */
  ],
}`
    )

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toEqual(["class:\\s*?'([^']*)'"])
  })
})

// ─── readPhpStormClassRegex (via resolveIdeClassRegex) ───

describe('readPhpStormClassRegex via resolveIdeClassRegex', () => {
  it('returns patterns from valid .idea/tailwindcss.xml', () => {
    const ideaDir = path.join(tmpDir, '.idea')
    fs.mkdirSync(ideaDir, { recursive: true })
    fs.writeFileSync(
      path.join(ideaDir, 'tailwindcss.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="TailwindSettings">
    <option name="lspConfiguration" value="{&#10;&#9;&quot;experimental&quot;: {&#10;&#9;&#9;&quot;classRegex&quot;: [&#10;&#9;&#9;&#9;&quot;class:\\\\s*?'([^']*)'&quot;&#10;&#9;&#9;]&#10;&#9;}&#10;}" />
  </component>
</project>`
    )

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toEqual(["class:\\s*?'([^']*)'"])
  })

  it('returns null when file is missing', () => {
    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toBeNull()
  })

  it('returns null when lspConfiguration is missing', () => {
    const ideaDir = path.join(tmpDir, '.idea')
    fs.mkdirSync(ideaDir, { recursive: true })
    fs.writeFileSync(
      path.join(ideaDir, 'tailwindcss.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="TailwindSettings">
    <option name="otherSetting" value="something" />
  </component>
</project>`
    )

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toBeNull()
  })

  it('returns null when JSON in XML has no experimental.classRegex', () => {
    const ideaDir = path.join(tmpDir, '.idea')
    fs.mkdirSync(ideaDir, { recursive: true })
    fs.writeFileSync(
      path.join(ideaDir, 'tailwindcss.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="TailwindSettings">
    <option name="lspConfiguration" value="{&quot;validate&quot;: true}" />
  </component>
</project>`
    )

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toBeNull()
  })
})

// ─── resolveIdeClassRegex — traversal and priority ───

describe('resolveIdeClassRegex — traversal and priority', () => {
  it('finds config in parent directory', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['test-pattern']
      })
    )

    const subDir = path.join(tmpDir, 'sub', 'dir')
    fs.mkdirSync(subDir, { recursive: true })

    const result = resolveIdeClassRegex(subDir)
    expect(result).toEqual(['test-pattern'])
  })

  it('VS Code wins over PhpStorm in same directory', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['vscode-pattern']
      })
    )

    const ideaDir = path.join(tmpDir, '.idea')
    fs.mkdirSync(ideaDir, { recursive: true })
    fs.writeFileSync(
      path.join(ideaDir, 'tailwindcss.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="TailwindSettings">
    <option name="lspConfiguration" value="{&#10;&#9;&quot;experimental&quot;: {&#10;&#9;&#9;&quot;classRegex&quot;: [&#10;&#9;&#9;&#9;&quot;phpstorm-pattern&quot;&#10;&#9;&#9;]&#10;&#9;}&#10;}" />
  </component>
</project>`
    )

    const result = resolveIdeClassRegex(tmpDir)
    expect(result).toEqual(['vscode-pattern'])
  })

  it('returns null when no config exists', () => {
    const subDir = path.join(tmpDir, 'sub', 'dir')
    fs.mkdirSync(subDir, { recursive: true })

    const result = resolveIdeClassRegex(subDir)
    expect(result).toBeNull()
  })

  it('caches result across calls', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['cached-pattern']
      })
    )

    const result1 = resolveIdeClassRegex(tmpDir)
    expect(result1).toEqual(['cached-pattern'])

    // Create a second temp dir with different config
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-config-test2-'))
    try {
      const vscodeDir2 = path.join(tmpDir2, '.vscode')
      fs.mkdirSync(vscodeDir2, { recursive: true })
      fs.writeFileSync(
        path.join(vscodeDir2, 'settings.json'),
        JSON.stringify({
          'tailwindCSS.experimental.classRegex': ['different-pattern']
        })
      )

      // Second call should return cached result, not the new dir's config
      const result2 = resolveIdeClassRegex(tmpDir2)
      expect(result2).toEqual(['cached-pattern'])
    } finally {
      fs.rmSync(tmpDir2, { recursive: true, force: true })
    }
  })

  it('searches again after _resetIdeConfigCache()', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['first-pattern']
      })
    )

    const result1 = resolveIdeClassRegex(tmpDir)
    expect(result1).toEqual(['first-pattern'])

    _resetIdeConfigCache()

    // Update the config
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['second-pattern']
      })
    )

    const result2 = resolveIdeClassRegex(tmpDir)
    expect(result2).toEqual(['second-pattern'])
  })
})

// ─── resolveClassRegexPatterns (integration) ───

describe('resolveClassRegexPatterns integration', () => {
  it('uses explicit JSON when not default []', () => {
    // Setup IDE config that should be ignored
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['ide-pattern']
      })
    )

    const filePath = path.join(tmpDir, 'test.latte')
    const patterns = resolveClassRegexPatterns('["explicit-pattern"]', filePath)
    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toHaveProperty('regex')
  })

  it('uses IDE config when explicit is default empty string', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['ide-pattern']
      })
    )

    const filePath = path.join(tmpDir, 'test.latte')
    const patterns = resolveClassRegexPatterns('', filePath)
    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toHaveProperty('regex')
  })

  it('explicit "[]" disables auto-detection', () => {
    const vscodeDir = path.join(tmpDir, '.vscode')
    fs.mkdirSync(vscodeDir, { recursive: true })
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'tailwindCSS.experimental.classRegex': ['ide-pattern']
      })
    )

    const filePath = path.join(tmpDir, 'test.latte')
    const patterns = resolveClassRegexPatterns('[]', filePath)
    expect(patterns).toEqual([])
  })

  it('returns empty array when default empty and no IDE config', () => {
    const filePath = path.join(tmpDir, 'test.latte')
    const patterns = resolveClassRegexPatterns('', filePath)
    expect(patterns).toEqual([])
  })
})
