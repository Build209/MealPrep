/**
 * Runs after `expo export -p web` (see package.json "export:web"): adds the search, share and
 * install tags from src/lib/webHead.ts to dist/index.html. Usage: tsx scripts/web-head.ts [dir]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addWebHead } from '../src/lib/webHead';

const dir = resolve(process.argv[2] ?? join(__dirname, '..', 'dist'));
const file = join(dir, 'index.html');
writeFileSync(file, addWebHead(readFileSync(file, 'utf8')));
console.log(`web-head: added search, share and install tags to ${file}`);
