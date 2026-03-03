<template>
  <div class="wbm-shell">
    <div class="wbm-head">
      <strong class="wbm-title">动态世界书</strong>
      <button class="wbm-btn wbm-btn-danger" @click="$emit('close')">关闭</button>
    </div>

    <div class="wbm-tabs">
      <button
        v-for="(tab, idx) in tabs"
        :key="tab.key"
        class="wbm-tab"
        :class="{ 'is-active': idx === activeTab }"
        @click="activeTab = idx"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="wbm-body">
      <div v-if="lastError" class="wbm-error-banner">
        <span>{{ lastError }}</span>
        <button class="wbm-btn wbm-btn-mini" @click="lastError = ''">清除</button>
      </div>

      <Transition name="wbm-pane-switch" mode="out-in">
      <section v-if="activeTab === 0" key="pane-worldbook" class="wbm-pane">
        <div class="wbm-row">
          <button class="wbm-btn" @click="refreshEntries">刷新</button>
          <button class="wbm-btn" @click="refreshLockedNames">刷新锁定</button>
          <button class="wbm-btn" @click="refreshAiManagedNames">刷新AI标记</button>
          <button class="wbm-btn wbm-btn-primary" @click="manualReview">手动审核</button>
        </div>
        <div class="wbm-row">
          <span class="wbm-chip">AI托管条目 {{ aiManagedNames.length }}</span>
          <span class="wbm-chip">锁定条目 {{ lockedNames.length }}</span>
          <span class="wbm-chip">已选中 {{ selectedEntryUids.length }}</span>
        </div>
        <div class="wbm-row">
          <button class="wbm-btn wbm-btn-mini" @click="selectAllEntries">全选</button>
          <button class="wbm-btn wbm-btn-mini" @click="clearSelectedEntries">清空选中</button>
          <button class="wbm-btn wbm-btn-mini" @click="batchEnable(true)">批量启用</button>
          <button class="wbm-btn wbm-btn-mini" @click="batchEnable(false)">批量禁用</button>
          <button class="wbm-btn wbm-btn-mini" @click="batchLock(true)">批量锁定</button>
          <button class="wbm-btn wbm-btn-mini" @click="batchLock(false)">批量解锁</button>
          <button class="wbm-btn wbm-btn-danger wbm-btn-mini" @click="batchDelete">批量删除</button>
        </div>
        <div class="wbm-card">
          <div class="wbm-row">
            <input v-model="newEntryName" placeholder="新条目名称" />
            <button class="wbm-btn" @click="createEntry">新增</button>
          </div>
          <textarea v-model="newEntryContent" rows="4" placeholder="新条目内容"></textarea>
        </div>
        <div class="wbm-list">
          <div v-for="entry in entries" :key="String(entry.uid ?? entry.id ?? entry.name)" class="wbm-item">
            <div class="wbm-row is-spread">
              <div class="wbm-row">
                <input
                  :checked="isEntrySelected(entry)"
                  type="checkbox"
                  class="wbm-entry-check"
                  @change="toggleEntrySelection(entry, $event)"
                />
                <strong>{{ entry.name || entry.comment || '(未命名)' }}</strong>
                <span v-if="isAiManaged(entry)" class="wbm-chip is-accent">AI托管</span>
                <span v-if="isEntryLocked(entry)" class="wbm-chip is-lock">锁定</span>
                <span v-if="entry.constant === true" class="wbm-chip">常量</span>
                <span v-if="entry.selective === false" class="wbm-chip">非选择</span>
              </div>
              <div class="wbm-row">
                <button class="wbm-btn wbm-btn-mini" @click="toggleEntryLock(entry)">
                  {{ isEntryLocked(entry) ? '解锁' : '锁定' }}
                </button>
                <button class="wbm-btn wbm-btn-mini" @click="toggleEntry(entry)">
                  {{ entry.enabled === false ? '启用' : '禁用' }}
                </button>
                <button class="wbm-btn wbm-btn-danger wbm-btn-mini" @click="removeEntry(entry)">删除</button>
              </div>
            </div>
            <div class="wbm-meta-grid">
              <input
                :value="asText(entry.keys)"
                placeholder="关键词（逗号分隔）"
                @input="setEntryTextField(entry, 'keys', $event)"
              />
              <input
                :value="asText(entry.secondary_keys)"
                placeholder="副关键词（逗号分隔）"
                @input="setEntryTextField(entry, 'secondary_keys', $event)"
              />
              <input
                :value="asText(entry.comment)"
                placeholder="注释/展示名"
                @input="setEntryTextField(entry, 'comment', $event)"
              />
              <input
                :value="asText(entry.name)"
                placeholder="名称"
                @input="setEntryTextField(entry, 'name', $event)"
              />
              <input
                :value="asText(entry.depth)"
                type="number"
                placeholder="depth"
                @input="setEntryNumberField(entry, 'depth', $event)"
              />
              <input
                :value="asText(entry.order)"
                type="number"
                placeholder="order"
                @input="setEntryNumberField(entry, 'order', $event)"
              />
            </div>
            <div class="wbm-row">
              <button class="wbm-btn wbm-btn-mini" @click="toggleEntryField(entry, 'constant')">
                {{ entry.constant === true ? '常量:开' : '常量:关' }}
              </button>
              <button class="wbm-btn wbm-btn-mini" @click="toggleEntryField(entry, 'selective')">
                {{ entry.selective === false ? '选择触发:关' : '选择触发:开' }}
              </button>
              <button class="wbm-btn wbm-btn-primary wbm-btn-mini" @click="saveEntry(entry)">保存条目</button>
            </div>
            <textarea
              :value="String(entry.content ?? '')"
              rows="3"
              @change="updateEntryContent(entry, $event)"
            ></textarea>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 1" key="pane-prompt" class="wbm-pane">
        <div class="wbm-card">
          <label>审核深度</label>
          <input v-model.number="config.reviewDepth" type="number" min="1" max="100" />
          <div class="wbm-switch-row">
            <span class="wbm-switch-label">删除确认</span>
            <button
              type="button"
              class="wbm-switch"
              :class="{ 'is-on': config.confirmDelete }"
              :aria-pressed="config.confirmDelete ? 'true' : 'false'"
              @click="config.confirmDelete = !config.confirmDelete"
            >
              <span class="wbm-switch-track">
                <span class="wbm-switch-thumb"></span>
              </span>
              <span class="wbm-switch-text">{{ config.confirmDelete ? '开启' : '关闭' }}</span>
            </button>
          </div>
          <label>日志级别</label>
          <select v-model="config.logLevel">
            <option value="info">信息（info）</option>
            <option value="warn">警告（warn）</option>
            <option value="error">错误（error）</option>
          </select>
          <div class="wbm-row">
            <button class="wbm-btn wbm-btn-primary" @click="saveConfig">保存设置</button>
          </div>
        </div>
        <div class="wbm-card">
          <div class="wbm-row">
            <button class="wbm-btn" @click="refreshPromptEntries">刷新提示词条目</button>
            <button class="wbm-btn wbm-btn-primary" @click="savePromptEntries">保存提示词条目</button>
          </div>
          <textarea
            v-model="promptEntriesText"
            rows="12"
            placeholder="PromptEntry JSON 数组（id/name/role/content/order/enabled）"
          ></textarea>
        </div>
        <div class="wbm-card">
          <strong>提示词预设</strong>
          <div class="wbm-row">
            <input v-model="newPromptPresetName" placeholder="新提示词预设名称" />
            <button class="wbm-btn wbm-btn-primary" @click="saveCurrentPromptPreset">保存为预设</button>
          </div>
          <div class="wbm-row">
            <select v-model="selectedPromptPresetId">
              <option value="">选择提示词预设</option>
              <option v-for="preset in promptPresets" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
            <button class="wbm-btn" @click="applyPromptPreset">应用</button>
            <button class="wbm-btn wbm-btn-danger" @click="deletePromptPreset">删除</button>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 2" key="pane-api" class="wbm-pane">
        <div class="wbm-card">
          <label>运行模式</label>
          <select v-model="config.mode">
            <option value="inline">内置模式（inline）</option>
            <option value="external">外部接口（external）</option>
          </select>
          <label>API 来源</label>
          <select v-model="config.apiSource">
            <option value="tavern">酒馆内置（tavern）</option>
            <option value="custom">自定义来源（custom）</option>
          </select>
          <label>外部 API 类型</label>
          <select v-model="apiConfig.type">
            <option value="openai">OpenAI 兼容</option>
            <option value="custom">Custom JSON</option>
            <option value="gemini">Gemini</option>
          </select>
          <label>外部接口地址</label>
          <input v-model="apiConfig.endpoint" />
          <label>外部模型名称</label>
          <input v-model="apiConfig.model" />
          <label>外部 API 密钥</label>
          <input v-model="apiConfig.key" />
          <label>最大 tokens</label>
          <input v-model.number="apiConfig.maxTokens" type="number" min="16" />
          <label>temperature</label>
          <input v-model.number="apiConfig.temperature" type="number" min="0" max="2" step="0.01" />
          <label>top_p</label>
          <input v-model.number="apiConfig.topP" type="number" min="0" max="1" step="0.01" />
          <label>超时（ms）</label>
          <input v-model.number="apiConfig.timeoutMs" type="number" min="1000" />
          <label>重试次数</label>
          <input v-model.number="apiConfig.retries" type="number" min="0" />
          <button class="wbm-btn wbm-btn-primary" @click="saveApiSettings">保存 API</button>
        </div>
        <div class="wbm-card">
          <strong>API 预设</strong>
          <div class="wbm-row">
            <input v-model="newApiPresetName" placeholder="新 API 预设名称" />
            <button class="wbm-btn wbm-btn-primary" @click="saveCurrentApiPreset">保存为预设</button>
          </div>
          <div class="wbm-row">
            <select v-model="selectedApiPresetId">
              <option value="">选择 API 预设</option>
              <option v-for="preset in apiPresets" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
            <button class="wbm-btn" @click="applyApiPreset">应用</button>
            <button class="wbm-btn wbm-btn-danger" @click="deleteApiPreset">删除</button>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 3" key="pane-scheduler" class="wbm-pane">
        <div class="wbm-card">
          <div class="wbm-switch-row">
            <span class="wbm-switch-label">自动审核</span>
            <button
              type="button"
              class="wbm-switch"
              :class="{ 'is-on': config.autoEnabled }"
              :aria-pressed="config.autoEnabled ? 'true' : 'false'"
              @click="config.autoEnabled = !config.autoEnabled"
            >
              <span class="wbm-switch-track">
                <span class="wbm-switch-thumb"></span>
              </span>
              <span class="wbm-switch-text">{{ config.autoEnabled ? '开启' : '关闭' }}</span>
            </button>
          </div>
          <label>起始楼层</label>
          <input v-model.number="config.startAfter" type="number" min="0" />
          <label>间隔</label>
          <input v-model.number="config.interval" type="number" min="-1" />
          <label>触发时机</label>
          <select v-model="config.triggerTiming">
            <option value="before">发送前（before）</option>
            <option value="after">发送后（after）</option>
            <option value="both">前后都触发（both）</option>
          </select>
          <label>目标世界书类型</label>
          <select v-model="config.targetType">
            <option value="charPrimary">角色主世界书（charPrimary）</option>
            <option value="charAdditional">角色附加世界书（charAdditional）</option>
            <option value="global">全局世界书（global）</option>
            <option value="managed">聊天托管世界书（managed）</option>
          </select>
          <label>目标世界书名</label>
          <input v-model="config.targetBookName" />
          <label>审核模式</label>
          <select v-model="config.approvalMode">
            <option value="auto">自动执行（auto）</option>
            <option value="manual">手动审核（manual）</option>
            <option value="selective">选择性审核（selective）</option>
          </select>
          <label>上下文模式</label>
          <select v-model="config.contextMode">
            <option value="full">全量（full）</option>
            <option value="triggered">命中（triggered）</option>
            <option value="summary">摘要（summary）</option>
          </select>
          <label>过滤模式</label>
          <select v-model="config.contentFilterMode">
            <option value="none">不过滤（none）</option>
            <option value="tags">标签过滤（tags）</option>
          </select>
          <label>过滤标签（逗号分隔）</label>
          <input v-model="config.contentFilterTags" />
          <label>快照保留数</label>
          <input v-model.number="config.snapshotRetention" type="number" min="1" />
          <div class="wbm-switch-row">
            <span class="wbm-switch-label">更新需要确认</span>
            <button
              type="button"
              class="wbm-switch"
              :class="{ 'is-on': config.confirmUpdate }"
              :aria-pressed="config.confirmUpdate ? 'true' : 'false'"
              @click="config.confirmUpdate = !config.confirmUpdate"
            >
              <span class="wbm-switch-track"><span class="wbm-switch-thumb"></span></span>
              <span class="wbm-switch-text">{{ config.confirmUpdate ? '开启' : '关闭' }}</span>
            </button>
          </div>
          <div class="wbm-switch-row">
            <span class="wbm-switch-label">删除联动回滚</span>
            <button
              type="button"
              class="wbm-switch"
              :class="{ 'is-on': config.syncOnDelete }"
              :aria-pressed="config.syncOnDelete ? 'true' : 'false'"
              @click="config.syncOnDelete = !config.syncOnDelete"
            >
              <span class="wbm-switch-track"><span class="wbm-switch-thumb"></span></span>
              <span class="wbm-switch-text">{{ config.syncOnDelete ? '开启' : '关闭' }}</span>
            </button>
          </div>
          <button class="wbm-btn wbm-btn-primary" @click="saveConfig">保存调度</button>
        </div>
      </section>

      <section v-else-if="activeTab === 4" key="pane-status" class="wbm-pane">
        <div class="wbm-card">
          <div>目标世界书: {{ status.targetBookName || '(未解析)' }}</div>
          <div>自动审核: {{ status.autoEnabled ? '开启' : '关闭' }}</div>
          <div>处理状态: {{ status.processing ? '处理中' : '空闲' }}</div>
          <div>审核模式: {{ formatApprovalMode(status.approvalMode) }}</div>
          <div>待审队列: {{ status.queueSize }}</div>
          <div>下一触发楼层: {{ status.nextDueFloor }}</div>
          <button class="wbm-btn" @click="refreshStatus">刷新状态</button>
        </div>
        <div class="wbm-card">
          <div class="wbm-row">
            <button class="wbm-btn" @click="refreshBackendChats">刷新后台记录</button>
            <button class="wbm-btn" @click="exportBackendRecords">导出后台记录</button>
            <button class="wbm-btn wbm-btn-primary" @click="verifyCurrentBook">验证当前世界书</button>
          </div>
          <div v-if="verifyResult" class="wbm-item is-small">
            校验: {{ verifyResult.ok ? '通过' : '失败' }} |
            问题数: {{ verifyResult.issueCount }} |
            时间: {{ verifyResult.checkedAt }}
          </div>
          <div v-for="item in backendChats" :key="item.id" class="wbm-item is-small">
            <div class="wbm-row is-spread">
              <strong>{{ item.bookName }}</strong>
              <span>{{ item.success ? '成功' : '失败' }} / 指令 {{ item.commandCount }} / {{ item.durationMs ?? 0 }}ms</span>
            </div>
            <div class="wbm-row is-spread">
              <span>{{ item.createdAt }}</span>
              <button class="wbm-btn wbm-btn-mini" @click="selectBackendRecord(item.id)">查看详情</button>
            </div>
            <div>{{ item.outputPreview || item.error || '(空响应)' }}</div>
          </div>
          <div v-if="selectedBackendRecord" class="wbm-item">
            <div class="wbm-row is-spread">
              <strong>后台明细 · {{ selectedBackendRecord.id }}</strong>
              <button class="wbm-btn wbm-btn-mini" @click="exportBackendRecords([selectedBackendRecord.id])">
                导出当前
              </button>
            </div>
            <div>来源: {{ selectedBackendRecord.source }} | 楼层: {{ selectedBackendRecord.floor ?? '-' }} | 聊天: {{ selectedBackendRecord.chatId ?? '-' }}</div>
            <div>请求消息: {{ selectedBackendRecord.promptMessages?.length ?? 0 }} 条 | 指令: {{ selectedBackendRecord.commandCount }}</div>
            <details class="wbm-details">
              <summary>Prompt 预览</summary>
              <pre class="wbm-logs is-inline">{{ formatBackendMessages(selectedBackendRecord.promptMessages) }}</pre>
            </details>
            <details class="wbm-details">
              <summary>模型回复</summary>
              <pre class="wbm-logs is-inline">{{ selectedBackendRecord.rawReply || selectedBackendRecord.outputPreview || '(空)' }}</pre>
            </details>
            <details class="wbm-details">
              <summary>执行结果</summary>
              <pre class="wbm-logs is-inline">{{ formatBackendResults(selectedBackendRecord) }}</pre>
            </details>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 5" key="pane-debug" class="wbm-pane">
        <div class="wbm-row">
          <button class="wbm-btn" @click="refreshQueue">刷新队列</button>
          <button class="wbm-btn" @click="refreshSnapshots">刷新快照</button>
          <button class="wbm-btn" @click="refreshIsolation">刷新隔离</button>
          <button class="wbm-btn wbm-btn-primary" @click="approveAll">全部通过</button>
          <button class="wbm-btn wbm-btn-danger" @click="rejectAll">全部拒绝</button>
        </div>
        <div class="wbm-card">
          <strong>聊天隔离</strong>
          <div>当前聊天: {{ isolationInfo.chatId || '(无)' }}</div>
          <div>当前目标隔离条目: {{ isolationInfo.count }}</div>
          <div>总聊天数: {{ isolationStats.totalChats }} / 总隔离条目: {{ isolationStats.totalEntries }}</div>
          <div class="wbm-row">
            <button class="wbm-btn" @click="clearMyIsolation">清理当前聊天隔离</button>
            <button class="wbm-btn wbm-btn-danger" @click="clearAllIsolation">清理全部隔离</button>
            <button class="wbm-btn wbm-btn-primary" @click="promoteIsolationToGlobal">晋升为全局</button>
          </div>
        </div>
        <div class="wbm-card">
          <strong>审核队列</strong>
          <div v-for="item in queue" :key="item.id" class="wbm-item is-small">
            {{ item.id }} | floor={{ item.floor ?? '-' }} | {{ item.commands.length }} 条
          </div>
        </div>
        <div class="wbm-card">
          <strong>快照</strong>
          <div class="wbm-row">
            <input v-model.number="rollbackFloorInput" type="number" min="0" placeholder="楼层 floor" />
            <input v-model="rollbackChatIdInput" placeholder="聊天 ID（可选）" />
            <button class="wbm-btn wbm-btn-mini" @click="rollbackFloor">按楼层回滚</button>
          </div>
          <div v-for="item in snapshots" :key="item.id" class="wbm-item is-small">
            <div class="wbm-row is-spread">
              <span>
                {{ item.id }} | floor={{ item.floor ?? '-' }} | {{ item.reason }}
              </span>
              <button class="wbm-btn wbm-btn-mini" @click="rollbackSnapshot(item.id)">回滚</button>
            </div>
          </div>
        </div>
      </section>

      <section v-else key="pane-logs" class="wbm-pane">
        <div class="wbm-row">
          <button class="wbm-btn" @click="refreshLogs">刷新日志</button>
          <button class="wbm-btn wbm-btn-danger" @click="clearLogs">清空日志</button>
        </div>
        <pre class="wbm-logs">{{ logsText }}</pre>
      </section>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type {
  ApiPreset,
  BackendChatRecord,
  BookSyncResult,
  IsolationInfo,
  IsolationStats,
  PromptEntry,
  PromptPreset,
  WbmApiConfig,
  WbmConfig,
  WorldbookEntryLike,
} from '../../core/types';
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
const apiConfig = reactive<WbmApiConfig>({ ...props.bridge.getApiConfig() });
const entries = ref<WorldbookEntryLike[]>([]);
const queue = ref(props.bridge.listQueue());
const snapshots = ref(props.bridge.listSnapshots());
const logs = ref(props.bridge.getLogs());
const lastError = ref('');
const promptEntriesText = ref('');
const aiManagedNames = ref<string[]>([]);
const lockedNames = ref<string[]>([]);
const selectedEntryUids = ref<string[]>([]);
const apiPresets = ref<ApiPreset[]>([]);
const promptPresets = ref<PromptPreset[]>([]);
const selectedApiPresetId = ref('');
const selectedPromptPresetId = ref('');
const newApiPresetName = ref('');
const newPromptPresetName = ref('');
const backendChats = ref<BackendChatRecord[]>([]);
const selectedBackendId = ref('');
const verifyResult = ref<BookSyncResult | null>(null);
const isolationInfo = ref<IsolationInfo>(props.bridge.getIsolationInfo());
const isolationStats = ref<IsolationStats>(props.bridge.getIsolationStats());

const newEntryName = ref('');
const newEntryContent = ref('');
const rollbackFloorInput = ref<number | null>(null);
const rollbackChatIdInput = ref('');
const PANEL_REFRESH_EVENT = 'wbm3:panel-refresh';

const logsText = computed(() =>
  logs.value
    .map(item => `[${item.time}] [${item.level}] [${item.namespace}] ${item.message}`)
    .join('\n'),
);

const selectedBackendRecord = computed<BackendChatRecord | null>(
  () => backendChats.value.find(item => item.id === selectedBackendId.value) ?? null,
);

function formatApprovalMode(value: string): string {
  if (value === 'auto') return '自动执行（auto）';
  if (value === 'manual') return '手动审核（manual）';
  if (value === 'selective') return '选择性审核（selective）';
  return value;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => String(item)).join(',');
  if (value == null) return '';
  return String(value);
}

function isAiManaged(entry: WorldbookEntryLike): boolean {
  const name = String(entry.name ?? entry.comment ?? '').trim();
  if (!name) return false;
  return aiManagedNames.value.includes(name);
}

function getEntryUid(entry: WorldbookEntryLike): string {
  const uid = entry.uid ?? entry.id;
  return uid == null ? '' : String(uid);
}

function isEntryLocked(entry: WorldbookEntryLike): boolean {
  const name = String(entry.name ?? entry.comment ?? '').trim();
  if (!name) return false;
  return lockedNames.value.some(item => item.trim().toLowerCase() === name.toLowerCase());
}

function isEntrySelected(entry: WorldbookEntryLike): boolean {
  const uid = getEntryUid(entry);
  if (!uid) return false;
  return selectedEntryUids.value.includes(uid);
}

function toggleEntrySelection(entry: WorldbookEntryLike, event: Event): void {
  const uid = getEntryUid(entry);
  if (!uid) return;
  const checked = (event.target as HTMLInputElement).checked;
  if (checked) {
    if (!selectedEntryUids.value.includes(uid)) {
      selectedEntryUids.value = [...selectedEntryUids.value, uid];
    }
    return;
  }
  selectedEntryUids.value = selectedEntryUids.value.filter(item => item !== uid);
}

function formatBackendMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | undefined,
): string {
  if (!messages || messages.length === 0) return '(空)';
  return messages.map(item => `[${item.role}] ${item.content}`).join('\n\n');
}

function formatBackendResults(record: BackendChatRecord): string {
  const payload = {
    commands: record.commands ?? [],
    results: record.results ?? [],
    error: record.error ?? null,
  };
  return JSON.stringify(payload, null, 2);
}

function downloadJsonFile(filename: string, content: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function setEntryTextField(entry: WorldbookEntryLike, field: string, event: Event): void {
  const next = (event.target as HTMLInputElement).value;
  entry[field] = next;
}

function setEntryNumberField(entry: WorldbookEntryLike, field: string, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  if (!raw.trim()) {
    delete entry[field];
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  entry[field] = Math.floor(value);
}

function toggleEntryField(entry: WorldbookEntryLike, field: string): void {
  entry[field] = entry[field] !== true;
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
  if (next == null) {
    // 拉取失败时清空列表，避免继续展示旧聊天/旧角色的残留条目。
    entries.value = [];
    selectedEntryUids.value = [];
    return;
  }
  entries.value = next;
  const available = new Set(next.map(item => getEntryUid(item)).filter(Boolean));
  selectedEntryUids.value = selectedEntryUids.value.filter(uid => available.has(uid));
  await refreshLockedNames();
  await refreshAiManagedNames();
  await refreshStatus();
}

async function refreshAiManagedNames(): Promise<void> {
  const next = await runData('刷新 AI 托管标记', () => props.bridge.listAiManagedNames());
  if (next == null) return;
  aiManagedNames.value = next;
}

async function refreshLockedNames(): Promise<void> {
  await runVoid('刷新锁定条目', () => {
    lockedNames.value = props.bridge.listLockedNames();
  });
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

async function refreshPromptEntries(): Promise<void> {
  const next = await runData('刷新提示词条目', () => props.bridge.listPromptEntries());
  if (next == null) return;
  promptEntriesText.value = JSON.stringify(next, null, 2);
}

async function refreshApiPresets(): Promise<void> {
  const next = await runData('刷新 API 预设', () => props.bridge.listApiPresets());
  if (next == null) return;
  apiPresets.value = next;
}

async function refreshPromptPresets(): Promise<void> {
  const next = await runData('刷新提示词预设', () => props.bridge.listPromptPresets());
  if (next == null) return;
  promptPresets.value = next;
}

async function refreshBackendChats(): Promise<void> {
  const next = await runData('刷新后台记录', () => props.bridge.listBackendChats());
  if (next == null) return;
  backendChats.value = next;
  if (!next.some(item => item.id === selectedBackendId.value)) {
    selectedBackendId.value = next[0]?.id ?? '';
  }
}

async function refreshIsolation(): Promise<void> {
  await runVoid('刷新隔离', () => {
    isolationInfo.value = props.bridge.getIsolationInfo();
    isolationStats.value = props.bridge.getIsolationStats();
  });
}

async function saveConfig(): Promise<void> {
  await runVoid('保存设置', async () => {
    await props.bridge.saveConfig({ ...config });
    status.value = props.bridge.getStatus();
  });
}

async function saveApiSettings(): Promise<void> {
  const ok = await runVoid('保存 API', async () => {
    await props.bridge.saveApiConfig({ ...apiConfig });
    await props.bridge.saveConfig({
      ...config,
      externalEndpoint: apiConfig.endpoint,
      externalApiKey: apiConfig.key,
      externalModel: apiConfig.model,
    });
    status.value = props.bridge.getStatus();
  });
  if (!ok) return;
  await refreshApiPresets();
}

async function savePromptEntries(): Promise<void> {
  const payload = promptEntriesText.value.trim();
  if (!payload) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch (error) {
    setError('保存提示词条目', error);
    return;
  }
  if (!Array.isArray(parsed)) {
    setError('保存提示词条目', 'JSON 根节点必须是数组');
    return;
  }

  const ok = await runVoid('保存提示词条目', async () => {
    await props.bridge.savePromptEntries(parsed as PromptEntry[]);
  });
  if (!ok) return;
  await refreshPromptEntries();
}

async function saveCurrentApiPreset(): Promise<void> {
  const presetName = newApiPresetName.value.trim();
  if (!presetName) return;
  const ok = await runVoid('保存 API 预设', async () => {
    await props.bridge.saveCurrentAsApiPreset(presetName);
  });
  if (!ok) return;
  newApiPresetName.value = '';
  await refreshApiPresets();
}

async function applyApiPreset(): Promise<void> {
  if (!selectedApiPresetId.value) return;
  const ok = await runVoid('应用 API 预设', async () => {
    await props.bridge.applyApiPreset(selectedApiPresetId.value);
  });
  if (!ok) return;
  Object.assign(apiConfig, props.bridge.getApiConfig());
  Object.assign(config, props.bridge.getConfig());
  status.value = props.bridge.getStatus();
}

async function deleteApiPreset(): Promise<void> {
  if (!selectedApiPresetId.value) return;
  const deletingId = selectedApiPresetId.value;
  const ok = await runVoid('删除 API 预设', async () => {
    await props.bridge.deleteApiPreset(deletingId);
  });
  if (!ok) return;
  if (selectedApiPresetId.value === deletingId) selectedApiPresetId.value = '';
  await refreshApiPresets();
}

async function saveCurrentPromptPreset(): Promise<void> {
  const presetName = newPromptPresetName.value.trim();
  if (!presetName) return;
  const ok = await runVoid('保存提示词预设', async () => {
    await props.bridge.saveCurrentAsPromptPreset(presetName);
  });
  if (!ok) return;
  newPromptPresetName.value = '';
  await refreshPromptPresets();
}

async function applyPromptPreset(): Promise<void> {
  if (!selectedPromptPresetId.value) return;
  const ok = await runVoid('应用提示词预设', async () => {
    await props.bridge.applyPromptPreset(selectedPromptPresetId.value);
  });
  if (!ok) return;
  await refreshPromptEntries();
}

async function deletePromptPreset(): Promise<void> {
  if (!selectedPromptPresetId.value) return;
  const deletingId = selectedPromptPresetId.value;
  const ok = await runVoid('删除提示词预设', async () => {
    await props.bridge.deletePromptPreset(deletingId);
  });
  if (!ok) return;
  if (selectedPromptPresetId.value === deletingId) selectedPromptPresetId.value = '';
  await refreshPromptPresets();
}

async function verifyCurrentBook(): Promise<void> {
  const next = await runData('验证当前世界书', () => props.bridge.verifyCurrentBook());
  if (next == null) return;
  verifyResult.value = next;
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

async function saveEntry(entry: WorldbookEntryLike): Promise<void> {
  const ok = await runVoid('保存条目', async () => {
    await props.bridge.updateEntry({ ...entry });
  });
  if (!ok) return;
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

function selectAllEntries(): void {
  selectedEntryUids.value = entries.value.map(item => getEntryUid(item)).filter(Boolean);
}

function clearSelectedEntries(): void {
  selectedEntryUids.value = [];
}

async function toggleEntryLock(entry: WorldbookEntryLike): Promise<void> {
  const uid = entry.uid ?? entry.id;
  if (uid == null) return;
  const locked = isEntryLocked(entry);
  const ok = await runVoid(locked ? '解锁条目' : '锁定条目', async () => {
    await props.bridge.setEntryLocked(uid, !locked);
  });
  if (!ok) return;
  await refreshLockedNames();
}

async function batchLock(locked: boolean): Promise<void> {
  if (selectedEntryUids.value.length === 0) return;
  const ok = await runVoid(locked ? '批量锁定' : '批量解锁', async () => {
    for (const uid of selectedEntryUids.value) {
      await props.bridge.setEntryLocked(uid, locked);
    }
  });
  if (!ok) return;
  await refreshLockedNames();
}

async function batchEnable(enabled: boolean): Promise<void> {
  if (selectedEntryUids.value.length === 0) return;
  const ok = await runVoid(enabled ? '批量启用' : '批量禁用', async () => {
    await props.bridge.batchSetEnabled(selectedEntryUids.value, enabled);
  });
  if (!ok) return;
  await refreshEntries();
}

async function batchDelete(): Promise<void> {
  if (selectedEntryUids.value.length === 0) return;
  const ok = await runVoid('批量删除', async () => {
    await props.bridge.batchDeleteEntries(selectedEntryUids.value);
  });
  if (!ok) return;
  selectedEntryUids.value = [];
  await refreshEntries();
}

function selectBackendRecord(id: string): void {
  selectedBackendId.value = id;
}

async function exportBackendRecords(ids?: string[]): Promise<void> {
  const ok = await runVoid('导出后台记录', () => {
    const raw = props.bridge.exportBackendChats(ids);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJsonFile(`wbm3-backend-${stamp}.json`, raw);
  });
  if (!ok) return;
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

async function clearMyIsolation(): Promise<void> {
  const ok = await runVoid('清理当前聊天隔离', async () => {
    await props.bridge.clearMyIsolation();
  });
  if (!ok) return;
  await refreshIsolation();
}

async function clearAllIsolation(): Promise<void> {
  const ok = await runVoid('清理全部隔离', async () => {
    await props.bridge.clearAllIsolation();
  });
  if (!ok) return;
  await refreshIsolation();
}

async function promoteIsolationToGlobal(): Promise<void> {
  const ok = await runVoid('晋升隔离条目', async () => {
    await props.bridge.promoteIsolationToGlobal();
  });
  if (!ok) return;
  await refreshIsolation();
}

async function refreshForActiveTab(): Promise<void> {
  await refreshStatus();
  if (activeTab.value === 0) {
    await refreshEntries();
    await refreshLockedNames();
    await refreshAiManagedNames();
    return;
  }
  if (activeTab.value === 1) {
    await refreshPromptEntries();
    await refreshPromptPresets();
    return;
  }
  if (activeTab.value === 2) {
    await refreshApiPresets();
    return;
  }
  if (activeTab.value === 4) {
    await refreshStatus();
    await refreshBackendChats();
    await refreshIsolation();
    return;
  }
  if (activeTab.value === 5) {
    await refreshQueue();
    await refreshSnapshots();
    await refreshIsolation();
    return;
  }
  if (activeTab.value === 6) {
    await refreshLogs();
  }
}

function handlePanelRefreshEvent(): void {
  void refreshForActiveTab();
}

watch(activeTab, () => {
  void refreshForActiveTab();
});

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener(PANEL_REFRESH_EVENT, handlePanelRefreshEvent);
  }
  const initEntries = await runData('初始化面板', () => props.bridge.listEntries());
  const initEntriesError = initEntries == null ? lastError.value : '';
  entries.value = initEntries ?? [];

  const initQueue = await runData('初始化队列', () => props.bridge.listQueue());
  if (initQueue != null) queue.value = initQueue;

  const initSnapshots = await runData('初始化快照', () => props.bridge.listSnapshots());
  if (initSnapshots != null) snapshots.value = initSnapshots;

  const initLogs = await runData('初始化日志', () => props.bridge.getLogs());
  if (initLogs != null) logs.value = initLogs;

  await refreshPromptEntries();
  await refreshApiPresets();
  await refreshPromptPresets();
  await refreshBackendChats();
  await refreshIsolation();
  await refreshLockedNames();
  await refreshAiManagedNames();
  await refreshStatus();
  if (initEntriesError) {
    lastError.value = initEntriesError;
  }
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener(PANEL_REFRESH_EVENT, handlePanelRefreshEvent);
});
</script>

<style scoped>
.wbm-shell {
  --wbm-bg-root: #151311;
  --wbm-bg-glass: rgba(40, 33, 29, 0.58);
  --wbm-bg-panel: rgba(28, 24, 21, 0.72);
  --wbm-bg-soft: rgba(35, 30, 26, 0.62);
  --wbm-border: rgba(255, 214, 170, 0.18);
  --wbm-border-strong: rgba(255, 214, 170, 0.32);
  --wbm-text-main: #f4efe8;
  --wbm-text-sub: #d7c8b8;
  --wbm-text-dim: #b8a898;
  --wbm-accent: #d09a66;
  --wbm-accent-strong: #e8b784;
  --wbm-danger: #c45b55;
  --wbm-success: #7bb087;
  --wbm-radius-shell: 24px;
  --wbm-radius-card: 18px;
  --wbm-radius-control: 14px;
  --wbm-ease: cubic-bezier(0.22, 0.8, 0.28, 1);
  width: min(1040px, 96vw);
  max-height: 90vh;
  background: linear-gradient(155deg, rgba(45, 37, 32, 0.86), rgba(20, 17, 15, 0.9));
  color: var(--wbm-text-main);
  border: 1px solid var(--wbm-border);
  border-radius: var(--wbm-radius-shell);
  box-shadow:
    0 18px 60px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 236, 214, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
  font-weight: 500;
  animation: wbm-panel-enter 220ms var(--wbm-ease);
}
.wbm-shell,
.wbm-shell * {
  font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif !important;
  font-style: normal !important;
  letter-spacing: 0 !important;
  text-shadow: none !important;
  text-transform: none !important;
  font-kerning: normal;
}
.wbm-shell::before {
  content: "";
  position: absolute;
  inset: -40% -20% auto;
  height: 55%;
  background:
    radial-gradient(ellipse at 20% 35%, rgba(232, 183, 132, 0.18), transparent 62%),
    radial-gradient(ellipse at 75% 30%, rgba(208, 154, 102, 0.12), transparent 65%);
  pointer-events: none;
}
@supports ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .wbm-shell {
    background: var(--wbm-bg-glass);
    backdrop-filter: blur(18px) saturate(135%);
    -webkit-backdrop-filter: blur(18px) saturate(135%);
  }
}
.wbm-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  z-index: 1;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--wbm-border);
  background: rgba(28, 24, 21, 0.68);
}
.wbm-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--wbm-text-main);
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.wbm-title::after {
  content: "";
  width: 42px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--wbm-accent), transparent);
}
.wbm-tabs {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 14px 12px;
  border-bottom: 1px solid var(--wbm-border);
  background: rgba(26, 22, 19, 0.5);
}
.wbm-shell .wbm-tab,
.wbm-shell .wbm-btn {
  all: unset;
  box-sizing: border-box;
  font: inherit;
  line-height: 1;
}
.wbm-tab {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  box-sizing: border-box !important;
  height: 40px !important;
  min-height: 40px !important;
  padding: 0 12px !important;
  line-height: 1;
  white-space: nowrap;
  border-radius: 999px !important;
  border: 1px solid transparent !important;
  background: rgba(52, 44, 38, 0.28) !important;
  color: var(--wbm-text-sub) !important;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 180ms var(--wbm-ease),
    background-color 180ms var(--wbm-ease),
    border-color 180ms var(--wbm-ease),
    box-shadow 180ms var(--wbm-ease),
    transform 180ms var(--wbm-ease);
}
.wbm-tab:hover {
  color: var(--wbm-text-main) !important;
  border-color: var(--wbm-border) !important;
  background: rgba(75, 63, 54, 0.4) !important;
}
.wbm-tab.is-active {
  color: #221a14 !important;
  border-color: rgba(232, 183, 132, 0.45) !important;
  background: linear-gradient(135deg, rgba(232, 183, 132, 0.92), rgba(208, 154, 102, 0.9)) !important;
  box-shadow: 0 0 0 1px rgba(232, 183, 132, 0.18), 0 10px 22px rgba(208, 154, 102, 0.3);
}
.wbm-body {
  padding: 16px 18px 18px;
  min-height: min(60vh, 620px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}
.wbm-error-banner {
  border: 1px solid rgba(196, 91, 85, 0.45);
  background: linear-gradient(135deg, rgba(90, 34, 33, 0.72), rgba(66, 24, 24, 0.64));
  color: #ffd9d7;
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.wbm-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  will-change: transform, opacity;
}
.wbm-pane-switch-enter-active,
.wbm-pane-switch-leave-active {
  transition:
    opacity 220ms var(--wbm-ease),
    transform 220ms var(--wbm-ease);
}
.wbm-pane-switch-enter-from,
.wbm-pane-switch-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.wbm-pane-switch-enter-to,
.wbm-pane-switch-leave-from {
  opacity: 1;
  transform: translateY(0);
}
.wbm-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.wbm-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 214, 170, 0.2);
  background: rgba(56, 47, 40, 0.55);
  color: var(--wbm-text-sub);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.wbm-chip.is-accent {
  border-color: rgba(232, 183, 132, 0.48);
  background: rgba(208, 154, 102, 0.25);
  color: var(--wbm-text-main);
}
.wbm-chip.is-lock {
  border-color: rgba(123, 176, 135, 0.45);
  background: rgba(69, 113, 79, 0.3);
  color: #d7f0dd;
}
.wbm-entry-check {
  accent-color: var(--wbm-accent-strong);
}
.wbm-row.is-spread {
  justify-content: space-between;
}
.wbm-card {
  border: 1px solid var(--wbm-border);
  border-radius: var(--wbm-radius-card);
  background: var(--wbm-bg-panel);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 232, 208, 0.06);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition:
    border-color 160ms var(--wbm-ease),
    box-shadow 160ms var(--wbm-ease),
    transform 160ms var(--wbm-ease);
}
@supports ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .wbm-card {
    backdrop-filter: blur(14px) saturate(125%);
    -webkit-backdrop-filter: blur(14px) saturate(125%);
  }
}
.wbm-card:hover {
  transform: translateY(-1px);
  border-color: var(--wbm-border-strong);
  box-shadow:
    0 14px 30px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 232, 208, 0.11);
}
.wbm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wbm-item {
  border: 1px solid rgba(255, 214, 170, 0.12);
  border-radius: 16px;
  background: var(--wbm-bg-soft);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition:
    transform 160ms var(--wbm-ease),
    border-color 160ms var(--wbm-ease),
    box-shadow 160ms var(--wbm-ease);
}
.wbm-item:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 214, 170, 0.3);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.22);
}
.wbm-item.is-small {
  padding: 8px 10px;
}
.wbm-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.wbm-shell input,
.wbm-shell textarea,
.wbm-shell select {
  width: 100%;
  background: rgba(22, 19, 17, 0.88);
  color: var(--wbm-text-main);
  border: 1px solid rgba(255, 214, 170, 0.14);
  border-radius: var(--wbm-radius-control);
  padding: 10px 12px;
  transition:
    border-color 160ms var(--wbm-ease),
    box-shadow 160ms var(--wbm-ease),
    background-color 160ms var(--wbm-ease),
    transform 160ms var(--wbm-ease);
}
.wbm-shell textarea {
  min-height: 108px;
  resize: vertical;
}
.wbm-shell input::placeholder,
.wbm-shell textarea::placeholder {
  color: var(--wbm-text-dim);
}
.wbm-shell input:focus,
.wbm-shell textarea:focus,
.wbm-shell select:focus {
  outline: none;
  border-color: rgba(232, 183, 132, 0.58);
  box-shadow:
    0 0 0 1px rgba(232, 183, 132, 0.32),
    0 0 0 4px rgba(208, 154, 102, 0.16);
  background: rgba(25, 21, 19, 0.96);
}
.wbm-shell input[type="checkbox"] {
  width: auto;
  min-width: 18px;
  min-height: 18px;
  padding: 0;
  border-radius: 6px;
}
.wbm-switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 2px 0;
}
.wbm-switch-label {
  color: var(--wbm-text-sub);
  font-weight: 600;
}
.wbm-switch {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  border-radius: 999px;
}
.wbm-switch-track {
  position: relative;
  width: 52px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(255, 214, 170, 0.24);
  background: rgba(35, 29, 24, 0.86);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
  transition:
    background-color 160ms var(--wbm-ease),
    border-color 160ms var(--wbm-ease),
    box-shadow 160ms var(--wbm-ease);
}
.wbm-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f4efe8, #d7c8b8);
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.34),
    inset 0 1px 1px rgba(255, 255, 255, 0.28);
  transition: transform 180ms var(--wbm-ease);
}
.wbm-switch-text {
  min-width: 30px;
  color: var(--wbm-text-sub);
  font-weight: 600;
  text-align: right;
}
.wbm-switch.is-on .wbm-switch-track {
  border-color: rgba(232, 183, 132, 0.56);
  background: linear-gradient(135deg, rgba(232, 183, 132, 0.96), rgba(208, 154, 102, 0.9));
  box-shadow:
    0 0 0 1px rgba(232, 183, 132, 0.18),
    0 8px 16px rgba(208, 154, 102, 0.28);
}
.wbm-switch.is-on .wbm-switch-thumb {
  transform: translateX(22px);
  background: linear-gradient(135deg, #fff6eb, #f0e0cd);
}
.wbm-switch.is-on .wbm-switch-text {
  color: var(--wbm-text-main);
}
.wbm-switch:focus-visible .wbm-switch-track {
  box-shadow:
    0 0 0 2px rgba(232, 183, 132, 0.22),
    0 0 0 5px rgba(208, 154, 102, 0.14);
}
.wbm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1;
  min-height: 36px;
  white-space: nowrap;
  border: 1px solid rgba(255, 214, 170, 0.2) !important;
  background: linear-gradient(135deg, rgba(64, 55, 47, 0.88), rgba(40, 33, 29, 0.92)) !important;
  color: var(--wbm-text-main) !important;
  border-radius: 999px !important;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 650;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition:
    transform 140ms var(--wbm-ease),
    box-shadow 140ms var(--wbm-ease),
    border-color 140ms var(--wbm-ease),
    filter 140ms var(--wbm-ease),
    background-color 140ms var(--wbm-ease);
}
.wbm-btn:hover {
  border-color: rgba(255, 214, 170, 0.42) !important;
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.32);
}
.wbm-btn:active {
  transform: scale(0.985);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.24);
}
.wbm-btn.wbm-btn-primary {
  border-color: rgba(232, 183, 132, 0.5) !important;
  background: linear-gradient(135deg, rgba(232, 183, 132, 0.96), rgba(208, 154, 102, 0.94)) !important;
  color: #2b1f16 !important;
}
.wbm-btn.wbm-btn-danger {
  border-color: rgba(196, 91, 85, 0.56) !important;
  background: linear-gradient(135deg, rgba(146, 55, 51, 0.88), rgba(113, 39, 38, 0.9)) !important;
  color: #ffe9e7 !important;
}
.wbm-btn.wbm-btn-mini {
  min-height: 30px;
  padding: 6px 10px;
  font-size: 12px;
}
.wbm-logs {
  background: rgba(16, 14, 12, 0.92);
  border: 1px solid rgba(255, 214, 170, 0.12);
  border-radius: 14px;
  padding: 12px;
  white-space: pre-wrap;
  max-height: 56vh;
  overflow: auto;
  color: #d9cec1;
  font-family: "Cascadia Code", "JetBrains Mono", "Consolas", monospace !important;
  font-size: 12px;
}
.wbm-logs.is-inline {
  margin: 8px 0 0;
  max-height: 220px;
}
.wbm-details {
  border: 1px solid rgba(255, 214, 170, 0.12);
  border-radius: 12px;
  background: rgba(20, 17, 15, 0.55);
  padding: 8px 10px;
}
.wbm-details summary {
  cursor: pointer;
  color: var(--wbm-text-sub);
  font-weight: 600;
}
.wbm-shell label {
  color: var(--wbm-text-sub);
  font-weight: 600;
}
.wbm-shell strong {
  color: var(--wbm-text-main);
}
@keyframes wbm-panel-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.988);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .wbm-shell {
    animation: none !important;
  }
  .wbm-tab,
  .wbm-btn,
  .wbm-card,
  .wbm-item,
  .wbm-shell input,
  .wbm-shell textarea,
  .wbm-shell select {
    transition:
      color 90ms linear,
      background-color 90ms linear,
      border-color 90ms linear !important;
  }
  .wbm-pane-switch-enter-active,
  .wbm-pane-switch-leave-active {
    transition: opacity 90ms linear !important;
  }
  .wbm-pane-switch-enter-from,
  .wbm-pane-switch-leave-to,
  .wbm-pane-switch-enter-to,
  .wbm-pane-switch-leave-from {
    transform: none !important;
  }
  .wbm-btn:hover,
  .wbm-btn:active,
  .wbm-card:hover,
  .wbm-item:hover {
    transform: none !important;
  }
}
@media (max-width: 900px) {
  .wbm-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .wbm-shell {
    width: min(98vw, 760px);
    max-height: 92vh;
    border-radius: 20px;
  }
  .wbm-head {
    padding: 12px 14px 10px;
  }
  .wbm-title {
    font-size: 22px;
  }
  .wbm-body {
    padding: 14px;
  }
  .wbm-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
