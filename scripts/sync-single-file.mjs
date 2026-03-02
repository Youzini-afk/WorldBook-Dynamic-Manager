import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'dist', 'index.js');
const target = path.join(root, 'index.js');

async function main() {
  await fs.copyFile(source, target);
  console.log(`[sync-single-file] copied ${source} -> ${target}`);
}

main().catch(error => {
  console.error('[sync-single-file] failed', error);
  process.exitCode = 1;
});

