import type { LoggerLike } from '../../core/types';

export interface PanelController {
  open(): void;
  close(): void;
  refresh(): void;
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
}
