import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Load `.env` from repo root and `backend/` even when `cwd` is only `backend/`
 * (default `dotenv.config()` only reads `process.cwd()/.env`).
 * First existing file wins per key (dotenv does not overwrite `process.env`).
 */
const envFileCandidates = [
  path.join(__dirname, '..', '..', '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
];
for (const p of envFileCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

interface EnvConfig {
  port: number;
  databaseUrl: string;
  trongridApiKey: string;
  tronscanApiKey?: string;
  apiKey: string;
  blockchainProvider?: 'trongrid' | 'tronscan' | 'auto';
  ingestion: {
    enabled: boolean;
    ofacCsvPath?: string;
    /** Local SDN_ENHANCED.ZIP; skips HTTP download (use if OFAC host times out). */
    ofacSdnZipPath?: string;
    /** Local SDN_ENHANCED.XML file; skips HTTP when set. */
    ofacSdnXmlPath?: string;
    /** Direct SDN_ENHANCED.XML URL (large). Used only when no ZIP URL is set. */
    ofacSdnXmlUrl?: string;
    /** SDN_ENHANCED.ZIP URL; defaults when OFAC_USE_OFFICIAL_SDN=true. Takes priority over XML. */
    ofacSdnZipUrl?: string;
    chainabuseApiKey?: string;
    githubSources: string[];
    cronIngestion: string;
    cronExpansion: string;
  };
  /** Optional graph crawler (TRON); additive to ingestion/expansion. */
  crawler: {
    enabled: boolean;
    batchSize: number;
    concurrency: number;
    maxHop: number;
    directRecrawlHours: number;
    derivedRecrawlHours: number;
    lowConfidenceRecrawlHours: number;
    promotionThreshold: number;
    minPromotionVolume: number;
    minEdgeVolume: number;
    minEdgeShare: number;
    cronCrawler: string;
    enqueueAfterIngestion: boolean;
    enqueueFromExpansion: boolean;
    failureBackoffBaseMinutes: number;
    failureBackoffMaxMinutes: number;
    staleLockMinutes: number;
  };
}

function validateEnv(): EnvConfig {
  const port = parseInt(process.env.PORT || '3000', 10);
  const databaseUrl = process.env.DATABASE_URL;
  const trongridApiKey = process.env.TRONGRID_API_KEY;
  const tronscanApiKey = process.env.TRONSCAN_API_KEY;
  const apiKey = process.env.API_KEY || '';
  const ingestionEnabled = (process.env.INGESTION_ENABLED || 'true') === 'true';
  const ofacCsvPath = process.env.OFAC_CSV_PATH;
  const ofacSdnZipPath = process.env.OFAC_SDN_ZIP_PATH?.trim();
  const ofacSdnXmlPath = process.env.OFAC_SDN_XML_PATH?.trim();
  const ofacUseOfficialSdn = process.env.OFAC_USE_OFFICIAL_SDN === 'true';
  const defaultOfacSdnZipUrl =
    'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ENHANCED.ZIP';
  const ofacSdnZipUrl =
    ofacSdnZipPath || ofacSdnXmlPath
      ? undefined
      : process.env.OFAC_SDN_ZIP_URL?.trim() ||
        (ofacUseOfficialSdn ? defaultOfacSdnZipUrl : undefined);
  const ofacSdnXmlUrl =
    ofacSdnZipPath || ofacSdnZipUrl || ofacSdnXmlPath
      ? undefined
      : process.env.OFAC_SDN_XML_URL?.trim() || undefined;
  const chainabuseApiKey = process.env.CHAINABUSE_API_KEY;
  const githubSources = (process.env.GITHUB_BLACKLIST_SOURCES || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  const cronIngestion = process.env.INGESTION_CRON || '0 3 * * *';
  const cronExpansion = process.env.EXPANSION_CRON || '0 */4 * * *';

  const crawlerEnabled = (process.env.CRAWLER_ENABLED || 'false') === 'true';
  const crawlerBatchSize = parseInt(
    process.env.CRAWLER_BATCH_SIZE || '100',
    10
  );
  const crawlerConcurrency = parseInt(
    process.env.CRAWLER_CONCURRENCY || '4',
    10
  );
  const crawlerMaxHop = parseInt(process.env.CRAWLER_MAX_HOP || '2', 10);
  const crawlerDirectRecrawlHours = parseInt(
    process.env.CRAWLER_DIRECT_RECRAWL_HOURS || '6',
    10
  );
  const crawlerDerivedRecrawlHours = parseInt(
    process.env.CRAWLER_DERIVED_RECRAWL_HOURS || '24',
    10
  );
  const crawlerLowConfidenceRecrawlHours = parseInt(
    process.env.CRAWLER_LOW_CONFIDENCE_RECRAWL_HOURS || '48',
    10
  );
  const crawlerPromotionThreshold = parseFloat(
    process.env.CRAWLER_PROMOTION_THRESHOLD || '0.35'
  );
  const crawlerMinPromotionVolume = parseFloat(
    process.env.CRAWLER_MIN_PROMOTION_VOLUME || '50'
  );
  const crawlerMinEdgeVolume = parseFloat(
    process.env.CRAWLER_MIN_EDGE_VOLUME || '50'
  );
  const crawlerMinEdgeShare = parseFloat(
    process.env.CRAWLER_MIN_EDGE_SHARE || '0.03'
  );
  const cronCrawler = process.env.CRAWLER_CRON || '*/30 * * * *';
  const crawlerEnqueueAfterIngestion =
    (process.env.CRAWLER_ENQUEUE_AFTER_INGESTION || 'true') === 'true';
  const crawlerEnqueueFromExpansion =
    (process.env.CRAWLER_ENQUEUE_FROM_EXPANSION || 'false') === 'true';
  const crawlerFailureBackoffBase = parseInt(
    process.env.CRAWLER_FAILURE_BACKOFF_BASE_MINUTES || '15',
    10
  );
  const crawlerFailureBackoffMax = parseInt(
    process.env.CRAWLER_FAILURE_BACKOFF_MAX_MINUTES || '720',
    10
  );
  const crawlerStaleLockMinutes = parseInt(
    process.env.CRAWLER_STALE_LOCK_MINUTES || '30',
    10
  );

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!trongridApiKey) {
    throw new Error('TRONGRID_API_KEY is required');
  }

  const blockchainProvider =
    (process.env.BLOCKCHAIN_PROVIDER as 'trongrid' | 'tronscan' | 'auto') ||
    'auto';

  return {
    port,
    databaseUrl,
    trongridApiKey,
    tronscanApiKey,
    apiKey,
    blockchainProvider,
    ingestion: {
      enabled: ingestionEnabled,
      ofacCsvPath,
      ofacSdnZipPath,
      ofacSdnXmlPath,
      ofacSdnXmlUrl,
      ofacSdnZipUrl,
      chainabuseApiKey,
      githubSources,
      cronIngestion,
      cronExpansion,
    },
    crawler: {
      enabled: crawlerEnabled,
      batchSize: Math.max(1, crawlerBatchSize),
      concurrency: Math.max(1, crawlerConcurrency),
      maxHop: Math.max(0, crawlerMaxHop),
      directRecrawlHours: Math.max(1, crawlerDirectRecrawlHours),
      derivedRecrawlHours: Math.max(1, crawlerDerivedRecrawlHours),
      lowConfidenceRecrawlHours: Math.max(
        crawlerDerivedRecrawlHours,
        crawlerLowConfidenceRecrawlHours
      ),
      promotionThreshold: Math.min(1, Math.max(0, crawlerPromotionThreshold)),
      minPromotionVolume: Math.max(0, crawlerMinPromotionVolume),
      minEdgeVolume: Math.max(0, crawlerMinEdgeVolume),
      minEdgeShare: Math.min(1, Math.max(0, crawlerMinEdgeShare)),
      cronCrawler,
      enqueueAfterIngestion: crawlerEnqueueAfterIngestion,
      enqueueFromExpansion: crawlerEnqueueFromExpansion,
      failureBackoffBaseMinutes: Math.max(1, crawlerFailureBackoffBase),
      failureBackoffMaxMinutes: Math.max(
        crawlerFailureBackoffBase,
        crawlerFailureBackoffMax
      ),
      staleLockMinutes: Math.max(5, crawlerStaleLockMinutes),
    },
  };
}

export const env = validateEnv();
