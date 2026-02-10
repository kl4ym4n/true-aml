// Risk score thresholds
export const RISK_SCORE_BLACKLISTED = 100;

// Risk calculation weights (from formula: risk = direct * 0.7 + indirect * 0.4 + behavior * 0.2 - trust * 0.3)
export const DIRECT_RISK_WEIGHT = 0.7;
export const INDIRECT_RISK_WEIGHT = 0.4;
export const BEHAVIOR_RISK_WEIGHT = 0.2;
export const TRUST_FACTORS_WEIGHT = 0.3;

// Direct risk factors (strongest) - Прямые (самые сильные)
export const DIRECT_RISK_SCAM_MIXER = 60; // Direct input from scam/mixer
export const DIRECT_RISK_BLACKLISTED = 80; // Received from blacklisted entity
// Note: DIRECT_RISK_SANCTIONED = 90 (requires sanctioned entity data source)

// Indirect risk factors (via 1-2 hops) - Косвенные (через 1-2 хопа)
export const INDIRECT_RISK_1_HOP_MIXER = 40; // 1 hop from mixer
export const INDIRECT_RISK_2_HOPS_SCAM = 25; // 2 hops from scam
// Note: INDIRECT_RISK_3_HOPS_HIGH_RISK = 15 (requires transaction graph analysis)

// Behavioral risk factors - Поведенческие (очень важны)
export const BEHAVIOR_RISK_SMURFING = 15; // Frequent small inputs (smurfing)
export const BEHAVIOR_RISK_FAST_WITHDRAWAL = 10; // Fast withdrawal after input
export const BEHAVIOR_RISK_NO_CEX = 10; // No interaction with CEX

// Trust factors (reduce risk) - Понижающие риск
export const TRUST_FACTOR_LONG_HISTORY = 15; // Долгая история
export const TRUST_FACTOR_FEW_TX = 10; // Мало транзакций
// Note: TRUST_FACTOR_LARGE_CEX = 25 (requires CEX address list)

// Severity mapping (0-1 scale to 0-100)
export const SEVERITY_BLACKLISTED = 90; // 0.9-1.0
export const SEVERITY_PHISHING = 80; // 0.8
export const SEVERITY_SCAM = 70; // 0.7
export const SEVERITY_SUSPICIOUS = 45; // 0.4-0.5

// Thresholds for flags
export const NEW_ADDRESS_DAYS_THRESHOLD = 30; // Address is "new" if less than 30 days old
export const LOW_ACTIVITY_TX_THRESHOLD = 5; // Low activity if less than 5 transactions
export const LONG_HISTORY_DAYS = 365; // Long history = more than 1 year

// Known TRON DeFi liquidity pool addresses (smart contracts)
// These are addresses of DEX routers and liquidity pools that are commonly used
// Note: This list should be maintained and updated regularly
// Sources: JustSwap, SunSwap, PoloniDEX and other major TRON DEXes
export const KNOWN_LIQUIDITY_POOLS = new Set<string>(
  [
    // JustSwap (JustLend) - Main DEX on TRON
    'TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', // JustSwap Router V1
    'TQn9Y2khEsLMWoMTR9xyn1fUm2S3Ek8v07', // JustSwap Factory
    // SunSwap (Sun.io) - Another major DEX
    'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S', // SunSwap Factory
    'TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', // SunSwap Router (may overlap)
    // PoloniDEX
    'TQn9Y2khEsLMWoMTR9xyn1fUm2S3Ek8v07', // PoloniDEX Router
    // Add more DEX router addresses as discovered
    // TODO: Consider fetching this list dynamically from a trusted source
  ]
);
