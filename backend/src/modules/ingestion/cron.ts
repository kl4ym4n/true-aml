import cron from 'node-cron';
import { env } from '../../config/env';
import { IngestionService } from './ingestion.service';
import { ExpansionService } from './expansion.service';

export function startIngestionCron(): void {
  if (!env.ingestion.enabled) return;

  const ingestionService = new IngestionService();
  const expansionService = new ExpansionService();

  cron.schedule(env.ingestion.cronIngestion, async () => {
    try {
      const r = await ingestionService.ingestAll({
        ofacCsvPath: env.ingestion.ofacCsvPath,
        ofacSdnZipPath: env.ingestion.ofacSdnZipPath,
        ofacSdnXmlPath: env.ingestion.ofacSdnXmlPath,
        ofacSdnXmlUrl: env.ingestion.ofacSdnXmlUrl,
        ofacSdnZipUrl: env.ingestion.ofacSdnZipUrl,
        githubSources: env.ingestion.githubSources,
        chainabuseApiKey: env.ingestion.chainabuseApiKey,
      });
      // eslint-disable-next-line no-console
      console.log('[Ingestion] Done', r);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Ingestion] Failed', e);
    }
  });

  cron.schedule(env.ingestion.cronExpansion, async () => {
    try {
      const r = await expansionService.expandOnce();
      // eslint-disable-next-line no-console
      console.log('[Expansion] Done', r);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Expansion] Failed', e);
    }
  });
}
