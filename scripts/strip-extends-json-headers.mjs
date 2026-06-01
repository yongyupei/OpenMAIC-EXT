/**
 * Remove migration comment headers mistakenly prepended to JSON locale files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'lib/extends/i18n/locales');

for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.json')) continue;
  const filePath = path.join(dir, name);
  let raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.startsWith('/**')) continue;
  const start = raw.indexOf('{');
  if (start < 0) throw new Error(`No JSON object in ${name}`);
  raw = raw.slice(start);
  JSON.parse(raw);
  fs.writeFileSync(filePath, `${raw.trimEnd()}\n`, 'utf8');
  console.log('stripped', name);
}
