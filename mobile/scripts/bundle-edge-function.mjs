#!/usr/bin/env node
/**
 * Bundle a Supabase edge function folder into one paste-ready file for the dashboard editor.
 * Usage (from mobile/): npm run bundle:fn -- <function-name>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');

const name = process.argv[2];
if (!name || name.startsWith('-')) {
  console.error('Usage: npm run bundle:fn -- <function-name>');
  process.exit(1);
}

// The function sources live at the repo root (supabase/functions); the bundles stay in mobile/.
const entry = path.join(mobileRoot, '..', 'supabase', 'functions', name, 'index.ts');
if (!fs.existsSync(entry)) {
  console.error(`Entry not found: ${entry}`);
  process.exit(1);
}

const outDir = path.join(mobileRoot, 'supabase', 'functions-bundled');
const outfile = path.join(outDir, `${name}.ts`);
fs.mkdirSync(outDir, { recursive: true });

const header =
  `// AUTO-GENERATED single-file bundle for pasting into the Supabase dashboard. Source: supabase/functions/${name}/\n`;

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile,
  tsconfigRaw: {
    compilerOptions: {
      strict: true,
    },
  },
  logLevel: 'info',
});

const bundled = result.outputFiles?.[0]?.text;
if (!bundled) {
  console.error('esbuild produced no output');
  process.exit(1);
}

const remoteImports = bundled.match(/from\s+['"]https?:\/\/[^'"]+['"]/g) ?? [];
const allowedRemote = remoteImports.every((stmt) =>
  /esm\.sh\/@supabase\/supabase-js/.test(stmt),
);
if (remoteImports.length > 0 && !allowedRemote) {
  console.error('Bundle contains unexpected remote URL imports:', remoteImports.join(', '));
  process.exit(1);
}

fs.writeFileSync(outfile, header + bundled, 'utf8');
console.log(`Wrote ${path.relative(mobileRoot, outfile)}`);
