import type { PrismaClient } from '@prisma/client';
import { getStrongWhitelistAddressList } from './whitelist';

const DEFAULT_CHAIN = 'tron';

/**
 * Addresses in `candidates` that appear on an {@link AddressEdge} with a strong-whitelist CEX
 * (either direction: root↔counterparty).
 */
export async function findAddressesGraphLinkedToStrongWhitelist(
  prisma: PrismaClient,
  candidates: string[],
  chain: string = DEFAULT_CHAIN
): Promise<Set<string>> {
  const wl = getStrongWhitelistAddressList();
  const out = new Set<string>();
  if (candidates.length === 0 || wl.length === 0) {
    return out;
  }
  const candSet = new Set(candidates);

  try {
    const edges = await prisma.addressEdge.findMany({
      where: {
        chain,
        OR: [
          {
            AND: [
              { rootAddress: { in: wl } },
              { counterpartyAddress: { in: candidates } },
            ],
          },
          {
            AND: [
              { rootAddress: { in: candidates } },
              { counterpartyAddress: { in: wl } },
            ],
          },
        ],
      },
      select: { rootAddress: true, counterpartyAddress: true },
    });

    const wlSet = new Set(wl);
    for (const e of edges) {
      if (wlSet.has(e.rootAddress) && candSet.has(e.counterpartyAddress)) {
        out.add(e.counterpartyAddress);
      }
      if (wlSet.has(e.counterpartyAddress) && candSet.has(e.rootAddress)) {
        out.add(e.rootAddress);
      }
    }
  } catch {
    /* DB optional in some deployments */
  }

  return out;
}

/**
 * CandidateSignal rows that look like exchange / payment infra (graph crawler promotion path).
 */
export async function findAddressesCandidateExchangeInfra(
  prisma: PrismaClient,
  candidates: string[],
  chain: string = DEFAULT_CHAIN
): Promise<Set<string>> {
  const out = new Set<string>();
  if (candidates.length === 0) return out;

  try {
    const rows = await prisma.candidateSignal.findMany({
      where: {
        chain,
        address: { in: candidates },
        OR: [
          { entityType: 'exchange' },
          { entityType: 'payment_processor' },
          {
            AND: [
              { isInfrastructure: true },
              { entityType: { in: ['exchange', 'payment_processor'] } },
            ],
          },
        ],
      },
      select: { address: true },
    });
    for (const r of rows) {
      out.add(r.address);
    }
  } catch {
    /* optional */
  }

  return out;
}
