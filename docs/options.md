# Options

All options are set in your `.prettierrc` (or equivalent Prettier config file).

## `tailwindStylesheet`

**Type:** `string` &middot; **Default:** none

Path to your CSS entry point that contains `@import "tailwindcss"` (Tailwind v4). The plugin reads this file to determine the correct class order from your design system.

```json
{
  "tailwindStylesheet": "./resources/css/app.css"
}
```

If omitted, the plugin uses a default `@import "tailwindcss"` internally, which gives you the standard Tailwind class order. You only need this option if:

- You define **custom utilities** (`@utility my-class { ... }`)
- You use **custom `@source` directives** or theme presets
- Your CSS entry point imports additional stylesheets that affect class order

## `tailwindClassRegex`

**Type:** `string` &middot; **Default:** `""` (empty &mdash; auto-detect)

JSON array of regex patterns for finding Tailwind classes outside standard HTML attributes. Compatible with [`tailwindCSS.experimental.classRegex`](https://github.com/tailwindlabs/tailwindcss-intellisense#experimental-configuration).

```json
{
  "tailwindClassRegex": "[\"class:\\\\s*?[\\\"'`]([^\\\"'`]*)\"]"
}
```

When empty (default), the plugin **auto-detects** patterns from your IDE configuration. Resolution is **waterfall** &mdash; the first source found wins, no merging:

1. `.vscode/settings.json` &mdash; reads `tailwindCSS.experimental.classRegex`
2. `.idea/tailwindcss.xml` &mdash; reads `experimental.classRegex` from PhpStorm/WebStorm config

The plugin traverses directories upward from the formatted file. Within each directory, VS Code is checked before PhpStorm. Once patterns are found, the search stops.

Set to `"[]"` to explicitly disable classRegex (no auto-detection, no custom patterns).

See [Class Regex](class-regex.md) for details on pattern format, safety checks, and recommended patterns for Latte.

## `tailwindPropertyOrder`

**Type:** `string` &middot; **Default:** `""` (disabled)

Path to a JS or JSON file exporting a [stylelint-order](https://github.com/hudochenkov/stylelint-order) compatible `properties-order` array. When set, classes are sorted by CSS property order instead of Tailwind's default order.

```json
{
  "tailwindPropertyOrder": "stylelint-config-hudochenkov/order.js"
}
```

The path is resolved relative to your `.prettierrc` location. You can point to:

- **An npm package**: `"stylelint-config-hudochenkov/order.js"` (resolved from `node_modules`)
- **A custom JSON file**: `"./my-property-order.json"`
- **A custom JS file**: `"./my-property-order.js"`

### Supported formats

The plugin accepts the same formats as `order/properties-order` from stylelint-order:

**Flat array of CSS property names:**
```json
["display", "position", "width", "height", "margin", "padding", "color"]
```

**Grouped objects:**
```json
[
  { "groupName": "Layout", "properties": ["display", "flex", "grid"] },
  { "groupName": "Box model", "properties": ["width", "height", "margin", "padding"] }
]
```

**Stylelint config with rules:**
```js
module.exports = {
  rules: {
    'order/properties-order': [
      ['display', 'width', 'color'],
      { unspecified: 'bottom' }
    ]
  }
}
```

### Secondary options

- `unspecified`: `"top"` | `"bottom"` (default) | `"bottomAlphabetical"` | `"ignore"` &mdash; where properties not listed in the config are placed

### How it works

- Classes without variants are sorted first, then variant groups (e.g., `hover:`, `md:`) follow in Tailwind's variant order
- Within each variant group, classes are sorted by their CSS property position in your config
- Tailwind's native bigint order is used as a tiebreaker when two classes map to the same CSS property
- Unknown classes (non-Tailwind) always come first
- Requires `@tailwindcss/node` v4 with `candidatesToAst` API

### Example

With property order `display > width > padding > color`:

```
Input:   text-red-500 p-4 md:flex flex md:p-4 w-5
Output:  flex w-5 p-4 text-red-500 md:flex md:p-4
```

## `tailwindClassOrder`

**Type:** `string | array` &middot; **Default:** `""` (implicit `["unknown", "tailwind"]`)

Configurable class ordering through a list of **buckets** processed greedily top-down. Each class goes to the first bucket that matches it; within a bucket, classes keep their input order &mdash; except the `"tailwind"` bucket, which sorts by Tailwind&rsquo;s class order (and by `tailwindPropertyOrder` if set).

### Bucket types

- **`"unknown"`** &mdash; matches classes Tailwind doesn&rsquo;t recognize (no bigint). Stable input order.
- **`"tailwind"`** (alias `"tailwindcss"`) &mdash; matches any known Tailwind utility. Sorted by Tailwind order.
- **`{ "pattern": "^..." }`** &mdash; regex match against the class name. Stable input order. Anchors (`^`, `$`) must be written explicitly &mdash; no implicit anchoring. **Greedy:** a pattern listed before `"tailwind"` will also capture known Tailwind utilities that match.

### Inline array form (recommended)

```json
{
  "tailwindClassOrder": [
    ["unknown", { "pattern": "^icon(?:--|$)" }, "tailwind", { "pattern": "^js-" }],
    { "unspecified": "top" }
  ]
}
```

The first element is the bucket list, the second is secondary options (currently only `unspecified: "top" | "bottom"` &mdash; default `"top"`). A flat array of buckets is also accepted:

```json
{
  "tailwindClassOrder": ["unknown", "tailwind", { "pattern": "^js-" }]
}
```

Classes that don&rsquo;t match any bucket go to the position indicated by `unspecified`.

### External config file

```json
{
  "tailwindClassOrder": "./tailwind-class-order.json"
}
```

The path is resolved relative to your `.prettierrc` location (same resolver as `tailwindPropertyOrder`).

### Default

When not set, the plugin behaves as if configured with `[["unknown", "tailwind"], { "unspecified": "top" }]` &mdash; unknown classes first, then Tailwind utilities sorted by class order.

### Use cases

**1. Push JS hooks to the end**

```json
{
  "tailwindClassOrder": [["unknown", "tailwind", { "pattern": "^js-" }], { "unspecified": "bottom" }]
}
```

```
Input:   js-toggle flex mt-4 custom-class
Output:  custom-class flex mt-4 js-toggle
```

**2. Keep BEM modifiers next to the base class**

Both `icon` and `icon--check-circle` match `^icon` and land in the same bucket, preserving input order:

```json
{
  "tailwindClassOrder": [[{ "pattern": "^icon(?:--|$)" }, "unknown", "tailwind"]]
}
```

```
Input:   flex icon icon--check-circle mt-4
Output:  icon icon--check-circle flex mt-4
```

**3. Component-like utilities first**

Utilities that set multiple CSS properties (e.g. `h1`, `grid-cols-center`) can be extracted ahead of single-purpose utilities:

```json
{
  "tailwindClassOrder": [["unknown", { "pattern": "^(h[1-6]|grid-cols-)" }, "tailwind"]]
}
```

### Interaction with `tailwindPropertyOrder`

Property order only applies inside the `"tailwind"` bucket. Pattern and `"unknown"` buckets always keep input order. If you need BEM modifiers sorted by a custom scheme, use multiple patterns (e.g. `^icon$` before `^icon--`) to split them explicitly.

## `tailwindAttributes`

**Type:** `string[]` &middot; **Default:** `[]`

Additional HTML attributes whose values should be sorted as Tailwind class lists. `class` and `n:class` are always sorted.

```json
{
  "tailwindAttributes": ["data-class", "x-bind:class"]
}
```

## `tailwindNclassWhitespace`

**Type:** `"preserve" | "normalize-barriers" | "normalize"` &middot; **Default:** `"normalize-barriers"`

Controls how whitespace separators between `n:class` tokens are handled when tokens are reordered.

**`preserve`** &mdash; Separators travel with their token. Newlines stay attached to the same token after sorting.

```latte
{* Input *}
<div n:class="'text-left',
  'flex',
  $active ? 'font-bold',
  'mt-4'">

{* Output *}
<div n:class="'flex',
  'text-left',
  $active ? 'font-bold',
  'mt-4'">
```

**`normalize-barriers`** (default) &mdash; Separators within sortable groups are normalized to `, `. Separators after barrier tokens (conditionals, variables, multi-class strings) are preserved.

```latte
{* Input *}
<div n:class="'text-left',
  'flex',
  $active ? 'font-bold',
  'mt-4'">

{* Output *}
<div n:class="'flex', 'text-left',
  $active ? 'font-bold',
  'mt-4'">
```

**`normalize`** &mdash; All separators normalized to `, ` (single-line output).

```latte
{* Output *}
<div n:class="'flex', 'text-left', $active ? 'font-bold', 'mt-4'">
```

## `tailwindPreserveWhitespace`

**Type:** `boolean` &middot; **Default:** `false`

Preserve original whitespace between classes in `class` attributes. When `false`, whitespace is normalized to a single space.

## `tailwindPreserveDuplicates`

**Type:** `boolean` &middot; **Default:** `false`

Keep duplicate classes. When `false`, duplicates are removed during sorting.
