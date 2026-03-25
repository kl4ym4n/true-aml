import type { PrismaClient } from '@prisma/client';

/**
 * Update or create address profile in database.
 * Only updates firstSeenAt if new value is earlier than existing.
 */
export async function updateAddressProfile(
  prisma: PrismaClient,
  address: string,
  firstSeenAt: Date | null,
  txCount: number
): Promise<void> {
  const now = new Date();

  const existing = await prisma.addressProfile.findUnique({
    where: { address },
  });

  const updateData: {
    txCount: number;
    lastCheckedAt: Date;
    firstSeenAt?: Date;
  } = {
    txCount,
    lastCheckedAt: now,
  };

  if (firstSeenAt) {
    if (!existing || firstSeenAt < existing.firstSeenAt) {
      updateData.firstSeenAt = firstSeenAt;
    }
  }

  await prisma.addressProfile.upsert({
    where: { address },
    update: updateData,
    create: {
      address,
      firstSeenAt: firstSeenAt || now,
      txCount,
      lastCheckedAt: now,
    },
  });
}
