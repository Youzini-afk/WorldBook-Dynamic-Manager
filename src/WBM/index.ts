import { loadConfig } from './core/config';
import { Logger } from './infra/logger';
import { PatchProcessor } from './services/patch/patchProcessor';
import { WorldUpdateParser } from './services/parser/worldUpdateParser';
import { CommandRouter } from './services/router/router';
import { FloorScheduler } from './services/scheduler/scheduler';
import { TavernAiClient } from './services/review/aiClient';
import { ReviewService } from './services/review/reviewService';
import { TavernWorldbookRepository } from './services/worldbook/repository';
import { PlaceholderPanelController } from './ui/panel';

declare global {
  interface Window {
    WBM3?: {
      openUI(): void;
      closeUI(): void;
      manualReview(bookName: string, messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<void>;
    };
  }
}

export function bootstrapWbmV3(): void {
  const logger = new Logger('WBM3');
  const config = loadConfig();
  const parser = new WorldUpdateParser(logger);
  const patchProcessor = new PatchProcessor();
  const repository = new TavernWorldbookRepository(logger);
  const router = new CommandRouter(repository, patchProcessor, logger);
  const scheduler = new FloorScheduler({
    startAfter: config.startAfter,
    interval: config.interval,
    triggerTiming: config.triggerTiming,
  });
  const reviewService = new ReviewService(new TavernAiClient(logger), parser, logger);
  const panel = new PlaceholderPanelController(logger);

  repository.logBackend();
  logger.info(`scheduler initialized: nextDue@0=${scheduler.nextDue(0)}`);

  window.WBM3 = {
    openUI: () => panel.open(),
    closeUI: () => panel.close(),
    manualReview: async (bookName, messages) => {
      const commands = await reviewService.review(messages);
      const results = await router.execute(commands, bookName);
      logger.info('manual review executed', results);
    },
  };
}
