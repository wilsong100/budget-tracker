// Checks the three build outputs after `npm run build`. Run in CI.
//  - each output exists where docs/PLAN.md says it should
//  - the offline file is self-contained: no external scripts or stylesheets
//  - no sync (premium) code has leaked into the public web or offline builds
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const fail = (message) => failures.push(message);

const required = ['dist/web/index.html', 'dist/offline/budget.html', 'dist/premium/premium.js'];
for (const path of required) {
  if (!existsSync(path)) fail(`missing ${path}`);
}

if (existsSync('dist/offline')) {
  const extra = readdirSync('dist/offline').filter((name) => name !== 'budget.html');
  if (extra.length) fail(`dist/offline should hold only budget.html, found: ${extra.join(', ')}`);
}

if (existsSync('dist/offline/budget.html')) {
  const html = readFileSync('dist/offline/budget.html', 'utf8');
  if (/<script[^>]+src=/i.test(html)) fail('offline build loads an external script');
  if (/<link[^>]+rel=["']?stylesheet/i.test(html))
    fail('offline build loads an external stylesheet');
}

// Any marker exported by src/sync must appear only in premium.js.
const PREMIUM_MARKERS = ['PREMIUM_MODULE_VERSION'];
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
for (const dir of ['dist/web', 'dist/offline']) {
  if (!existsSync(dir)) continue;
  for (const file of walk(dir).filter((f) => /\.(js|html)$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    for (const marker of PREMIUM_MARKERS) {
      if (text.includes(marker)) fail(`${file} contains premium code (${marker})`);
    }
  }
}

if (failures.length) {
  console.error('Build check failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('Build check passed: web, offline and premium outputs are in place.');
