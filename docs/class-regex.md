# Class Regex

The `tailwindClassRegex` option lets you sort Tailwind classes in places beyond standard HTML `class` attributes &mdash; for example, inside Latte `{embed}` / `{include}` parameters, PHP variable assignments, or custom tag attributes.

## How it works

The plugin processes your file in two passes:

1. **Pass 1 (classRegex)** &mdash; Applies regex patterns to the original text to find and sort class strings in custom locations (embed params, variable assignments, etc.)
2. **Pass 2 (HTML extraction)** &mdash; Finds and sorts standard `class`, `n:class`, and `class={[...]}` attributes in HTML

This means `class` and `n:class` in HTML are always sorted, even without classRegex.

## Pattern format

Patterns follow the same format as [`tailwindCSS.experimental.classRegex`](https://github.com/tailwindlabs/tailwindcss-intellisense#experimental-configuration). Each pattern is either:

**Simple pattern** &mdash; A regex string with one capture group. The captured text is treated as a class list.

```json
"class:\\s*?[\"'`]([^\"'`]*)[\"'`]"
```

**Tuple pattern** &mdash; An `[outer, inner]` array. The outer regex finds a region of interest, the inner regex extracts class strings within it.

```json
["\\b\\w*[cC]lass\\w*\\s*:\\s*([^,}]*)", "[\"'`]([^\"'`]*)[\"'`]"]
```

Tuple patterns are more flexible: the outer narrows the search scope, the inner extracts the actual class values. This avoids false positives.

## IDE auto-detection

When `tailwindClassRegex` is empty (default), the plugin automatically reads patterns from your IDE configuration:

| Priority | Source | Key |
|----------|--------|-----|
| 1 | `.vscode/settings.json` | `tailwindCSS.experimental.classRegex` |
| 2 | `.idea/tailwindcss.xml` | `experimental.classRegex` in `lspConfiguration` |

The plugin traverses directories upward from the formatted file until it finds a configuration. **Resolution is waterfall** &mdash; the first source found wins and the rest are ignored (no merging across sources):

1. **`.prettierrc`** (`tailwindClassRegex`) &mdash; explicit config always takes priority
2. **`.vscode/settings.json`** &mdash; checked in each directory, bottom-up
3. **`.idea/tailwindcss.xml`** &mdash; checked in each directory, bottom-up

Within each directory, VS Code config is checked before PhpStorm. Once any source returns patterns, the search stops. This means your IDE IntelliSense patterns are automatically reused for sorting.

To disable auto-detection, set `"tailwindClassRegex": "[]"` in your `.prettierrc`.

## Recommended patterns for Latte

These patterns cover common Latte/Nette constructs:

```json
[
  ["classList\\.(?:add|remove|toggle)\\(([^)]*)\\)", "[\"'`]([^\"'`]*)[\"'`]"],
  ["\\b\\w*[cC]lass\\w*\\s*:\\s*([^,}]*)", "[\"'`]([^\"'`]*)[\"'`]"],
  ["n:class=\"([^\"]*)\"", "[\"'`]([^\"'`]*)[\"'`]"],
  "class(?:Name)?\\s*=>\\s*[\"'`]([^\"'`]*)[\"'`]",
  ["\\$\\w*[cC]lass\\w*\\s*=\\s*(?:\\[[^\\]]*\\]|[^\\n]*)", "[\"'`]([^\"'`]*)[\"'`]"]
]
```

### What each pattern matches

| # | Pattern | Matches | Example |
|---|---------|---------|---------|
| 1 | `classList.add/remove/toggle` | JS classList API | `classList.add('flex', 'mt-4')` |
| 2 | `*Class:` / `class:` | Latte embed/include params, including ternaries | `class: 'flex mt-4'`, `backgroundClass: $x ? 'bg-red'` |
| 3 | `n:class="..."` | n:class attribute (extracts individual strings) | `n:class="'flex', $x ? 'bold'"` |
| 4 | `class =>` | PHP named params in custom tags | `class => 'flex mt-4'` |
| 5 | `$*Class = ...` | Variable assignments (direct or array) | `$marginClass = 'mb-4'`, `$classes = ['flex', 'mt-4']` |

### Where to put them

These patterns go in your IDE's Tailwind CSS extension configuration. They serve double duty:

1. **IDE IntelliSense** &mdash; Tailwind CSS extension uses them for autocompletion and hover info
2. **Prettier sorting** &mdash; This plugin auto-detects and reuses them

**VS Code** (`.vscode/settings.json`):
```json
{
  "tailwindCSS.experimental.classRegex": [
    ["classList\\.(?:add|remove|toggle)\\(([^)]*)\\)", "[\"'`]([^\"'`]*)[\"'`]"],
    ["\\b\\w*[cC]lass\\w*\\s*:\\s*([^,}]*)", "[\"'`]([^\"'`]*)[\"'`]"],
    ["n:class=\"([^\"]*)\"", "[\"'`]([^\"'`]*)[\"'`]"],
    "class(?:Name)?\\s*=>\\s*[\"'`]([^\"'`]*)[\"'`]",
    ["\\$\\w*[cC]lass\\w*\\s*=\\s*(?:\\[[^\\]]*\\]|[^\\n]*)", "[\"'`]([^\"'`]*)[\"'`]"]
  ]
}
```

**PhpStorm/WebStorm** &mdash; Settings &rarr; Languages & Frameworks &rarr; Tailwind CSS &rarr; Configuration, add to the JSON:
```json
{
  "experimental": {
    "classRegex": [
      ["classList\\.(?:add|remove|toggle)\\(([^)]*)\\)", "[\"'`]([^\"'`]*)[\"'`]"],
      ["\\b\\w*[cC]lass\\w*\\s*:\\s*([^,}]*)", "[\"'`]([^\"'`]*)[\"'`]"],
      ["n:class=\"([^\"]*)\"", "[\"'`]([^\"'`]*)[\"'`]"],
      "class(?:Name)?\\s*=>\\s*[\"'`]([^\"'`]*)[\"'`]",
      ["\\$\\w*[cC]lass\\w*\\s*=\\s*(?:\\[[^\\]]*\\]|[^\\n]*)", "[\"'`]([^\"'`]*)[\"'`]"]
    ]
  }
}
```

## Safety checks

The plugin protects against dangerous regex patterns that could corrupt files:

### Pattern-level detection

Patterns containing unbounded greedy quantifiers are detected and skipped with a warning:

- `[\s\S]*` or `[\S\s]*` &mdash; matches everything including newlines
- `\$(.*)` or `\$(?:.*)` &mdash; greedy from first `$` across the entire file

These patterns work fine for IDE IntelliSense (which only reads, never writes) but are destructive when used for text replacement.

### Capture-level validation

Even if a pattern passes the pattern-level check, each captured string is validated before sorting:

- Captures containing `<`, `>`, `{`, `}` are skipped (HTML/Latte structural characters)

This prevents sorting of accidentally captured file structure.

### Common dangerous patterns to avoid

| Pattern | Problem | Safe alternative |
|---------|---------|------------------|
| `n:class=["']([\s\S]*)["']` | `[\s\S]*` matches entire file | `n:class="([^"]*)"` |
| `\$(?:.*)[cC]lass` | `\$(.*)` spans entire file with dotall | `\$\w*[cC]lass` |
| `class(?:Name)?\s*?=>?\s*?` | Optional `>` matches HTML `class=` too | `class(?:Name)?\s*=>\s*` (require `=>`) |
