import { readFileSync } from 'fs';
import { join } from 'path';
import type { BlacklistCategory } from '@prisma/client';
import { blacklistService } from './blacklist.service';
import {
  BlacklistJsonData,
  BlacklistJsonEntry,
  BlacklistEntry,
} from './blacklist.types';

/**
 * Load blacklisted addresses from JSON file
 * @param filePath - Path to JSON file (relative to project root or absolute)
 * @returns Number of addresses loaded
 */
export async function loadBlacklistFromFile(
  filePath: string = 'data/blacklist.json'
): Promise<number> {
  try {
    // Resolve file path (try relative to project root first, then absolute)
    const resolvedPath = filePath.startsWith('/')
      ? filePath
      : join(process.cwd(), filePath);

    // Read and parse JSON file
    const fileContent = readFileSync(resolvedPath, 'utf-8');
    const jsonData: BlacklistJsonData = JSON.parse(fileContent);

    if (!jsonData.addresses || !Array.isArray(jsonData.addresses)) {
      throw new Error('Invalid JSON structure: expected "addresses" array');
    }

    // Validate and transform entries
    const entries: BlacklistEntry[] = jsonData.addresses.map(entry => {
      validateBlacklistEntry(entry);
      return {
        address: entry.address,
        category: entry.category as BlacklistCategory,
        riskScore: entry.riskScore ?? 0,
        source: entry.source,
      };
    });

    // Remove duplicates by address (keep first occurrence)
    const uniqueEntries = Array.from(
      new Map(entries.map(entry => [entry.address, entry])).values()
    );

    // Bulk upsert to database
    const count =
      await blacklistService.bulkUpsertBlacklistEntries(uniqueEntries);

    console.log(
      `✅ Loaded ${count} blacklist entries from ${filePath} (${jsonData.addresses.length - count} duplicates skipped)`
    );

    return count;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        console.warn(
          `⚠️  Blacklist file not found: ${filePath}. Skipping blacklist load.`
        );
        return 0;
      }
      throw new Error(`Failed to load blacklist: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate a blacklist entry from JSON
 */
function validateBlacklistEntry(entry: BlacklistJsonEntry): void {
  if (!entry.address || typeof entry.address !== 'string') {
    throw new Error('Invalid entry: address is required and must be a string');
  }

  if (entry.address.length !== 42 || !entry.address.startsWith('T')) {
    throw new Error(
      `Invalid TRON address format: ${entry.address} (expected 42 characters starting with 'T')`
    );
  }

  const validCategories: BlacklistCategory[] = [
    'SCAM',
    'SANCTION',
    'STOLEN_FUNDS',
    'RANSOM',
    'DARK_MARKET',
    'MIXER',
    'EXCHANGE',
    'PHISHING',
    'SUSPICIOUS',
  ];
  if (
    !entry.category ||
    !validCategories.includes(entry.category as BlacklistCategory)
  ) {
    throw new Error(
      `Invalid category: ${entry.category}. Must be one of: ${validCategories.join(', ')}`
    );
  }

  if (!entry.source || typeof entry.source !== 'string') {
    throw new Error('Invalid entry: source is required and must be a string');
  }

  if (entry.riskScore !== undefined) {
    if (typeof entry.riskScore !== 'number' || entry.riskScore < 0) {
      throw new Error('Invalid riskScore: must be a non-negative number');
    }
  }
}

/**
 * Initialize blacklist from file at startup
 * @param filePath - Optional path to blacklist JSON file
 */
export async function initializeBlacklist(filePath?: string): Promise<void> {
  try {
    await loadBlacklistFromFile(filePath);
  } catch (error) {
    console.error('❌ Failed to initialize blacklist:', error);
    // Don't throw - allow server to start even if blacklist fails to load
  }
}
