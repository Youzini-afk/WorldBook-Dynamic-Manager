import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function createScriptImport({ id, name, content, info }) {
  return {
    name,
    id,
    enabled: true,
    type: 'script',
    content,
    info,
    button: {
      enabled: true,
      buttons: [],
    },
    data: {},
  };
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[generate-tavern-imports] wrote ${filePath}`);
}

async function main() {
  const projectRoot = process.cwd();
  const releaseRoot = path.resolve(projectRoot, '..');
  const inlineBundlePath = path.resolve(projectRoot, 'dist', 'index.js');
  const inlineBundle = await fs.readFile(inlineBundlePath, 'utf8');

  const gh = 'Youzini-afk/WorldBook-Dynamic-Manager';
  const defaultScript = createScriptImport({
    id: randomUUID(),
    name: '动态世界书-v3',
    content: `import 'https://gcore.jsdelivr.net/gh/${gh}@main/index.js'`,
    info: '默认分发地址（gcore jsDelivr）。建议发布后改为固定 tag。',
  });
  const cdnScript = createScriptImport({
    id: randomUUID(),
    name: '动态世界书-v3(cdn)',
    content: `import 'https://cdn.jsdelivr.net/gh/${gh}@main/index.js'`,
    info: '标准 jsDelivr CDN。建议发布后改为固定 tag。',
  });
  const inlineScript = createScriptImport({
    id: randomUUID(),
    name: '动态世界书-v3(内嵌)',
    content: inlineBundle,
    info: '内嵌脚本，不依赖远程 import。',
  });

  const outputFiles = [
    {
      fileName: '酒馆助手脚本-动态世界书.json',
      payload: defaultScript,
    },
    {
      fileName: '酒馆助手脚本-动态世界书-cdn.json',
      payload: cdnScript,
    },
    {
      fileName: '酒馆助手脚本-动态世界书-内嵌版.json',
      payload: inlineScript,
    },
    {
      fileName: '酒馆助手脚本-动态世界书-内嵌版-数组导入.json',
      payload: [inlineScript],
    },
  ];

  for (const item of outputFiles) {
    const filePath = path.resolve(releaseRoot, item.fileName);
    await writeJson(filePath, item.payload);
  }
}

main().catch(error => {
  console.error('[generate-tavern-imports] failed', error);
  process.exitCode = 1;
});
