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
    // Empty by default — 'class' and 'n:class' are built-in in transform.ts
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
