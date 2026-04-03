import type { BlacklistedAddress, Prisma } from '@prisma/client';

/**
 * Structured AML source provenance (replaces silent truncation of a single `source` string).
 */
export type SourceProvenanceEntry = {
  name: string;
  type: string;
  firstSeenAt: string;
  confidenceContribution?: number;
  derivedFromRoot?: string;
};

function provenanceKey(e: SourceProvenanceEntry): string {
  return `${e.type}:${e.name}`;
}

function parseEntry(x: unknown): SourceProvenanceEntry | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : null;
  const type = typeof o.type === 'string' ? o.type : 'unknown';
  const firstSeenAt =
    typeof o.firstSeenAt === 'string'
      ? o.firstSeenAt
      : new Date().toISOString();
  if (!name) return null;
  return {
    name,
    type,
    firstSeenAt,
    confidenceContribution:
      typeof o.confidenceContribution === 'number'
        ? o.confidenceContribution
        : undefined,
    derivedFromRoot:
      typeof o.derivedFromRoot === 'string' ? o.derivedFromRoot : undefined,
  };
}

export function provenanceEntriesFromJson(
  v: Prisma.JsonValue | null | undefined
): SourceProvenanceEntry[] {
  return normalizeProvenanceArray(v);
}

function normalizeProvenanceArray(
  v: Prisma.JsonValue | null | undefined
): SourceProvenanceEntry[] {
  if (v == null) return [];
  if (!Array.isArray(v)) return [];
  const out: SourceProvenanceEntry[] = [];
  for (const item of v) {
    const e = parseEntry(item);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Merges provenance arrays; de-duplicates by `type:name`, keeps earliest firstSeenAt, max confidence.
 */
export function mergeSourceProvenance(
  existing: Prisma.JsonValue | null | undefined,
  incoming: SourceProvenanceEntry[]
): Prisma.InputJsonValue {
  const byKey = new Map<string, SourceProvenanceEntry>();
  for (const e of normalizeProvenanceArray(existing)) {
    byKey.set(provenanceKey(e), e);
  }
  for (const e of incoming) {
    const k = provenanceKey(e);
    const cur = byKey.get(k);
    if (!cur) {
      byKey.set(k, e);
      continue;
    }
    byKey.set(k, {
      ...cur,
      ...e,
      firstSeenAt:
        e.firstSeenAt < cur.firstSeenAt ? e.firstSeenAt : cur.firstSeenAt,
      confidenceContribution: Math.max(
        cur.confidenceContribution ?? 0,
        e.confidenceContribution ?? 0
      ),
    });
  }
  return Array.from(byKey.values());
}

export function legacyRowToProvenance(
  row: Pick<BlacklistedAddress, 'source' | 'createdAt' | 'confidence'>
): SourceProvenanceEntry[] {
  if (!row.source.trim()) return [];
  return [
    {
      name: row.source,
      type: 'legacy',
      firstSeenAt: row.createdAt.toISOString(),
      confidenceContribution: row.confidence ?? undefined,
    },
  ];
}

export function sourcesSummary(entries: SourceProvenanceEntry[]): string {
  return [...new Set(entries.map(e => e.name))].join('; ');
}

export function ingestSourceNamesToProvenance(
  sources: string[],
  confidenceContribution: number,
  defaultType: string
): SourceProvenanceEntry[] {
  const now = new Date().toISOString();
  return sources.map(name => ({
    name,
    type: inferIngestType(name, defaultType),
    firstSeenAt: now,
    confidenceContribution,
  }));
}

function inferIngestType(name: string, fallback: string): string {
  const n = name.toLowerCase();
  if (n.includes('ofac') || n.includes('sdn')) return 'ofac';
  if (n.includes('github')) return 'github';
  if (n.includes('chainabuse')) return 'chainabuse';
  return fallback;
}

export function derivedProvenanceEntry(input: {
  rootAddress: string;
  rootSource: string;
  confidenceContribution: number;
}): SourceProvenanceEntry {
  return {
    name: `derived:${input.rootSource}→${input.rootAddress}`,
    type: 'derived',
    firstSeenAt: new Date().toISOString(),
    confidenceContribution: input.confidenceContribution,
    derivedFromRoot: input.rootAddress,
  };
}
