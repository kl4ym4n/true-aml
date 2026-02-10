import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
  databaseUrl: string;
  trongridApiKey: string;
  tronscanApiKey?: string;
  apiKey: string;
  blockchainProvider?: 'trongrid' | 'tronscan' | 'auto';
}

function validateEnv(): EnvConfig {
  const port = parseInt(process.env.PORT || '3000', 10);
  const databaseUrl = process.env.DATABASE_URL;
  const trongridApiKey = process.env.TRONGRID_API_KEY;
  const tronscanApiKey = process.env.TRONSCAN_API_KEY;
  const apiKey = process.env.API_KEY || '';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!trongridApiKey) {
    throw new Error('TRONGRID_API_KEY is required');
  }

  const blockchainProvider = (process.env.BLOCKCHAIN_PROVIDER as 'trongrid' | 'tronscan' | 'auto') || 'auto';

  return {
    port,
    databaseUrl,
    trongridApiKey,
    tronscanApiKey,
    apiKey,
    blockchainProvider,
  };
}

export const env = validateEnv();


