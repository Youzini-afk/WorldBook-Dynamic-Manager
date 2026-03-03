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
  private hostStyleNodes: HTMLStyleElement[] = [];

  constructor(
    private readonly logger: LoggerLike,
    private readonly bridge: PanelBridge,
    private readonly onVisibilityChange?: (open: boolean) => void,
  ) {}

  private getHostDocument(): Document | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    try {
      const parentDoc = (window.parent as Window | null | undefined)?.document;
      if (parentDoc) return parentDoc;
    } catch {
      // 访问父窗口失败时回退到当前文档
    }
    return document;
  }

  private ensureMounted(): boolean {
    const hostDoc = this.getHostDocument();
    if (!hostDoc) {
      this.logger.warn('document 不可用，无法挂载 Vue 面板');
      return false;
    }
    if (this.overlay && this.app) return true;

    const overlay = hostDoc.createElement('div');
    overlay.id = 'wbm3-panel-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:12px;';

    const host = hostDoc.createElement('div');
    host.id = 'wbm3-panel-root';
    overlay.appendChild(host);
    hostDoc.body.appendChild(overlay);

    const app = createApp(WbmPanel, {
      bridge: this.bridge,
      onClose: () => this.close(),
    });
    app.mount(host);
    this.syncStylesToHost(hostDoc);

    this.overlay = overlay;
    this.app = app;
    return true;
  }

  private getStyleSignature(cssText: string): string {
    let hash = 2166136261;
    for (let index = 0; index < cssText.length; index += 1) {
      hash ^= cssText.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `wbm3-${(hash >>> 0).toString(16)}`;
  }

  private syncStylesToHost(hostDoc: Document): void {
    if (hostDoc === document) return;
    const sourceDoc = document;
    const sourceStyles = Array.from(sourceDoc.head.querySelectorAll('style'));
    const panelStyles = sourceStyles.filter(style => {
      const cssText = style.textContent ?? '';
      return cssText.includes('.wbm-shell') || cssText.includes('.wbm-btn') || cssText.includes('.wbm-tabs');
    });
    for (const style of panelStyles) {
      const cssText = style.textContent ?? '';
      if (!cssText.trim()) continue;
      const signature = this.getStyleSignature(cssText);
      if (hostDoc.head.querySelector(`style[data-wbm3-style="${signature}"]`)) continue;
      const clone = hostDoc.createElement('style');
      clone.setAttribute('data-wbm3-style', signature);
      clone.textContent = cssText;
      hostDoc.head.appendChild(clone);
      this.hostStyleNodes.push(clone);
    }
  }

  open(): void {
    if (!this.ensureMounted() || !this.overlay) return;
    this.opened = true;
    this.overlay.style.display = 'flex';
    this.replayOpenAnimation();
    this.onVisibilityChange?.(true);
    this.logger.info('Vue 面板已打开');
  }

  private replayOpenAnimation(): void {
    if (!this.overlay) return;
    const shell = this.overlay.querySelector<HTMLElement>('.wbm-shell');
    if (!shell) return;
    shell.style.animation = 'none';
    // Force reflow so the same animation can be replayed every time panel opens.
    void shell.offsetWidth;
    shell.style.animation = 'wbm-panel-enter 220ms cubic-bezier(0.22, 0.8, 0.28, 1)';
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
    for (const styleNode of this.hostStyleNodes) {
      styleNode.remove();
    }
    this.hostStyleNodes = [];
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
