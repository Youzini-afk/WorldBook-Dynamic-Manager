import type { LoggerLike } from '../core/types';

interface LauncherOptions {
  label: string;
  onToggle(open: boolean): void;
}

interface JQueryChainLike {
  off(...args: unknown[]): JQueryChainLike;
  on(...args: unknown[]): JQueryChainLike;
}

type JQueryLike = ((selector: unknown, context?: unknown) => JQueryChainLike) | null;

interface ToastrLike {
  success?: (message: string, title?: string) => void;
}

interface HostWindowLike extends Window {
  replaceScriptButtons?: (buttons: Array<{ name: string; visible: boolean }>) => void;
  toastr?: ToastrLike;
}

export class MagicWandLauncher {
  private readonly menuId = 'wbm3-menu-item';
  private readonly eventNamespace = '.wbm3Launcher';
  private readonly label: string;
  private readonly onToggle: (open: boolean) => void;

  private isOpen = false;
  private mountedNotified = false;
  private observer: MutationObserver | null = null;
  private retryTimer: number | null = null;
  private usingJqueryBinding = false;

  constructor(
    private readonly logger: LoggerLike,
    options: LauncherOptions,
  ) {
    this.label = options.label;
    this.onToggle = options.onToggle;
  }

  init(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.logger.warn('document 不可用，无法挂载魔法棒菜单入口');
      return;
    }

    this.disableTopScriptButtons();
    this.bindEvents();

    if (!this.ensureMenuItem()) {
      this.startRetry();
    } else {
      this.notifyMounted();
    }
    this.startObserver();
  }

  setActive(open: boolean): void {
    this.isOpen = open;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const doc = this.getHostDocument();
    const menuItem = doc.getElementById(this.menuId);
    if (!menuItem) return;
    menuItem.classList.toggle('active', open);
  }

  destroy(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const doc = this.getHostDocument();
    const jquery = this.getJQuery();

    if (this.usingJqueryBinding && jquery) {
      jquery(doc).off(this.eventNamespace);
    } else {
      doc.removeEventListener('click', this.onDocumentClick, true);
      doc.removeEventListener('keydown', this.onDocumentKeydown, true);
    }

    this.usingJqueryBinding = false;
    this.stopObserver();
    this.stopRetry();

    doc.getElementById(this.menuId)?.remove();
  }

  private getHostWindow(): HostWindowLike {
    const parent = window.parent as unknown as { document?: unknown } | null;
    if (parent && typeof parent.document !== 'undefined') {
      return window.parent as HostWindowLike;
    }
    return window as HostWindowLike;
  }

  private getHostDocument(): Document {
    const hostDoc = (this.getHostWindow() as unknown as { document?: Document }).document;
    return hostDoc ?? document;
  }

  private getJQuery(): JQueryLike {
    const hostValue = (this.getHostWindow() as unknown as { $?: unknown }).$;
    if (typeof hostValue === 'function') return hostValue as JQueryLike;
    const localValue = (window as unknown as { $?: unknown }).$;
    if (typeof localValue === 'function') return localValue as JQueryLike;
    return null;
  }

  private disableTopScriptButtons(): void {
    const host = this.getHostWindow();
    if (typeof host.replaceScriptButtons !== 'function') return;

    try {
      host.replaceScriptButtons([]);
    } catch (error) {
      this.logger.warn('replaceScriptButtons([]) 失败，已忽略', error);
    }
  }

  private createMenuItem(doc: Document): HTMLDivElement {
    const item = doc.createElement('div');
    item.id = this.menuId;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.title = this.label;
    item.tabIndex = 0;

    const icon = doc.createElement('i');
    icon.className = 'fa-solid fa-book-open';
    item.appendChild(icon);

    const text = doc.createElement('span');
    text.textContent = this.label;
    item.appendChild(text);
    return item;
  }

  private ensureMenuItem(): boolean {
    const doc = this.getHostDocument();
    const menu = doc.getElementById('extensionsMenu');
    if (!menu) return false;

    const existing = doc.getElementById(this.menuId);
    if (existing && existing.parentElement !== menu) {
      existing.remove();
    }

    if (!doc.getElementById(this.menuId)) {
      menu.appendChild(this.createMenuItem(doc));
    }
    this.setActive(this.isOpen);
    return true;
  }

  private togglePanel(): void {
    this.onToggle(!this.isOpen);
  }

  private readonly onDocumentClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(`#${this.menuId}`)) return;
    event.preventDefault();
    this.togglePanel();
  };

  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(`#${this.menuId}`)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.togglePanel();
  };

  private bindEvents(): void {
    const doc = this.getHostDocument();
    const jquery = this.getJQuery();

    if (jquery) {
      jquery(doc)
        .off(`click${this.eventNamespace}`, `#${this.menuId}`)
        .on(`click${this.eventNamespace}`, `#${this.menuId}`, (event: { preventDefault?: () => void }) => {
          event.preventDefault?.();
          this.togglePanel();
        });
      jquery(doc)
        .off(`keydown${this.eventNamespace}`, `#${this.menuId}`)
        .on(`keydown${this.eventNamespace}`, `#${this.menuId}`, (event: KeyboardEvent & { which?: number }) => {
          const key = event.key;
          const isEnter = key === 'Enter' || event.which === 13;
          const isSpace = key === ' ' || event.which === 32;
          if (!isEnter && !isSpace) return;
          event.preventDefault();
          this.togglePanel();
        });
      this.usingJqueryBinding = true;
      return;
    }

    doc.addEventListener('click', this.onDocumentClick, true);
    doc.addEventListener('keydown', this.onDocumentKeydown, true);
    this.usingJqueryBinding = false;
  }

  private startObserver(): void {
    if (this.observer || typeof MutationObserver === 'undefined') return;
    const doc = this.getHostDocument();
    const observeRoot = doc.getElementById('extensionsMenu') ?? doc.body;
    if (!observeRoot) return;

    this.observer = new MutationObserver(() => {
      if (this.ensureMenuItem()) {
        this.stopRetry();
      }
    });
    this.observer.observe(observeRoot, { childList: true, subtree: true });
  }

  private stopObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private startRetry(): void {
    if (this.retryTimer != null) return;
    const host = this.getHostWindow();
    this.retryTimer = host.setInterval(() => {
      if (!this.ensureMenuItem()) return;
      this.stopRetry();
      this.notifyMounted();
    }, 1000);
  }

  private stopRetry(): void {
    if (this.retryTimer == null) return;
    this.getHostWindow().clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  private notifyMounted(): void {
    if (this.mountedNotified) return;
    this.mountedNotified = true;
    const host = this.getHostWindow();
    const toastr = host.toastr ?? (window as HostWindowLike).toastr;
    if (typeof toastr?.success === 'function') {
      toastr.success(`${this.label}已挂载到魔法棒菜单`, 'WBM3');
      return;
    }
    this.logger.info(`${this.label}已挂载到魔法棒菜单`);
  }
}
