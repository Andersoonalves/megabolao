import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  // Ignorar arquivos que não são código Angular
  {
    ignores: [
      'design-prototypes/**',
      '**/*.jsx',
    ],
  },
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'nb', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'nb', style: 'kebab-case' },
      ],
      // Padrões comuns em Angular com signals/fire-and-forget
      '@typescript-eslint/no-empty-function':     'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars':        ['warn', { argsIgnorePattern: '^_' }],
      'no-empty':                                  'off',
      '@angular-eslint/prefer-inject':             'warn',
    },
  },
  {
    files: ['**/*.html'],
    rules: {
      // Acessibilidade: warn apenas — não bloqueia CI
      '@angular-eslint/template/click-events-have-key-events':  'warn',
      '@angular-eslint/template/interactive-supports-focus':    'warn',
      '@angular-eslint/template/label-has-associated-control':  'warn',
    },
  },
];
