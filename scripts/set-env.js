// @ts-check
const { writeFileSync } = require('fs');
const { join } = require('path');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(`[set-env] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

const content = `export const environment = {
  production: true,
  apiUrl: '/api/v1',
  supabaseUrl: '${SUPABASE_URL}',
  supabaseAnonKey: '${SUPABASE_ANON_KEY}',
};
`;

const dest = join(__dirname, '../apps/frontend/src/environments/environment.production.ts');
writeFileSync(dest, content, 'utf8');
console.log('[set-env] environment.production.ts written');