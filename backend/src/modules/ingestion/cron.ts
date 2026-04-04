import cron from 'node-cron';
import { env } from '../../config/env';
import { IngestionService } from './ingestion.service';
import { ExpansionService } from './expansion.service';
import { GraphCrawlerService } from './graph-crawler.service';

/** In-process overlap guards (single replica). TODO: Redis/Postgres advisory lock for multi-instance. */
let ingestionCronRunning = false;
let expansionCronRunning = false;
let crawlerCronRunning = false;

export function startIngestionCron(): void {
  if (env.ingestion.enabled) {
    const ingestionService = new IngestionService();
    const expansionService = new ExpansionService();

    cron.schedule(env.ingestion.cronIngestion, async () => {
      if (ingestionCronRunning) {
        // eslint-disable-next-line no-console
        console.warn(
          '[Ingestion] Skipped scheduled run: previous ingestion still in progress'
        );
        return;
      }
      ingestionCronRunning = true;
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
      } finally {
        ingestionCronRunning = false;
      }
    });

    cron.schedule(env.ingestion.cronExpansion, async () => {
      if (expansionCronRunning) {
        // eslint-disable-next-line no-console
        console.warn(
          '[Expansion] Skipped scheduled run: previous expansion still in progress'
        );
        return;
      }
      expansionCronRunning = true;
      try {
        const r = await expansionService.expandOnce();
        // eslint-disable-next-line no-console
        console.log('[Expansion] Done', r);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[Expansion] Failed', e);
      } finally {
        expansionCronRunning = false;
      }
    });
  }

  if (env.crawler.enabled) {
    const graphCrawler = new GraphCrawlerService();
    cron.schedule(env.crawler.cronCrawler, async () => {
      if (crawlerCronRunning) {
        // eslint-disable-next-line no-console
        console.warn(
          '[GraphCrawler] Skipped scheduled run: previous batch still in progress'
        );
        return;
      }
      crawlerCronRunning = true;
      try {
        const r = await graphCrawler.runBatch();
        // eslint-disable-next-line no-console
        console.log('[GraphCrawler] Done', r);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[GraphCrawler] Failed', e);
      } finally {
        crawlerCronRunning = false;
      }
    });
  }
}
