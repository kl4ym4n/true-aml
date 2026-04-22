import type { BlacklistCategory } from '@prisma/client';
import prisma from '../../config/database';

const cache = new Map<string, BlacklistCategory>();

export async function loadKnownPlatformCache(): Promise<void> {
  const platforms = await prisma.knownPlatform.findMany();
  cache.clear();
  for (const p of platforms) {
    for (const addr of p.contractAddresses) {
      cache.set(addr.toLowerCase(), p.category);
    }
    for (const addr of p.hotWalletAddresses) {
      cache.set(addr.toLowerCase(), p.category);
    }
  }
}

export function getKnownPlatformCategory(
  address: string
): BlacklistCategory | null {
  return cache.get(address.toLowerCase()) ?? null;
}

export function knownPlatformCacheSize(): number {
  return cache.size;
}
