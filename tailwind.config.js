/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        anibox: {
          bg:           'var(--ab-bg)',
          surface:      'var(--ab-surface)',
          accent:       'var(--ab-accent)',
          'accent-hover': 'var(--ab-accent-hover)',
          secondary:    'var(--ab-secondary)',
          'secondary-hover': 'var(--ab-secondary-hover)',
          text:         'var(--ab-text)',
          'text-muted': 'var(--ab-text-muted)',
          border:       'var(--ab-border)',
          overlay:      'var(--ab-overlay)',
        }
      }
    }
  },
  plugins: []
}
