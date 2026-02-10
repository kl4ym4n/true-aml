import type { BlacklistedAddress, BlacklistCategory } from '@prisma/client';
import prisma from '../../config/database';
import { trongridClient } from '../../lib/trongrid';

export class BlacklistService {
  /**
   * Check if an address is blacklisted
   * @param address - TRON address to check
   * @returns true if address is blacklisted, false otherwise
   */
  async isAddressBlacklisted(address: string): Promise<boolean> {
    const entry = await prisma.blacklistedAddress.findUnique({
      where: { address },
    });

    return entry !== null;
  }

  /**
   * Get blacklist entry for an address
   * @param address - TRON address to lookup
   * @returns Blacklist entry or null if not found
   */
  async getBlacklistEntry(
    address: string
  ): Promise<BlacklistedAddress | null> {
    return prisma.blacklistedAddress.findUnique({
      where: { address },
    });
  }

  /**
   * Upsert a blacklist entry (insert or update if exists)
   * @param entry - Blacklist entry data
   */
  async upsertBlacklistEntry(entry: {
    address: string;
    category: BlacklistCategory;
    riskScore: number;
    source: string;
  }): Promise<BlacklistedAddress> {
    return prisma.blacklistedAddress.upsert({
      where: { address: entry.address },
      update: {
        category: entry.category,
        riskScore: entry.riskScore,
        source: entry.source,
      },
      create: entry,
    });
  }

  /**
   * Bulk upsert blacklist entries
   * @param entries - Array of blacklist entries
   */
  async bulkUpsertBlacklistEntries(
    entries: Array<{
      address: string;
      category: BlacklistCategory;
      riskScore: number;
      source: string;
    }>
  ): Promise<number> {
    const operations = entries.map((entry) =>
      prisma.blacklistedAddress.upsert({
        where: { address: entry.address },
        update: {
          category: entry.category,
          riskScore: entry.riskScore,
          source: entry.source,
        },
        create: entry,
      })
    );

    await Promise.all(operations);
    return entries.length;
  }

  /**
   * Sync blacklist from token contract events (e.g., USDT)
   * Fetches AddedBlackList and RemovedBlackList events and updates local blacklist
   * @param contractAddress - Token contract address (e.g., USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
   * @param category - Category to assign to addresses from this source
   * @param source - Source identifier (e.g., "usdt-contract")
   */
  async syncFromTokenContract(
    contractAddress: string,
    category: BlacklistCategory = 'SANCTION',
    source: string = 'token-contract'
  ): Promise<{ added: number; removed: number }> {
    try {
      const result = await trongridClient.getTokenBlacklist(contractAddress, {
        limit: 10000, // Get up to 10k events
        only_confirmed: true,
      });

      let addedCount = 0;
      let removedCount = 0;

      // Add blacklisted addresses to database
      for (const address of result.blacklisted) {
        try {
          await this.upsertBlacklistEntry({
            address,
            category,
            riskScore: 100, // Maximum risk for contract blacklisted addresses
            source: `${source}:${contractAddress}`,
          });
          addedCount++;
        } catch (error) {
          console.error(`Failed to add blacklist entry for ${address}:`, error);
        }
      }

      // Note: We don't automatically remove addresses that were removed from contract blacklist
      // as they might still be in other blacklists. Manual review recommended.
      removedCount = result.removed.size;

      console.log(
        `✅ Synced blacklist from contract ${contractAddress}: ${addedCount} added, ${removedCount} removed from contract`
      );

      return { added: addedCount, removed: removedCount };
    } catch (error) {
      console.error(`Failed to sync blacklist from contract ${contractAddress}:`, error);
      throw error;
    }
  }

  /**
   * Check if address is blacklisted in a specific token contract
   * @param address - Address to check
   * @param contractAddress - Token contract address
   */
  async isBlacklistedInContract(
    address: string,
    contractAddress: string
  ): Promise<boolean> {
    try {
      const result = await trongridClient.getTokenBlacklist(contractAddress, {
        limit: 10000, // Need to fetch all to check
        only_confirmed: true,
      });
      return result.blacklisted.has(address);
    } catch (error) {
      console.error(`Failed to check contract blacklist for ${address}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const blacklistService = new BlacklistService();

