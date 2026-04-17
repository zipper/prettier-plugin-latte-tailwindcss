# prettier-plugin-latte-tailwindcss

[![npm version](https://img.shields.io/npm/v/prettier-plugin-latte-tailwindcss.svg)](https://www.npmjs.com/package/prettier-plugin-latte-tailwindcss)
[![license](https://img.shields.io/npm/l/prettier-plugin-latte-tailwindcss.svg)](https://github.com/zipper/prettier-plugin-latte-tailwindcss/blob/main/LICENSE)

A Prettier plugin that sorts Tailwind CSS v4 classes in [Latte v3](https://latte.nette.org/) templates.

The official `prettier-plugin-tailwindcss` does not support Latte. This plugin fills that gap &mdash; it handles `class`, `n:class`, `class={[...]}`, and custom locations via classRegex.

## Installation

```bash
npm install -D prettier-plugin-latte-tailwindcss
```

Peer dependencies: `prettier >= 3.0.0` and `@tailwindcss/node >= 4.0.0`.

Minimal `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-latte-tailwindcss"],
  "tailwindStylesheet": "./resources/css/app.css"
}
```

If you omit `tailwindStylesheet`, the plugin uses a default `@import "tailwindcss"` which gives standard Tailwind class order. Set it when you have custom utilities or theme customizations.

## What gets sorted

### Standard HTML attributes

`class` and `n:class` attributes are always sorted automatically.

```latte
{* Before *}
<div class="mt-4 flex text-left items-center">
<div n:class="'mt-4', 'flex', $active ? 'font-bold', 'text-sm', 'items-center'">

{* After *}
<div class="flex items-center text-left mt-4">
<div n:class="'flex', 'mt-4', $active ? 'font-bold', 'items-center', 'text-sm'">
```

### Latte array class syntax

```latte
{* Before *}
<div class={['mt-4', 'flex', 'active' => $isActive, $dynamicClass, 'text-sm']}>

{* After *}
<div class={['flex', 'mt-4', 'active' => $isActive, $dynamicClass, 'text-sm']}>
```

### Custom locations via classRegex

Class strings inside `{embed}` / `{include}` parameters, `class =>` in custom tags, `$class` variables, and more:

```latte
{embed '~card',
  class: 'mt-4 flex items-center',
  backgroundClass: $highlighted ? 'bg-brand-primary'}

{pdImg $image product-600,
  class => 'mt-4 flex items-center'}
```

The plugin auto-detects classRegex patterns from your IDE configuration (`.vscode/settings.json` or `.idea/tailwindcss.xml`). See [Class Regex documentation](docs/class-regex.md) for setup and recommended patterns.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tailwindStylesheet` | `string` | &mdash; | Path to CSS entry point with `@import "tailwindcss"` |
| `tailwindClassRegex` | `string` | `""` | JSON array of classRegex patterns; empty = auto-detect from IDE |
| `tailwindAttributes` | `string[]` | `[]` | Additional HTML attributes to sort as class lists |
| `tailwindNclassWhitespace` | `string` | `"normalize-barriers"` | How n:class whitespace is handled: `preserve`, `normalize-barriers`, `normalize` |
| `tailwindPreserveWhitespace` | `boolean` | `false` | Preserve whitespace in class attributes |
| `tailwindPreserveDuplicates` | `boolean` | `false` | Keep duplicate classes |
| `tailwindPropertyOrder` | `string` | `""` | Path to stylelint-order compatible config for custom CSS property ordering |
| `tailwindClassOrder` | `string` | `""` | Bucket-based class ordering (unknown / tailwind / regex patterns). Path to JS/JSON file, or JSON-encoded string starting with `[` |

See [Options documentation](docs/options.md) for detailed descriptions and examples.

## `n:class` sorting model

The plugin uses a **barrier model** for `n:class` sorting:

- **Sortable tokens:** bare identifiers (`active`), single-class strings (`'flex'`)
- **Barrier tokens:** conditionals (`$x ? 'active'`), variables (`$class`), multi-class strings (`'btn font-bold'`)

Sortable tokens between barriers are reordered by Tailwind order. Barrier tokens never move. Classes *within* any quoted string or conditional branch are always sorted internally.

## Editor setup

### PhpStorm / WebStorm

1. **Settings &rarr; Languages & Frameworks &rarr; JavaScript &rarr; Prettier**
2. Set **Run for files** to: `{**/*.{js,ts,jsx,tsx,css,scss,html,json,latte}}`
3. Optionally enable **On save**

### VS Code

1. Install the [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
2. Add to `settings.json`:

```json
{
  "[latte]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Known limitations

- **Range formatting** may have off-by-one behavior due to the Latte preprocessing step.
- **Cross-barrier ordering** is intentionally not supported in `n:class`.

## Support

If this plugin saves you time, consider supporting its development:

- [GitHub Sponsors](https://github.com/sponsors/zipper)
- [PayPal](https://paypal.me/radeksery)

## License

[MIT](LICENSE)
