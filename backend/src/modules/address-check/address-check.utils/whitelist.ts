export type WhitelistLevel = 'strong' | 'soft';

// Strong whitelist: treat as trusted (riskScore = 0)
const STRONG_WHITELIST = new Set<string>([
  // BYBIT
  'TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa',
  // Binance HOT
  'TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G',
  'TQrY8tryqsYVCYS3MFbtffiPp2ccyn4STm',
  'TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf',
  'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS',
  'TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe',
  'TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr',
  'TK4ykR48cQQoyFcZ5N4xZCbsBaHcg6n3gJ',
  'TJqwA7SoZnERE4zW5uDEiPkbz4B66h9TFj',
  'TJ5usJLLwjwn7Pw3TPbdzreG7dvgKzfQ5y', // Binance-Hot 9
  // MXC
  'TEPSrSYPDSQ7yXpMFPq91Fb1QEWpMkRGfn',
  // OKX Hot Wallet 8
  'TLaGjwhvA8XQYSxFAcAXy7Dvuue9eGYitv',
  // UEEx
  'TWQZEUfSPuMYjm4oHvmsktYcjD6rc5yyWq', // Hot Wallet 19
  // CoinOne (KR)
  'TDoyjmPJHzRFmYfCRLRsPhKjLETwd9fKr9',
  // WhiteBIT
  'TWBPGLwQw2EbqYLLw1DJnTDt2ZQ9yJW1JJ',
  // Kucoin
  'TUpHuDkiCCmwaTZBHZvQdwWzGNm5t8J2b9',
  // HTX
  'TFTWNgDBkQ5wQoP8RXpRznnHvAVV8x5jLu',
  'TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR',
  // Binance Cold
  'TNPdqto8HiuMzoG7Vv9wyyYhWzCojLeHAF',
  'TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9',
  'TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb',
]);

// Soft whitelist: reduce score by 70% (score *= 0.3)
const SOFT_WHITELIST = new Set<string>([]);

export function getWhitelistLevel(address: string): WhitelistLevel | null {
  if (!address) return null;
  if (STRONG_WHITELIST.has(address)) {
    return 'strong';
  }
  if (SOFT_WHITELIST.has(address)) {
    return 'soft';
  }
  return null;
}
