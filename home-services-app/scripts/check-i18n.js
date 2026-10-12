// Fails if the app uses a translation key that is missing in English or Arabic, or if the two languages differ.
// Run with `npm run check:i18n` (CI runs it too).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PLURAL = /_(zero|one|two|few|many|other)$/;

function loadLanguage(file) {
  const source = fs
    .readFileSync(path.join(root, 'src', 'i18n', file), 'utf8')
    .replace(/export default \w+;?/, '')
    .replace(/export type .*$/m, '')
    .replace(/^const \w+(: \w+)? =/m, 'return');
  return new Function(source)();
}

/** Flattens to dotted keys; plural variants (`key_one`, `key_other`) count as `key`. */
function flatten(obj, prefix = '', out = new Set(), groups = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      groups.add(key);
      flatten(v, key, out, groups);
    } else out.add(key.replace(PLURAL, ''));
  }
  return { keys: out, groups };
}

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'i18n') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx?|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const en = flatten(loadLanguage('en.ts'));
const ar = flatten(loadLanguage('ar.ts'));
const problems = [];

for (const key of en.keys) if (!ar.keys.has(key)) problems.push(`missing in ar: ${key}`);
for (const key of ar.keys) if (!en.keys.has(key)) problems.push(`missing in en: ${key}`);

const used = new Map();
const families = new Map();
for (const file of [...sourceFiles(path.join(root, 'app')), ...sourceFiles(path.join(root, 'src'))]) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  for (const m of text.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) used.set(m[1], rel);
  for (const m of text.matchAll(/\bt\(\s*`([^`]+)`/g)) {
    const dynamic = m[1].indexOf('${');
    if (dynamic < 0) used.set(m[1], rel);
    else families.set(m[1].slice(0, dynamic).replace(/\.$/, ''), rel);
  }
  // Translation keys stored in data (e.g. onboarding slides, assistant topics).
  for (const m of text.matchAll(/(?:labelKey|titleKey|descKey|label|tagline): '([a-z]+\.[A-Za-z0-9_.]+)'/g)) used.set(m[1], rel);
}

for (const [key, file] of used) {
  if (!en.keys.has(key)) problems.push(`unknown key ${key} (${file})`);
}
for (const [prefix, file] of families) {
  // `workflow.review.how${n}` style prefixes end mid-key; check the containing section instead.
  const group = en.groups.has(prefix) ? prefix : prefix.split('.').slice(0, -1).join('.');
  if (group && !en.groups.has(group)) problems.push(`unknown key family ${prefix}.* (${file})`);
}

if (problems.length) {
  console.error(`Translation problems (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Translations OK: ${en.keys.size} keys in English and Arabic, ${used.size} used directly, ${families.size} dynamic families.`);
