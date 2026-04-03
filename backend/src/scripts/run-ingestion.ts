import {
  DEFAULT_OFAC_SDN_ENHANCED_ZIP_URL,
  IngestionService,
} from '../modules/ingestion';
import dotenv from 'dotenv';
import path from 'node:path';
import { ingestLog, maskDatabaseUrl } from '../modules/ingestion/ingestion.log';

async function main(): Promise<void> {
  const t0 = Date.now();
  dotenv.config();
  if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is missing. Put it in repo-root .env or backend/.env, or run from a directory where .env is visible.'
    );
  }

  ingestLog('run-ingestion: starting', {
    cwd: process.cwd(),
    databaseUrl: maskDatabaseUrl(process.env.DATABASE_URL),
  });

  const ingestionService = new IngestionService();

  const ofacSdnZipPath = process.env.OFAC_SDN_ZIP_PATH?.trim();
  const ofacSdnXmlPath = process.env.OFAC_SDN_XML_PATH?.trim();
  const ofacUseOfficialSdn = process.env.OFAC_USE_OFFICIAL_SDN === 'true';
  const ofacSdnZipUrl =
    ofacSdnZipPath || ofacSdnXmlPath
      ? undefined
      : process.env.OFAC_SDN_ZIP_URL?.trim() ||
        (ofacUseOfficialSdn ? DEFAULT_OFAC_SDN_ENHANCED_ZIP_URL : undefined);
  const ofacSdnXmlUrl =
    ofacSdnZipPath || ofacSdnZipUrl || ofacSdnXmlPath
      ? undefined
      : process.env.OFAC_SDN_XML_URL?.trim() || undefined;

  try {
    const result = await ingestionService.ingestAll({
      ofacCsvPath: process.env.OFAC_CSV_PATH,
      ofacSdnZipPath,
      ofacSdnXmlPath,
      ofacSdnXmlUrl,
      ofacSdnZipUrl,
      githubSources: (process.env.GITHUB_BLACKLIST_SOURCES || '')
        .split(';')
        .map(s => s.trim())
        .filter(Boolean),
      chainabuseApiKey: process.env.CHAINABUSE_API_KEY,
    });

    ingestLog('run-ingestion: success', {
      ms: Date.now() - t0,
      upserted: result.upserted,
      skipped: result.skipped,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ingestLog('run-ingestion: FAILED', { ms: Date.now() - t0, error: msg });
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
}

main().catch(e => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
