/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './apps/frontend/src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand — green palette (from design prototypes)
        green: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        gold: {
          50:  '#fffbeb',
          100: '#fef3c7',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        slate: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        red: {
          50:  '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        blue: {
          50:  '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
        },
        amber: {
          50:  '#fffbeb',
          500: '#f59e0b',
        },
      },
      fontFamily: {
        display: ['"Inter Tight"', '-apple-system', 'system-ui', 'sans-serif'],
        body:    ['"Inter"',       '-apple-system', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm:  '6px',
        md:  '10px',
        lg:  '14px',
        xl:  '20px',
        '2xl': '28px',
      },
      boxShadow: {
        xs:   '0 1px 2px rgba(15,23,42,0.04)',
        sm:   '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
        md:   '0 4px 12px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)',
        lg:   '0 12px 32px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.04)',
        glow: '0 0 0 4px rgba(4,120,87,0.12)',
      },
      // Touch targets mínimos (CLAUDE.md)
      minHeight: {
        '12': '48px',  // botões primários
        '15': '60px',  // bottom nav
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
