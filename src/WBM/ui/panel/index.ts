import type { LoggerLike } from '../../core/types';

export interface PanelController {
  open(): void;
  close(): void;
  refresh(): void;
}

export class PlaceholderPanelController implements PanelController {
  constructor(private readonly logger: LoggerLike) {}

  open(): void {
    this.logger.info('panel.open() placeholder');
  }

  close(): void {
    this.logger.info('panel.close() placeholder');
  }

  refresh(): void {
    this.logger.info('panel.refresh() placeholder');
  }
}
