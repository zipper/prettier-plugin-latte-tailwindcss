import type { SupportOption } from 'prettier'

export const options: Record<string, SupportOption> = {
  tailwindStylesheet: {
    type: 'string',
    category: 'Tailwind CSS',
    description: 'Path to the CSS stylesheet with @import "tailwindcss" (v4+)',
  },

  tailwindAttributes: {
    type: 'string',
    array: true,
    // Empty by default — 'class' and 'n:class' are built-in
    default: [{ value: [] }],
    category: 'Tailwind CSS',
    description: 'Additional attributes/props that contain sortable Tailwind classes',
  },

  tailwindPreserveWhitespace: {
    type: 'boolean',
    default: false,
    category: 'Tailwind CSS',
    description: 'Preserve whitespace around Tailwind classes when sorting',
  },

  tailwindPreserveDuplicates: {
    type: 'boolean',
    default: false,
    category: 'Tailwind CSS',
    description: 'Preserve duplicate classes inside a class list when sorting',
  },

  tailwindClassRegex: {
    type: 'string',
    default: '',
    category: 'Tailwind CSS',
    description:
      'JSON array of classRegex patterns (compatible with tailwindCSS.experimental.classRegex). ' +
      'Set to "[]" to disable. If empty, auto-detected from .vscode/settings.json or .idea/tailwindcss.xml.',
  },

  tailwindPropertyOrder: {
    type: 'string',
    default: '',
    category: 'Tailwind CSS',
    description:
      'Path to a JS/JSON file exporting a stylelint-order compatible properties-order array. ' +
      'Empty string (default) disables custom ordering and uses Tailwind\'s native order.',
  },

  tailwindNclassWhitespace: {
    type: 'choice',
    default: 'normalize-barriers',
    category: 'Tailwind CSS',
    description: 'How whitespace separators between n:class tokens are handled when tokens are reordered',
    choices: [
      {
        value: 'preserve',
        description: 'Each token carries its trailing separator — separators travel with their token when reordered',
      },
      {
        value: 'normalize-barriers',
        description: 'Separators within sortable groups are normalized to ", "; separators after barrier tokens are preserved',
      },
      {
        value: 'normalize',
        description: 'All separators normalized to ", " (single-line output)',
      },
    ],
  },
}
