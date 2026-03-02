<template>
  <div class="wbm-shell">
    <div class="wbm-head">
      <strong>WBM v3 控制台</strong>
      <button class="btn danger" @click="$emit('close')">关闭</button>
    </div>

    <div class="wbm-tabs">
      <button
        v-for="(tab, idx) in tabs"
        :key="tab.key"
        class="tab"
        :class="{ active: idx === activeTab }"
        @click="activeTab = idx"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="wbm-body">
      <div v-if="lastError" class="error-banner">
        <span>{{ lastError }}</span>
        <button class="btn mini" @click="lastError = ''">清除</button>
      </div>

      <section v-if="activeTab === 0" class="pane">
        <div class="row">
          <button class="btn" @click="refreshEntries">刷新</button>
          <button class="btn primary" @click="manualReview">手动审核</button>
        </div>
        <div class="card">
          <div class="row">
            <input v-model="newEntryName" placeholder="新条目名称" />
            <button class="btn" @click="createEntry">新增</button>
          </div>
          <textarea v-model="newEntryContent" rows="4" placeholder="新条目内容"></textarea>
        </div>
        <div class="list">
          <div v-for="entry in entries" :key="String(entry.uid ?? entry.id ?? entry.name)" class="item">
            <div class="row spread">
              <strong>{{ entry.name || entry.comment || '(未命名)' }}</strong>
              <div class="row">
                <button class="btn mini" @click="toggleEntry(entry)">
                  {{ entry.enabled === false ? '启用' : '禁用' }}
                </button>
                <button class="btn mini danger" @click="removeEntry(entry)">删除</button>
              </div>
            </div>
            <textarea
              :value="String(entry.content ?? '')"
              rows="3"
              @change="updateEntryContent(entry, $event)"
            ></textarea>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 1" class="pane">
        <div class="card">
          <label>审核深度</label>
          <input v-model.number="config.reviewDepth" type="number" min="1" max="100" />
          <label>删除确认</label>
          <input v-model="config.confirmDelete" type="checkbox" />
          <label>日志级别</label>
          <select v-model="config.logLevel">
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <div class="row">
            <button class="btn primary" @click="saveConfig">保存设置</button>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 2" class="pane">
        <div class="card">
          <label>运行模式</label>
          <select v-model="config.mode">
            <option value="inline">inline</option>
            <option value="external">external</option>
          </select>
          <label>API 来源</label>
          <select v-model="config.apiSource">
            <option value="tavern">tavern</option>
            <option value="custom">custom</option>
          </select>
          <label>外部 Endpoint</label>
          <input v-model="config.externalEndpoint" />
          <label>外部模型</label>
          <input v-model="config.externalModel" />
          <label>外部密钥</label>
          <input v-model="config.externalApiKey" />
          <button class="btn primary" @click="saveConfig">保存 API</button>
        </div>
      </section>

      <section v-else-if="activeTab === 3" class="pane">
        <div class="card">
          <label>自动审核</label>
          <input v-model="config.autoEnabled" type="checkbox" />
          <label>起始楼层</label>
          <input v-model.number="config.startAfter" type="number" min="0" />
          <label>间隔</label>
          <input v-model.number="config.interval" type="number" min="-1" />
          <label>触发时机</label>
          <select v-model="config.triggerTiming">
            <option value="before">before</option>
            <option value="after">after</option>
            <option value="both">both</option>
          </select>
          <label>目标世界书类型</label>
          <select v-model="config.targetType">
            <option value="charPrimary">charPrimary</option>
            <option value="charAdditional">charAdditional</option>
            <option value="global">global</option>
            <option value="managed">managed</option>
          </select>
          <label>目标世界书名</label>
          <input v-model="config.targetBookName" />
          <label>审核模式</label>
          <select v-model="config.approvalMode">
            <option value="auto">auto</option>
            <option value="manual">manual</option>
            <option value="selective">selective</option>
          </select>
          <button class="btn primary" @click="saveConfig">保存调度</button>
        </div>
      </section>

      <section v-else-if="activeTab === 4" class="pane">
        <div class="card">
          <div>目标世界书: {{ status.targetBookName || '(未解析)' }}</div>
          <div>自动审核: {{ status.autoEnabled ? '开启' : '关闭' }}</div>
          <div>处理状态: {{ status.processing ? '处理中' : '空闲' }}</div>
          <div>审核模式: {{ status.approvalMode }}</div>
          <div>待审队列: {{ status.queueSize }}</div>
          <div>下一触发楼层: {{ status.nextDueFloor }}</div>
          <button class="btn" @click="refreshStatus">刷新状态</button>
        </div>
      </section>

      <section v-else-if="activeTab === 5" class="pane">
        <div class="row">
          <button class="btn" @click="refreshQueue">刷新队列</button>
          <button class="btn" @click="refreshSnapshots">刷新快照</button>
          <button class="btn primary" @click="approveAll">全部通过</button>
          <button class="btn danger" @click="rejectAll">全部拒绝</button>
        </div>
        <div class="card">
          <strong>审核队列</strong>
          <div v-for="item in queue" :key="item.id" class="item small">
            {{ item.id }} | floor={{ item.floor ?? '-' }} | {{ item.commands.length }} 条
          </div>
        </div>
        <div class="card">
          <strong>快照</strong>
          <div class="row">
            <input v-model.number="rollbackFloorInput" type="number" min="0" placeholder="floor" />
            <input v-model="rollbackChatIdInput" placeholder="chatId(可选)" />
            <button class="btn mini" @click="rollbackFloor">按楼层回滚</button>
          </div>
          <div v-for="item in snapshots" :key="item.id" class="item small">
            <div class="row spread">
              <span>
                {{ item.id }} | floor={{ item.floor ?? '-' }} | {{ item.reason }}
              </span>
              <button class="btn mini" @click="rollbackSnapshot(item.id)">回滚</button>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="pane">
        <div class="row">
          <button class="btn" @click="refreshLogs">刷新日志</button>
          <button class="btn danger" @click="clearLogs">清空日志</button>
        </div>
        <pre class="logs">{{ logsText }}</pre>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { WbmConfig, WorldbookEntryLike } from '../../core/types';
import type { PanelBridge } from './types';

const props = defineProps<{ bridge: PanelBridge }>();
defineEmits<{ close: [] }>();

const tabs = [
  { key: 'worldbook', label: '世界书' },
  { key: 'prompt', label: '提示词' },
  { key: 'api', label: 'API' },
  { key: 'scheduler', label: '设置' },
  { key: 'status', label: '后台' },
  { key: 'debug', label: '调试' },
  { key: 'logs', label: '日志' },
];

const activeTab = ref(0);
const status = ref(props.bridge.getStatus());
const config = reactive<WbmConfig>({ ...props.bridge.getConfig() });
const entries = ref<WorldbookEntryLike[]>([]);
const queue = ref(props.bridge.listQueue());
const snapshots = ref(props.bridge.listSnapshots());
const logs = ref(props.bridge.getLogs());
const lastError = ref('');

const newEntryName = ref('');
const newEntryContent = ref('');
const rollbackFloorInput = ref<number | null>(null);
const rollbackChatIdInput = ref('');

const logsText = computed(() =>
  logs.value
    .map(item => `[${item.time}] [${item.level}] [${item.namespace}] ${item.message}`)
    .join('\n'),
);

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function setError(action: string, error: unknown): void {
  lastError.value = `${action}失败: ${formatError(error)}`;
}

async function runVoid(action: string, runner: () => Promise<void> | void): Promise<boolean> {
  try {
    await runner();
    lastError.value = '';
    return true;
  } catch (error) {
    setError(action, error);
    return false;
  }
}

async function runData<T>(action: string, runner: () => Promise<T> | T): Promise<T | null> {
  try {
    const value = await runner();
    lastError.value = '';
    return value;
  } catch (error) {
    setError(action, error);
    return null;
  }
}

async function refreshStatus(): Promise<void> {
  await runVoid('刷新状态', () => {
    status.value = props.bridge.getStatus();
  });
}

async function refreshEntries(): Promise<void> {
  const next = await runData('刷新条目', () => props.bridge.listEntries());
  if (next == null) return;
  entries.value = next;
  await refreshStatus();
}

async function refreshQueue(): Promise<void> {
  const next = await runData('刷新队列', () => props.bridge.listQueue());
  if (next == null) return;
  queue.value = next;
  await refreshStatus();
}

async function refreshSnapshots(): Promise<void> {
  const next = await runData('刷新快照', () => props.bridge.listSnapshots());
  if (next == null) return;
  snapshots.value = next;
}

async function refreshLogs(): Promise<void> {
  const next = await runData('刷新日志', () => props.bridge.getLogs());
  if (next == null) return;
  logs.value = next;
}

async function saveConfig(): Promise<void> {
  await runVoid('保存设置', async () => {
    await props.bridge.saveConfig({ ...config });
    status.value = props.bridge.getStatus();
  });
}

async function createEntry(): Promise<void> {
  const name = newEntryName.value.trim();
  if (!name) return;
  const ok = await runVoid('新增条目', async () => {
    await props.bridge.createEntry({
      name,
      content: newEntryContent.value,
      enabled: true,
    });
  });
  if (!ok) return;
  newEntryName.value = '';
  newEntryContent.value = '';
  await refreshEntries();
}

async function updateEntryContent(entry: WorldbookEntryLike, event: Event): Promise<void> {
  const target = event.target as HTMLTextAreaElement;
  const ok = await runVoid('更新条目内容', async () => {
    await props.bridge.updateEntry({ ...entry, content: target.value });
  });
  if (!ok) return;
  await refreshEntries();
}

async function toggleEntry(entry: WorldbookEntryLike): Promise<void> {
  const ok = await runVoid('切换条目启停', async () => {
    await props.bridge.updateEntry({ ...entry, enabled: entry.enabled === false });
  });
  if (!ok) return;
  await refreshEntries();
}

async function removeEntry(entry: WorldbookEntryLike): Promise<void> {
  const uid = entry.uid ?? entry.id;
  if (uid == null) return;
  const ok = await runVoid('删除条目', async () => {
    await props.bridge.deleteEntry(uid);
  });
  if (!ok) return;
  await refreshEntries();
}

async function manualReview(): Promise<void> {
  const ok = await runVoid('手动审核', async () => {
    await props.bridge.manualReview();
  });
  if (!ok) return;
  await refreshQueue();
}

async function approveAll(): Promise<void> {
  const ok = await runVoid('全部通过', async () => {
    await props.bridge.approveAll();
  });
  if (!ok) return;
  await refreshQueue();
}

async function rejectAll(): Promise<void> {
  const ok = await runVoid('全部拒绝', async () => {
    await props.bridge.rejectAll();
  });
  if (!ok) return;
  await refreshQueue();
}

async function rollbackSnapshot(snapshotId: string): Promise<void> {
  const ok = await runVoid('回滚快照', async () => {
    await props.bridge.rollback(snapshotId);
  });
  if (!ok) return;
  await refreshSnapshots();
}

async function rollbackFloor(): Promise<void> {
  if (rollbackFloorInput.value == null || Number.isNaN(rollbackFloorInput.value)) return;
  const ok = await runVoid('按楼层回滚', async () => {
    await props.bridge.rollbackFloor(rollbackFloorInput.value as number, rollbackChatIdInput.value || undefined);
  });
  if (!ok) return;
  await refreshSnapshots();
}

async function clearLogs(): Promise<void> {
  const ok = await runVoid('清空日志', () => {
    props.bridge.clearLogs();
  });
  if (!ok) return;
  await refreshLogs();
}

onMounted(async () => {
  await runVoid('初始化面板', async () => {
    entries.value = await props.bridge.listEntries();
    queue.value = props.bridge.listQueue();
    snapshots.value = props.bridge.listSnapshots();
    logs.value = props.bridge.getLogs();
    status.value = props.bridge.getStatus();
  });
});
</script>

<style scoped>
.wbm-shell {
  width: min(980px, 96vw);
  max-height: 88vh;
  background: #171717;
  color: #f2f2f2;
  border: 1px solid #3f3f3f;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: "Microsoft YaHei", sans-serif;
}
.wbm-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #333;
}
.wbm-tabs {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid #333;
}
.tab {
  padding: 8px 4px;
  background: transparent;
  border: none;
  color: #ccc;
  cursor: pointer;
}
.tab.active {
  color: #fff;
  background: #2a2a2a;
}
.wbm-body {
  padding: 12px;
  overflow: auto;
}
.error-banner {
  border: 1px solid #9b3f3f;
  background: rgba(139, 45, 45, 0.35);
  color: #ffd9d9;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.row.spread {
  justify-content: space-between;
}
.card {
  border: 1px solid #333;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  border: 1px solid #303030;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item.small {
  padding: 6px 8px;
}
input,
textarea,
select {
  width: 100%;
  background: #101010;
  color: #f0f0f0;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  padding: 6px 8px;
}
.btn {
  border: 1px solid #555;
  background: #2a2a2a;
  color: #f3f3f3;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.btn.primary {
  border-color: #4a79ff;
  background: #1d3470;
}
.btn.danger {
  border-color: #a63f3f;
  background: #5e2020;
}
.btn.mini {
  padding: 4px 8px;
  font-size: 12px;
}
.logs {
  background: #0f0f0f;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 10px;
  white-space: pre-wrap;
  max-height: 56vh;
  overflow: auto;
}
@media (max-width: 900px) {
  .wbm-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
