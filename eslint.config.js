import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
const layers = [
  'web',
  'transport',
  'application',
  'eventDomain',
  'server',
  'db',
  'domain',
  'config',
];
const allowed = {
  web: ['web', 'domain'],
  server: ['server', 'transport', 'application', 'eventDomain', 'db', 'domain'],
  transport: ['transport', 'application', 'domain'],
  application: ['application', 'eventDomain', 'server', 'db', 'domain'],
  eventDomain: ['eventDomain', 'domain'],
  db: ['db', 'domain'],
  domain: ['domain', 'config'],
  config: ['config'],
};
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'artifacts/**',
      'playwright-report/**',
      'test-results/**',
      'packages/db/generated/**',
    ],
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}', 'tools/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.js','.jsx','.ts','.tsx','.json'] } },
      'boundaries/elements': [
        { type: 'web', pattern: 'apps/web/src/**', partialMatch: false },
        { type: 'eventDomain', pattern: 'apps/server/src/domain/**', partialMatch: false },
        { type: 'application', pattern: 'apps/server/src/application/**', partialMatch: false },
        { type: 'transport', pattern: 'apps/server/src/transport/**', partialMatch: false },
        { type: 'server', pattern: 'apps/server/src/**', partialMatch: false },
        { type: 'db', pattern: 'packages/db/**', partialMatch: false },
        { type: 'domain', pattern: 'packages/shared/**', partialMatch: false },
        { type: 'config', pattern: 'packages/config/**', partialMatch: false },
      ],
    },
    rules: {
      'no-debugger': 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: layers.map((type) => ({
            from: { element: { type } },
            disallow: {
              to: {
                element: { types: { anyOf: layers.filter((t) => !allowed[type].includes(t)) } },
              },
            },
          })),
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '**/db/**', 'pg', 'node:*'],
              message:
                'Browser code must use the HTTP API; database and server modules stay on the server.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/shared/**/*.ts', 'apps/server/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'pg', 'redis', '**/db/**', '**/apps/**'],
              message: 'Game formulas must remain pure and portable.',
            },
          ],
        },
      ],
    },
  },
];
