import type { BlacklistCategory, EntityType } from '@prisma/client';
import prisma from '../../config/database';
import { ingestLog } from './ingestion.log';
import { loadKnownPlatformCache } from './known-platforms.cache';

function entityTypeForCategory(
  category: BlacklistCategory
): EntityType | undefined {
  if (category === 'HIGH_RISK_EXCHANGE') return 'exchange';
  if (category === 'MIXER') return 'mixer';
  return undefined;
}

export async function loadKnownPlatforms(): Promise<{
  source: string;
  upserted: number;
  skipped: number;
}> {
  const platforms = await prisma.knownPlatform.findMany();
  let upserted = 0;
  let skipped = 0;

  for (const platform of platforms) {
    const addresses = [
      ...platform.contractAddresses,
      ...platform.hotWalletAddresses,
    ];

    for (const address of addresses) {
      if (!address) continue;

      const existing = await prisma.blacklistedAddress.findUnique({
        where: { address },
        select: { isDerived: true },
      });

      // Never overwrite a stronger non-derived record
      if (existing && !existing.isDerived) {
        skipped++;
        continue;
      }

      const entityType = entityTypeForCategory(platform.category);

      await prisma.blacklistedAddress.upsert({
        where: { address },
        create: {
          address,
          category: platform.category,
          confidence: platform.confidence,
          riskScore: Math.round(platform.confidence * 100),
          source: platform.name,
          sourcesJson: [{ name: platform.name, type: platform.source }],
          isDerived: false,
          depth: 0,
          ...(entityType !== undefined ? { entityType } : {}),
        },
        update: {
          category: platform.category,
          confidence: platform.confidence,
          riskScore: Math.round(platform.confidence * 100),
          source: platform.name,
          ...(entityType !== undefined ? { entityType } : {}),
        },
      });
      upserted++;
    }
  }

  await loadKnownPlatformCache();

  ingestLog('loadKnownPlatforms: done', { upserted, skipped });
  return { source: 'known-platforms', upserted, skipped };
}
