import axios from 'axios';

const API_BASE_URL =
  process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY;

interface BlacklistedAddress {
  address: string;
  category: string;
  reason: string;
  addedAt: string;
}

interface TransactionCheck {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  tokenAddress: string;
  tokenSymbol: string;
  timestamp: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// Sample blacklisted addresses with various categories
const blacklistedAddresses: BlacklistedAddress[] = [
  {
    address: 'TQn9Y2khEsLMWDm1F8Z5ArP3KvZ1hJ2xXx',
    category: 'SANCTIONS',
    reason: 'OFAC Specially Designated Nationals (SDN)',
    addedAt: new Date('2023-01-15').toISOString(),
  },
  {
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    category: 'SANCTIONS',
    reason: 'EU Sanctions List',
    addedAt: new Date('2023-02-20').toISOString(),
  },
  {
    address: 'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt',
    category: 'MIXER',
    reason: 'Known cryptocurrency mixer service',
    addedAt: new Date('2023-03-10').toISOString(),
  },
  {
    address: 'TXYZabcdefghijklmnopqrstuvwxyz123456',
    category: 'SCAM',
    reason: 'Phishing and fraud operations',
    addedAt: new Date('2023-04-05').toISOString(),
  },
  {
    address: 'TScam123456789012345678901234567890',
    category: 'SCAM',
    reason: 'Ponzi scheme operator',
    addedAt: new Date('2023-05-12').toISOString(),
  },
  {
    address: 'TDarknet123456789012345678901234567',
    category: 'DARKNET',
    reason: 'Darknet marketplace operations',
    addedAt: new Date('2023-06-18').toISOString(),
  },
  {
    address: 'TRansom1234567890123456789012345678',
    category: 'RANSOMWARE',
    reason: 'Ransomware payment address',
    addedAt: new Date('2023-07-22').toISOString(),
  },
  {
    address: 'TTheft12345678901234567890123456789',
    category: 'THEFT',
    reason: 'Stolen funds recipient',
    addedAt: new Date('2023-08-30').toISOString(),
  },
  {
    address: 'TLaunder123456789012345678901234567',
    category: 'MONEY_LAUNDERING',
    reason: 'Money laundering operation',
    addedAt: new Date('2023-09-14').toISOString(),
  },
  {
    address: 'TTerror1234567890123456789012345678',
    category: 'TERRORISM',
    reason: 'Terrorism financing',
    addedAt: new Date('2023-10-01').toISOString(),
  },
];

// Sample transaction checks with various risk levels
const transactionChecks: TransactionCheck[] = [
  {
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    from: 'TQn9Y2khEsLMWDm1F8Z5ArP3KvZ1hJ2xXx', // Blacklisted
    to: 'TNormal123456789012345678901234567890',
    amount: '1000000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-15T10:30:00Z').toISOString(),
    riskScore: 95,
    riskLevel: 'CRITICAL',
  },
  {
    txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    from: 'TNormal123456789012345678901234567890',
    to: 'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt', // Blacklisted mixer
    amount: '500000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-16T14:20:00Z').toISOString(),
    riskScore: 85,
    riskLevel: 'CRITICAL',
  },
  {
    txHash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
    from: 'TSuspicious1234567890123456789012345',
    to: 'TNormal123456789012345678901234567890',
    amount: '250000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-17T09:15:00Z').toISOString(),
    riskScore: 65,
    riskLevel: 'HIGH',
  },
  {
    txHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
    from: 'TNormal123456789012345678901234567890',
    to: 'TNormal987654321098765432109876543210',
    amount: '10000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-18T16:45:00Z').toISOString(),
    riskScore: 15,
    riskLevel: 'LOW',
  },
  {
    txHash: '0x5555555555555555555555555555555555555555555555555555555555555555',
    from: 'TXYZabcdefghijklmnopqrstuvwxyz123456', // Blacklisted scam
    to: 'TNormal123456789012345678901234567890',
    amount: '750000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-19T11:30:00Z').toISOString(),
    riskScore: 90,
    riskLevel: 'CRITICAL',
  },
  {
    txHash: '0x6666666666666666666666666666666666666666666666666666666666666666',
    from: 'TMediumRisk123456789012345678901234',
    to: 'TMediumRisk987654321098765432109876',
    amount: '50000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-20T13:20:00Z').toISOString(),
    riskScore: 45,
    riskLevel: 'MEDIUM',
  },
  {
    txHash: '0x7777777777777777777777777777777777777777777777777777777777777777',
    from: 'TDarknet123456789012345678901234567', // Blacklisted darknet
    to: 'TNormal123456789012345678901234567890',
    amount: '2000000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-21T08:00:00Z').toISOString(),
    riskScore: 88,
    riskLevel: 'CRITICAL',
  },
  {
    txHash: '0x8888888888888888888888888888888888888888888888888888888888888888',
    from: 'TNormal123456789012345678901234567890',
    to: 'TNormal987654321098765432109876543210',
    amount: '5000',
    tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tokenSymbol: 'USDT',
    timestamp: new Date('2024-01-22T15:30:00Z').toISOString(),
    riskScore: 5,
    riskLevel: 'LOW',
  },
];

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY && { 'X-API-Key': API_KEY }),
  },
});

async function seedBlacklistedAddresses() {
  console.log('🌱 Seeding blacklisted addresses...');
  
  const endpoint = '/api/v1/admin/blacklist';
  let successCount = 0;
  let errorCount = 0;

  for (const address of blacklistedAddresses) {
    try {
      await apiClient.post(endpoint, address);
      console.log(`  ✓ Added blacklisted address: ${address.address} (${address.category})`);
      successCount++;
    } catch (error: any) {
      if (error.response?.status === 409 || error.response?.status === 400) {
        console.log(`  ⚠ Address already exists or invalid: ${address.address}`);
      } else {
        console.error(`  ✗ Failed to add ${address.address}:`, error.message);
        errorCount++;
      }
    }
  }

  console.log(`\n✅ Blacklisted addresses: ${successCount} added, ${errorCount} errors\n`);
  return { successCount, errorCount };
}

async function seedTransactionChecks() {
  console.log('🌱 Seeding transaction checks...');
  
  const endpoint = '/api/v1/admin/transactions';
  let successCount = 0;
  let errorCount = 0;

  for (const transaction of transactionChecks) {
    try {
      await apiClient.post(endpoint, transaction);
      console.log(`  ✓ Added transaction: ${transaction.txHash.substring(0, 16)}... (${transaction.riskLevel})`);
      successCount++;
    } catch (error: any) {
      if (error.response?.status === 409 || error.response?.status === 400) {
        console.log(`  ⚠ Transaction already exists or invalid: ${transaction.txHash.substring(0, 16)}...`);
      } else {
        console.error(`  ✗ Failed to add transaction ${transaction.txHash.substring(0, 16)}...:`, error.message);
        errorCount++;
      }
    }
  }

  console.log(`\n✅ Transaction checks: ${successCount} added, ${errorCount} errors\n`);
  return { successCount, errorCount };
}

async function seedDatabase() {
  console.log('🚀 Starting database seed...\n');
  console.log(`📡 API Base URL: ${API_BASE_URL}`);
  console.log(`🔑 API Key: ${API_KEY ? '***' + API_KEY.slice(-4) : 'Not provided'}\n`);

  try {
    // Test API connection
    await apiClient.get('/api/v1/health').catch(() => {
      console.log('⚠️  Health check endpoint not available, continuing...\n');
    });

    const blacklistResults = await seedBlacklistedAddresses();
    const transactionResults = await seedTransactionChecks();

    console.log('📊 Seed Summary:');
    console.log(`   Blacklisted addresses: ${blacklistResults.successCount} added`);
    console.log(`   Transaction checks: ${transactionResults.successCount} added`);
    console.log('\n✨ Seed completed!\n');
  } catch (error: any) {
    console.error('\n❌ Seed failed:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    process.exit(1);
  }
}

// Run seed if executed directly
if (require.main === module) {
  seedDatabase().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { seedDatabase, blacklistedAddresses, transactionChecks };

