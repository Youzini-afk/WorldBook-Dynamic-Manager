/* @vitest-environment jsdom */

import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../src/WBM/core/config';
import type {
  ApiPreset,
  BackendChatRecord,
  IsolationInfo,
  IsolationStats,
  PromptEntry,
  PromptPreset,
  WbmApiConfig,
  PendingReviewItem,
  SnapshotRecord,
  WbmConfig,
  WbmStatus,
  WorldbookEntryLike,
} from '../src/WBM/core/types';
import type { LogRecord } from '../src/WBM/infra/logger';
import WbmPanel from '../src/WBM/ui/panel/WbmPanel.vue';
import type { PanelBridge } from '../src/WBM/ui/panel/types';

function makeConfig(): WbmConfig {
  return {
    ...DEFAULT_CONFIG,
    targetType: 'managed',
    targetBookName: 'book-A',
    externalEndpoint: 'https://example.com',
    externalApiKey: 'key',
    externalModel: 'model',
    approvalMode: 'manual',
  };
}

function makeStatus(): WbmStatus {
  return {
    autoEnabled: true,
    processing: false,
    approvalMode: 'manual',
    queueSize: 1,
    nextDueFloor: 12,
    targetBookName: 'book-A',
    backendAvailable: true,
    eventSourceAvailable: true,
    mountAvailable: true,
  };
}

function makeBridge(overrides: Partial<PanelBridge> = {}): PanelBridge {
  let apiConfig: WbmApiConfig = {
    type: 'openai',
    endpoint: 'https://api.example.com',
    key: 'key',
    model: 'gpt-4o-mini',
    maxTokens: 1024,
    temperature: 0.7,
    topP: 0.95,
    timeoutMs: 1000,
    retries: 1,
  };
  let entries: WorldbookEntryLike[] = [{ uid: 1, name: '条目A', content: '内容A', enabled: true }];
  let config = makeConfig();
  let status = makeStatus();
  let promptEntries: PromptEntry[] = [];
  let apiPresets: ApiPreset[] = [];
  let promptPresets: PromptPreset[] = [];
  let backendChats: BackendChatRecord[] = [];
  let isolationInfo: IsolationInfo = { chatId: 'chat-1', count: 0, entries: [] };
  let isolationStats: IsolationStats = { totalChats: 1, totalEntries: 0, byChat: [{ chatId: 'chat-1', count: 0 }] };
  let aiManagedNames: string[] = [];
  let lockedNames: string[] = [];
  let queue: PendingReviewItem[] = [
    {
      id: 'q1',
      bookName: 'book-A',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
      floor: 10,
    },
  ];
  let snapshots: SnapshotRecord[] = [
    {
      id: 's1',
      bookName: 'book-A',
      createdAt: new Date().toISOString(),
      reason: 'patch:A',
      entries: [],
      floor: 10,
    },
  ];
  let logs: LogRecord[] = [
    {
      level: 'info',
      namespace: 'WBM3',
      message: 'ready',
      time: new Date().toISOString(),
    },
  ];

  const bridge: PanelBridge = {
    getStatus: vi.fn(() => ({ ...status })),
    getConfig: vi.fn(() => ({ ...config })),
    getApiConfig: vi.fn(() => ({ ...apiConfig })),
    saveConfig: vi.fn(async next => {
      config = { ...next };
    }),
    saveApiConfig: vi.fn(async next => {
      apiConfig = { ...next };
    }),
    listEntries: vi.fn(async () => entries.map(item => ({ ...item }))),
    listWorldbookNames: vi.fn(async () => ['book-A']),
    listAiManagedNames: vi.fn(() => [...aiManagedNames]),
    listLockedNames: vi.fn(() => [...lockedNames]),
    setEntryLocked: vi.fn(async (uid: number | string, locked: boolean) => {
      const entry = entries.find(item => String(item.uid ?? item.id) === String(uid));
      const name = String(entry?.name ?? entry?.comment ?? '').trim();
      if (!name) return;
      const next = lockedNames.filter(item => item.toLowerCase() !== name.toLowerCase());
      if (locked) next.push(name);
      lockedNames = next;
    }),
    batchSetEnabled: vi.fn(async (uids: Array<number | string>, enabled: boolean) => {
      const uidSet = new Set(uids.map(item => String(item)));
      let updated = 0;
      let skipped = 0;
      entries = entries.map(item => {
        const uid = String(item.uid ?? item.id);
        if (!uidSet.has(uid)) return item;
        const name = String(item.name ?? item.comment ?? '').trim();
        if (lockedNames.some(value => value.toLowerCase() === name.toLowerCase())) {
          skipped++;
          return item;
        }
        updated++;
        return { ...item, enabled };
      });
      return { updated, skipped };
    }),
    batchDeleteEntries: vi.fn(async (uids: Array<number | string>) => {
      const uidSet = new Set(uids.map(item => String(item)));
      let deleted = 0;
      let skipped = 0;
      entries = entries.filter(item => {
        const uid = String(item.uid ?? item.id);
        if (!uidSet.has(uid)) return true;
        const name = String(item.name ?? item.comment ?? '').trim();
        if (lockedNames.some(value => value.toLowerCase() === name.toLowerCase())) {
          skipped++;
          return true;
        }
        deleted++;
        return false;
      });
      return { deleted, skipped };
    }),
    createEntry: vi.fn(async fields => {
      entries.push({ uid: entries.length + 1, ...fields });
    }),
    updateEntry: vi.fn(async entry => {
      const uid = entry.uid ?? entry.id;
      entries = entries.map(item =>
        String(item.uid ?? item.id) === String(uid) ? { ...item, ...entry } : item,
      );
    }),
    deleteEntry: vi.fn(async uid => {
      entries = entries.filter(item => String(item.uid ?? item.id) !== String(uid));
    }),
    manualReview: vi.fn(async () => undefined),
    approveAll: vi.fn(async () => undefined),
    rejectAll: vi.fn(async () => undefined),
    approveOne: vi.fn(async () => undefined),
    rejectOne: vi.fn(async () => undefined),
    listQueue: vi.fn(() => queue.map(item => ({ ...item, commands: [...item.commands] }))),
    listSnapshots: vi.fn((bookName?: string) =>
      snapshots
        .filter(item => !bookName || item.bookName === bookName)
        .map(item => ({ ...item, entries: [...item.entries] })),
    ),
    listPromptEntries: vi.fn(() => promptEntries.map(item => ({ ...item }))),
    savePromptEntries: vi.fn(async (next: PromptEntry[]) => {
      promptEntries = next.map(item => ({ ...item }));
    }),
    listApiPresets: vi.fn(() => apiPresets.map(item => ({ ...item, config: { ...item.config } }))),
    saveCurrentAsApiPreset: vi.fn(async (name: string) => {
      apiPresets = [
        ...apiPresets,
        {
          id: `api-${apiPresets.length + 1}`,
          name,
          config: { ...apiConfig },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }),
    applyApiPreset: vi.fn(async () => undefined),
    deleteApiPreset: vi.fn(async (id: string) => {
      apiPresets = apiPresets.filter(item => item.id !== id);
    }),
    listPromptPresets: vi.fn(() => promptPresets.map(item => ({ ...item, entries: [...item.entries] }))),
    saveCurrentAsPromptPreset: vi.fn(async (name: string) => {
      promptPresets = [
        ...promptPresets,
        {
          id: `prompt-${promptPresets.length + 1}`,
          name,
          entries: [...promptEntries],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }),
    applyPromptPreset: vi.fn(async () => undefined),
    deletePromptPreset: vi.fn(async (id: string) => {
      promptPresets = promptPresets.filter(item => item.id !== id);
    }),
    listBackendChats: vi.fn(() => backendChats.map(item => ({ ...item }))),
    exportBackendChats: vi.fn(() => JSON.stringify({ records: backendChats })),
    exportWorldbook: vi.fn(async () => JSON.stringify({ name: 'book-A', entries })),
    importWorldbookRaw: vi.fn(async () => ({
      bookName: 'book-A',
      strategy: 'overwrite' as const,
      imported: 1,
      skipped: 0,
      renamed: 0,
    })),
    listActivationLogs: vi.fn(() => []),
    clearActivationLogs: vi.fn(() => undefined),
    exportActivationLogs: vi.fn(() => JSON.stringify({ records: [] })),
    verifyCurrentBook: vi.fn(async () => ({
      ok: true,
      checkedAt: new Date().toISOString(),
      bookName: 'book-A',
      issueCount: 0,
      issues: [],
    })),
    getIsolationInfo: vi.fn(() => ({ ...isolationInfo, entries: [...isolationInfo.entries] })),
    getIsolationStats: vi.fn(() => ({ ...isolationStats, byChat: [...isolationStats.byChat] })),
    clearMyIsolation: vi.fn(async () => {
      isolationInfo = { ...isolationInfo, count: 0, entries: [] };
      isolationStats = { ...isolationStats, totalEntries: 0, byChat: [{ chatId: 'chat-1', count: 0 }] };
    }),
    clearAllIsolation: vi.fn(async () => {
      isolationInfo = { ...isolationInfo, count: 0, entries: [] };
      isolationStats = { ...isolationStats, totalEntries: 0, totalChats: 0, byChat: [] };
    }),
    promoteIsolationToGlobal: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    rollbackFloor: vi.fn(async () => undefined),
    getLogs: vi.fn(() => logs.map(item => ({ ...item }))),
    clearLogs: vi.fn(() => {
      logs = [];
    }),
  };

  Object.assign(bridge, overrides);
  return bridge;
}

async function clickTab(wrapper: VueWrapper<unknown>, label: string): Promise<void> {
  const tab = wrapper.findAll('button.wbm-tab').find(button => button.text() === label);
  expect(tab, `tab not found: ${label}`).toBeDefined();
  await tab!.trigger('click');
  await flushPromises();
}

async function clickButton(wrapper: VueWrapper<unknown>, label: string): Promise<void> {
  const button = wrapper.findAll('button').find(item => item.text() === label);
  expect(button, `button not found: ${label}`).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
}

describe('WbmPanel UI', () => {
  it('应渲染 7 标签并可切换', async () => {
    const bridge = makeBridge();
    const wrapper = mount(WbmPanel, { props: { bridge } });
    await flushPromises();

    const tabs = wrapper.findAll('button.wbm-tab');
    expect(tabs).toHaveLength(7);

    await clickTab(wrapper, '后台');
    expect(wrapper.text()).toContain('下一触发楼层');

    await clickTab(wrapper, '日志');
    expect(wrapper.text()).toContain('清空日志');
  });

  it('世界书标签关键路径可执行', async () => {
    const bridge = makeBridge();
    const wrapper = mount(WbmPanel, { props: { bridge } });
    await flushPromises();

    expect(wrapper.text()).toContain('条目A');

    await wrapper.find('input[placeholder="新条目名称"]').setValue('新条目');
    await wrapper.find('textarea[placeholder="新条目内容"]').setValue('新内容');
    await clickButton(wrapper, '新增');

    expect(bridge.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: '新条目', content: '新内容', enabled: true }),
    );

    await clickButton(wrapper, '手动审核');
    expect(bridge.manualReview).toHaveBeenCalledTimes(1);
  });

  it('提示词/API/调度标签可保存配置', async () => {
    const bridge = makeBridge();
    const wrapper = mount(WbmPanel, { props: { bridge } });
    await flushPromises();

    await clickTab(wrapper, '提示词');
    await wrapper.find('input[type="number"]').setValue('12');
    await clickButton(wrapper, '保存设置');

    await clickTab(wrapper, 'API');
    await wrapper.find('input').setValue('https://example.org');
    await clickButton(wrapper, '保存 API');

    await clickTab(wrapper, '设置');
    await wrapper.find('input[type="number"]').setValue('4');
    await clickButton(wrapper, '保存调度');

    expect(bridge.saveConfig).toHaveBeenCalledTimes(3);
  });

  it('调试与日志标签关键操作可执行', async () => {
    const bridge = makeBridge();
    const wrapper = mount(WbmPanel, { props: { bridge } });
    await flushPromises();

    await clickTab(wrapper, '调试');
    await clickButton(wrapper, '全部通过');
    await clickButton(wrapper, '全部拒绝');
    expect(bridge.approveAll).toHaveBeenCalledTimes(1);
    expect(bridge.rejectAll).toHaveBeenCalledTimes(1);

    await wrapper.find('input[placeholder="楼层 floor"]').setValue('18');
    await wrapper.find('input[placeholder="聊天 ID（可选）"]').setValue('chat-x');
    await clickButton(wrapper, '按楼层回滚');
    expect(bridge.rollbackFloor).toHaveBeenCalledWith(18, 'chat-x');

    await clickButton(wrapper, '回滚');
    expect(bridge.rollback).toHaveBeenCalledWith('s1');

    await clickTab(wrapper, '日志');
    expect(wrapper.text()).toContain('ready');
    await clickButton(wrapper, '清空日志');
    expect(bridge.clearLogs).toHaveBeenCalledTimes(1);
  });

  it('失败路径会显示错误条并可清除', async () => {
    const bridge = makeBridge({
      approveAll: vi.fn(async () => {
        throw new Error('approve failed');
      }),
    });
    const wrapper = mount(WbmPanel, { props: { bridge } });
    await flushPromises();

    await clickTab(wrapper, '调试');
    await clickButton(wrapper, '全部通过');

    expect(wrapper.text()).toContain('全部通过失败');
    expect(wrapper.find('.wbm-error-banner').exists()).toBe(true);

    await clickButton(wrapper, '清除');
    expect(wrapper.find('.wbm-error-banner').exists()).toBe(false);
  });

  it('条目刷新失败时应清空旧条目，避免展示陈旧数据', async () => {
    const listEntries = vi
      .fn()
      .mockResolvedValueOnce([{ uid: 1, name: '旧条目', content: '旧内容', enabled: true }])
      .mockRejectedValueOnce(new Error('未找到当前打开的角色卡'));
    const bridge = makeBridge({ listEntries });
    const wrapper = mount(WbmPanel, { props: { bridge } });
    await flushPromises();

    expect(wrapper.text()).toContain('旧条目');

    await clickButton(wrapper, '刷新');
    expect(wrapper.text()).toContain('刷新条目失败');
    expect(wrapper.text()).not.toContain('旧条目');
  });

  it('接收外部刷新事件时应重新拉取当前标签数据', async () => {
    const listEntries = vi
      .fn()
      .mockResolvedValueOnce([{ uid: 1, name: '条目A', content: 'A', enabled: true }])
      .mockResolvedValueOnce([{ uid: 2, name: '条目B', content: 'B', enabled: true }]);
    const bridge = makeBridge({ listEntries });
    const wrapper = mount(WbmPanel, { props: { bridge } });
    await flushPromises();

    expect(wrapper.text()).toContain('条目A');
    window.dispatchEvent(new CustomEvent('wbm3:panel-refresh'));
    await flushPromises();

    expect(listEntries).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('条目B');
  });
});
