import type { LoggerLike, WbmStatus } from '../../core/types';

export interface PanelController {
  open(): void;
  close(): void;
  refresh(): void;
  destroy(): void;
}

export interface PanelCallbacks {
  onManualReview(): Promise<void> | void;
  onApproveAll(): Promise<void> | void;
  onRejectAll(): Promise<void> | void;
}

export class DomPanelController implements PanelController {
  private container: HTMLDivElement | null = null;
  private statusLine: HTMLDivElement | null = null;
  private opened = false;

  constructor(
    private readonly logger: LoggerLike,
    private readonly getStatus: () => WbmStatus,
    private readonly callbacks: PanelCallbacks,
  ) {}

  private ensureMounted(): boolean {
    if (typeof document === 'undefined') {
      this.logger.warn('document 不可用，无法渲染面板');
      return false;
    }
    if (this.container) return true;

    const root = document.createElement('div');
    root.id = 'wbm3-panel';
    root.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#111;color:#eee;padding:12px;border:1px solid #444;border-radius:8px;font-family:monospace;min-width:320px;box-shadow:0 8px 24px rgba(0,0,0,.4);display:none;';

    const title = document.createElement('div');
    title.textContent = 'WBM v3 控制面板';
    title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:8px;';
    root.appendChild(title);

    this.statusLine = document.createElement('div');
    this.statusLine.style.cssText = 'font-size:12px;line-height:1.4;margin-bottom:10px;white-space:pre-wrap;';
    root.appendChild(this.statusLine);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    actions.appendChild(this.makeButton('手动审核', () => this.callbacks.onManualReview()));
    actions.appendChild(this.makeButton('全部通过', () => this.callbacks.onApproveAll()));
    actions.appendChild(this.makeButton('全部拒绝', () => this.callbacks.onRejectAll()));
    actions.appendChild(this.makeButton('关闭', () => this.close()));
    root.appendChild(actions);

    document.body.appendChild(root);
    this.container = root;
    return true;
  }

  private makeButton(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText =
      'background:#232323;color:#f0f0f0;border:1px solid #555;padding:6px 10px;border-radius:6px;cursor:pointer;';
    button.onclick = () => {
      Promise.resolve(onClick()).catch(error => this.logger.error(`按钮操作失败: ${label}`, error));
    };
    return button;
  }

  private renderStatus(): void {
    if (!this.statusLine) return;
    const status = this.getStatus();
    this.statusLine.textContent = [
      `目标世界书: ${status.targetBookName || '(未解析)'}`,
      `自动更新: ${status.autoEnabled ? '开启' : '关闭'}`,
      `审核模式: ${status.approvalMode}`,
      `处理状态: ${status.processing ? '处理中' : '空闲'}`,
      `待审核队列: ${status.queueSize}`,
      `下一触发楼层: ${status.nextDueFloor}`,
    ].join('\n');
  }

  open(): void {
    if (!this.ensureMounted()) return;
    if (!this.container) return;
    this.opened = true;
    this.container.style.display = 'block';
    this.renderStatus();
    this.logger.info('面板已打开');
  }

  close(): void {
    if (!this.container) return;
    this.opened = false;
    this.container.style.display = 'none';
    this.logger.info('面板已关闭');
  }

  refresh(): void {
    if (!this.opened) return;
    this.renderStatus();
  }

  destroy(): void {
    this.container?.remove();
    this.container = null;
    this.statusLine = null;
    this.opened = false;
  }
}

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
