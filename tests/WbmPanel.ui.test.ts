/* @vitest-environment jsdom */

import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type {
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
    mode: 'external',
    apiSource: 'custom',
    targetType: 'managed',
    targetBookName: 'book-A',
    externalEndpoint: 'https://example.com',
    externalApiKey: 'key',
    externalModel: 'model',
    startAfter: 3,
    interval: 5,
    triggerTiming: 'after',
    approvalMode: 'manual',
    reviewDepth: 10,
    autoEnabled: true,
    confirmDelete: true,
    logLevel: 'info',
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
  let entries: WorldbookEntryLike[] = [{ uid: 1, name: '条目A', content: '内容A', enabled: true }];
  let config = makeConfig();
  let status = makeStatus();
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
    saveConfig: vi.fn(async next => {
      config = { ...next };
    }),
    listEntries: vi.fn(async () => entries.map(item => ({ ...item }))),
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
    listQueue: vi.fn(() => queue.map(item => ({ ...item, commands: [...item.commands] }))),
    listSnapshots: vi.fn((bookName?: string) =>
      snapshots
        .filter(item => !bookName || item.bookName === bookName)
        .map(item => ({ ...item, entries: [...item.entries] })),
    ),
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

    await wrapper.find('input[placeholder="floor"]').setValue('18');
    await wrapper.find('input[placeholder="chatId(可选)"]').setValue('chat-x');
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
});
