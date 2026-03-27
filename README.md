# prettier-plugin-latte-tailwind

[![npm version](https://img.shields.io/npm/v/prettier-plugin-latte-tailwind.svg)](https://www.npmjs.com/package/prettier-plugin-latte-tailwind)
[![license](https://img.shields.io/npm/l/prettier-plugin-latte-tailwind.svg)](https://github.com/zipper/prettier-plugin-latte-tailwind/blob/main/LICENSE)

A Prettier plugin that sorts Tailwind CSS v4 classes in [Latte v3](https://latte.nette.org/) templates.

The official `prettier-plugin-tailwindcss` does not support Latte. This plugin fills that gap — it handles `class`, `n:class`, and `class={[...]}` constructs native to Latte/Nette.

## Installation

```bash
npm install -D prettier-plugin-latte-tailwind
```

Peer dependencies: `prettier >= 3.0.0`. If you use Tailwind CSS v4 class sorting (recommended), you also need `@tailwindcss/node >= 4.0.0` installed in your project.

Minimal `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-latte-tailwind"],
  "tailwindStylesheet": "./resources/css/app.css"
}
```

## Options

### `tailwindStylesheet`

**Type:** `string` &middot; **Default:** none

Path to your CSS entry point that contains `@import "tailwindcss"` (Tailwind v4). The plugin reads this file to determine the correct class order from your design system.

```json
{
  "tailwindStylesheet": "./resources/css/app.css"
}
```

If omitted, the plugin still formats Latte templates but does not sort classes.

### `tailwindAttributes`

**Type:** `string[]` &middot; **Default:** `[]`

Additional HTML attributes whose values should be sorted as Tailwind class lists. `class` and `n:class` are always sorted — you don't need to add them.

Use this for custom attributes like `data-class`, or framework-specific attributes:

```json
{
  "tailwindAttributes": ["data-class", "x-bind:class"]
}
```

### `tailwindNclassWhitespace`

**Type:** `"preserve" | "normalize-barriers" | "normalize"` &middot; **Default:** `"normalize-barriers"`

Controls how whitespace separators between `n:class` tokens are handled when tokens are reordered.

**`preserve`** — Separators travel with their token. If you have newlines between tokens, they stay attached to the same token after sorting.

```latte
{* Input *}
<div n:class="'text-left',
  'flex',
  $active ? 'font-bold',
  'mt-4'">

{* Output — newlines travel with their tokens *}
<div n:class="'flex',
  'text-left',
  $active ? 'font-bold',
  'mt-4'">
```

**`normalize-barriers`** (default) — Separators within sortable groups are normalized to `, `. Separators after barrier tokens (conditionals, variables, multi-class strings) are preserved as-is.

```latte
{* Input *}
<div n:class="'text-left',
  'flex',
  $active ? 'font-bold',
  'mt-4'">

{* Output — sortable group collapsed, barrier separator preserved *}
<div n:class="'flex', 'text-left',
  $active ? 'font-bold',
  'mt-4'">
```

**`normalize`** — All separators normalized to `, ` (single-line output).

```latte
{* Output *}
<div n:class="'flex', 'text-left', $active ? 'font-bold', 'mt-4'">
```

### `tailwindPreserveWhitespace`

**Type:** `boolean` &middot; **Default:** `false`

Preserve original whitespace between classes in `class` attributes. When `false`, whitespace is normalized to a single space.

### `tailwindPreserveDuplicates`

**Type:** `boolean` &middot; **Default:** `false`

Keep duplicate classes. When `false`, duplicates are removed during sorting.

## Supported constructs

### `class` attribute

Standard HTML class attribute. Classes are sorted by Tailwind order.

```latte
{* Input *}
<div class="mt-4 flex text-left items-center">

{* Output *}
<div class="flex items-center text-left mt-4">
```

### `n:class` attribute

Latte's [n:class](https://latte.nette.org/en/tags#toc-n-class) attribute supports a comma-separated list of tokens — static classes, quoted strings, conditionals, and dynamic variables.

The plugin uses a **barrier model** for sorting:

| Token type | Sortable? | Example |
|---|---|---|
| Bare identifier | Yes | `active` |
| Single-class quoted string | Yes | `'flex'` |
| Multi-class quoted string | No (barrier) | `'btn font-bold'` |
| Conditional | No (barrier) | `$x ? 'active'` |
| Dynamic variable | No (barrier) | `$dynamicClass` |

**What gets sorted:**
- Classes *within* quoted strings: `'flex btn mt-4'` becomes `'btn flex mt-4'`
- Classes *within* conditional branches: `$x ? 'flex btn' : 'block hidden'` becomes `$x ? 'btn flex' : 'block hidden'`
- Consecutive sortable tokens between barriers are reordered by Tailwind order

**What stays in place:**
- Barrier tokens never move relative to each other or to other barriers
- Token order across different groups (separated by barriers) is never changed

**Why:** Conditional tokens like `$x ? 'active' : 'hidden'` don't have a single sort key — they resolve at runtime. Reordering them would change the semantics of the template.

**Atomicity rule:** A multi-class quoted string like `'btn font-bold'` is treated as a single atomic barrier. The classes inside it are sorted, but the token itself does not move.

**Unknown/custom classes** (not recognized by Tailwind) always appear *before* Tailwind utilities within any sorted group.

```latte
{* Input *}
<div n:class="'mt-4', 'flex', $active ? 'font-bold' : 'font-normal', 'text-sm', 'items-center'">

{* Output — two sortable groups separated by the conditional barrier *}
<div n:class="'flex', 'mt-4', $active ? 'font-bold' : 'font-normal', 'items-center', 'text-sm'">
```

### `class={[...]}` (array class)

Latte's array syntax for conditional classes. Items can be plain class names, keyed pairs (`'class' => $condition`), or dynamic expressions.

```latte
{* Input *}
<div class={['mt-4', 'flex', 'active' => $isActive, $dynamicClass, 'text-sm']}>

{* Output — plain/keyed items sorted, dynamic items stay in place as barriers *}
<div class={['flex', 'mt-4', 'active' => $isActive, $dynamicClass, 'text-sm']}>
```

Keyed pairs are **atomic** — the class name and its `=> condition` always move together. The condition is never separated from its class.

Dynamic items (`$var`, function calls, spread `...`) act as barriers, just like in `n:class`.

## Editor setup

### PhpStorm / WebStorm

1. Go to **Settings → Languages & Frameworks → JavaScript → Prettier**
2. Set **Run for files** to include `.latte`:
   ```
   {**/*.{js,ts,jsx,tsx,css,scss,html,json,latte}}
   ```
3. Optionally enable **On save**

### VS Code

1. Install the [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
2. Add to your `settings.json`:

```json
{
  "[latte]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Known limitations

- **Range formatting** (`--range-start` / `--range-end`) may have off-by-one behavior due to the Latte preprocessing step that replaces Latte tags with fixed-length placeholders.
- **Array class `class={[...]}`** relies on the HTML parser to see the attribute value. Complex Latte expressions inside the array may confuse the parser in edge cases.
- **Cross-barrier ordering** is intentionally not supported. Classes in separate groups (split by conditionals or dynamic tokens) are never reordered relative to each other.

## Support

I built this plugin for myself and my colleagues at work — we use Nette/Latte daily and wanted proper Tailwind class sorting in our templates. I'm happy to share it with the community.

If this plugin saves you time or makes your workflow better, consider supporting its development:

- [GitHub Sponsors](https://github.com/sponsors/zipper)
- [PayPal](https://paypal.me/radeksery)

No pressure — star the repo if nothing else. It helps with visibility.

## License

[MIT](LICENSE)
