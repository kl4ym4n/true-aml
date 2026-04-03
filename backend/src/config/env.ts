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
  };
}

export const env = validateEnv();
