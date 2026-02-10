import type { BlacklistCategory } from '@prisma/client';

export interface BlacklistEntry {
  address: string;
  category: BlacklistCategory;
  riskScore: number;
  source: string;
}

export interface BlacklistJsonEntry {
  address: string;
  category: 'SCAM' | 'SANCTION' | 'MIXER' | 'EXCHANGE';
  riskScore?: number;
  source: string;
}

export interface BlacklistJsonData {
  addresses: BlacklistJsonEntry[];
}
