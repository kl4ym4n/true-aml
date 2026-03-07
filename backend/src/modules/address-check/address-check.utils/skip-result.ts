/** Skip-result for max hops or already visited address. */
export function createSkipResult(address: string): {
  riskScore: number;
  flags: never[];
  metadata: {
    address: string;
    isBlacklisted: boolean;
    transactionCount: number;
    firstSeenAt: null;
    addressAgeDays: null;
    lastCheckedAt: Date;
  };
} {
  return {
    riskScore: 0,
    flags: [],
    metadata: {
      address,
      isBlacklisted: false,
      transactionCount: 0,
      firstSeenAt: null,
      addressAgeDays: null,
      lastCheckedAt: new Date(),
    },
  };
}
