import { createApp, type App as VueApp } from 'vue';
import type { LoggerLike } from '../../core/types';
import WbmPanel from './WbmPanel.vue';
import type { PanelBridge } from './types';

export interface PanelController {
  open(): void;
  close(): void;
  refresh(): void;
  destroy(): void;
}

export class VuePanelController implements PanelController {
  private overlay: HTMLDivElement | null = null;
  private app: VueApp<Element> | null = null;
  private opened = false;

  constructor(
    private readonly logger: LoggerLike,
    private readonly bridge: PanelBridge,
    private readonly onVisibilityChange?: (open: boolean) => void,
  ) {}

  private ensureMounted(): boolean {
    if (typeof document === 'undefined') {
      this.logger.warn('document 不可用，无法挂载 Vue 面板');
      return false;
    }
    if (this.overlay && this.app) return true;

    const overlay = document.createElement('div');
    overlay.id = 'wbm3-panel-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:12px;';

    const host = document.createElement('div');
    host.id = 'wbm3-panel-root';
    overlay.appendChild(host);
    document.body.appendChild(overlay);

    const app = createApp(WbmPanel, {
      bridge: this.bridge,
      onClose: () => this.close(),
    });
    app.mount(host);

    this.overlay = overlay;
    this.app = app;
    return true;
  }

  open(): void {
    if (!this.ensureMounted() || !this.overlay) return;
    this.opened = true;
    this.overlay.style.display = 'flex';
    this.onVisibilityChange?.(true);
    this.logger.info('Vue 面板已打开');
  }

  close(): void {
    if (!this.overlay) return;
    this.opened = false;
    this.overlay.style.display = 'none';
    this.onVisibilityChange?.(false);
    this.logger.info('Vue 面板已关闭');
  }

  refresh(): void {
    if (!this.opened) return;
    // Vue 面板内部通过 bridge 按需读取状态，外部 refresh 保持为兼容触发点。
  }

  destroy(): void {
    this.app?.unmount();
    this.app = null;
    this.overlay?.remove();
    this.overlay = null;
    this.opened = false;
    this.onVisibilityChange?.(false);
  }
}

// 兼容旧命名，避免外部引用中断
export class DomPanelController extends VuePanelController {}

export class PlaceholderPanelController implements PanelController {
  constructor(private readonly logger: LoggerLike) {}
  open(): void {
    this.logger.info('panel.open() 占位实现');
  }
  close(): void {
    this.logger.info('panel.close() 占位实现');
  }
  refresh(): void {
    this.logger.info('panel.refresh() 占位实现');
  }
  destroy(): void {
    this.logger.info('panel.destroy() 占位实现');
  }
}

export type { PanelBridge } from './types';
