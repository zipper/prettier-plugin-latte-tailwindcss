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

**Type:** `string` &middot; **Default:** `""` (implicit `["unknown", "tailwind"]`)

Configurable class ordering through a list of **buckets**. Membership follows a fixed priority rule &mdash; explicit `{pattern}` buckets always win over the `"unknown"` / `"tailwind"` catchalls. The **order you write buckets in your config controls the order of groups in the output**, not the matching priority.

### Config value: path or JSON-encoded string

Prettier CLI cannot accept a raw JSON array for non-array options (arrays are silently collapsed to their last element), so the option value must be a **string**:

- **Path to an external file** (recommended):
  ```json
  { "tailwindClassOrder": "./tailwind-class-order.json" }
  ```
- **JSON-encoded string** starting with `[`:
  ```json
  { "tailwindClassOrder": "[[\"unknown\", {\"pattern\":\"^js-\"}, \"tailwind\"], {\"unspecified\":\"top\"}]" }
  ```

Path is resolved relative to your `.prettierrc` location (same resolver as `tailwindPropertyOrder`).

### Config shape

Tuple form `[items, secondaryOptions]` (stylelint-order style):

```json
[
  ["unknown", { "pattern": "^icon(?:--|$)" }, "tailwind", { "pattern": "^js-" }],
  { "unspecified": "top" }
]
```

A flat array of buckets is also accepted (secondary options default to `{ "unspecified": "top" }`):

```json
["unknown", "tailwind", { "pattern": "^js-" }]
```

### Bucket types

- **`"unknown"`** &mdash; catchall for classes Tailwind doesn&rsquo;t recognize (null bigint). Stable input order. Only claims classes no pattern matched.
- **`"tailwind"`** (alias `"tailwindcss"`) &mdash; catchall for known Tailwind utilities (non-null bigint). Sorted by Tailwind order (and `tailwindPropertyOrder` if set). Only claims classes no pattern matched.
- **`{ "pattern": "^..." }`** &mdash; regex match against the class name. Stable input order. Anchors (`^`, `$`) must be written explicitly &mdash; no implicit anchoring.

### How matching works

1. **Phase 1 &mdash; priority assignment.** For each class:
   - Try every `{pattern}` bucket (in config order, first match wins). This applies regardless of whether a pattern appears before or after `"tailwind"` / `"unknown"` in the config.
   - If no pattern matched: assign to the first `"tailwind"` bucket (non-null bigint) or the first `"unknown"` bucket (null bigint). Otherwise leave unspecified.
2. **Phase 2 &mdash; emit in config order.** Iterate buckets in the order written by the user; emit their members. The `"tailwind"` bucket is sorted; pattern and `"unknown"` buckets preserve input order. Unspecified classes go to the front or back per `unspecified`.

### Default

When not set, the plugin behaves as if configured with `[["unknown", "tailwind"], { "unspecified": "top" }]` &mdash; unknown classes first, then Tailwind utilities sorted by class order.

### Use cases

**1. Push JS hooks to the end**

```json
["unknown", "tailwind", { "pattern": "^js-" }]
```

```
Input:   js-toggle flex mt-4 custom-class
Output:  custom-class flex mt-4 js-toggle
```

**2. Keep BEM modifiers next to the base class**

Both `icon` and `icon--check-circle` match `^icon(?:--|$)` and land in the same bucket, preserving input order:

```json
[{ "pattern": "^icon(?:--|$)" }, "unknown", "tailwind"]
```

```
Input:   flex icon icon--check-circle mt-4
Output:  icon icon--check-circle flex mt-4
```

**3. Component-like utilities first**

Utilities that set multiple CSS properties (e.g. `h1`, `grid-cols-center`) can be extracted ahead of single-purpose utilities:

```json
["unknown", { "pattern": "^(h[1-6]|grid-cols-)" }, "tailwind"]
```

### Interaction with `tailwindPropertyOrder`

Property order only applies inside the `"tailwind"` bucket. Pattern and `"unknown"` buckets always keep input order. To sort BEM modifiers by a custom scheme, use separate patterns (e.g. `^icon$` before `^icon--`).

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

**`normalize-barriers`** (default) &mdash; Within sortable groups: newlines are preserved (so user-intended multi-line layout survives sorting); horizontal-only separators collapse to `, `. Separators after barrier tokens (conditionals, variables, multi-class strings) are always preserved.

```latte
{* Input — multi-line *}
<div n:class="'text-left',
  'flex',
  $active ? 'font-bold',
  'mt-4'">

{* Output — newlines kept *}
<div n:class="'flex',
  'text-left',
  $active ? 'font-bold',
  'mt-4'">

{* Input — single-line with extra spaces *}
<div n:class="'text-left',  'flex',  $active ? 'font-bold'">

{* Output — collapses to single-space separator *}
<div n:class="'flex', 'text-left', $active ? 'font-bold'">
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
