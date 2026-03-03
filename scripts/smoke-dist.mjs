import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

async function ensureFile(filePath, minBytes = 512) {
  await fs.access(filePath, fsConstants.R_OK);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`不是文件: ${filePath}`);
  }
  if (stat.size < minBytes) {
    throw new Error(`文件体积异常: ${filePath} (${stat.size} bytes)`);
  }
}

async function main() {
  const distModule = path.join(root, 'dist', 'wbm3.js');
  const distSingle = path.join(root, 'dist', 'index.js');

  await ensureFile(distModule);
  await ensureFile(distSingle);

  const checkResult = spawnSync(process.execPath, ['--check', distSingle], {
    stdio: 'inherit',
  });
  if (checkResult.status !== 0) {
    throw new Error(`语法检查失败: ${distSingle}`);
  }

  const dryRunResult = spawnSync(process.execPath, ['scripts/generate-tavern-imports.mjs', '--dry-run'], {
    stdio: 'inherit',
    cwd: root,
  });
  if (dryRunResult.status !== 0) {
    throw new Error('导入包生成脚本 dry-run 失败');
  }

  console.log('[smoke-dist] pass');
}

main().catch(error => {
  console.error('[smoke-dist] failed', error);
  process.exitCode = 1;
});
