// @ts-check
const { writeFileSync } = require('fs');
const { join } = require('path');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(`[set-env] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const { SUPABASE_ANON_KEY } = process.env;

// Strip accidental path suffix (e.g. /rest/v1 or /auth/v1) and trailing slash.
// supabase-js needs the bare project URL; it appends /auth/v1, /rest/v1 itself.
const SUPABASE_URL = process.env.SUPABASE_URL
  .replace(/\/(rest|auth|realtime|storage)\/v1\/?$/, '')
  .replace(/\/$/, '');

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