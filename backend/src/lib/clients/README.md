# Blockchain Clients Architecture

Эта архитектура позволяет легко переключаться между разными провайдерами блокчейн-данных (TronGrid, TronScan и т.д.).

## Структура

- **`blockchain-client.interface.ts`** - Интерфейс `IBlockchainClient` для всех клиентов
- **`tron-grid.adapter.ts`** - Адаптер для TronGrid API
- **`tron-scan.adapter.ts`** - Адаптер для TronScan API
- **`blockchain-client.factory.ts`** - Фабрика для создания клиентов

## Использование

### Переключение между провайдерами

Установите переменную окружения `BLOCKCHAIN_PROVIDER`:

```bash
# Использовать только TronGrid
BLOCKCHAIN_PROVIDER=trongrid

# Использовать только TronScan
BLOCKCHAIN_PROVIDER=tronscan

# Автоматический режим (по умолчанию)
# Использует TronScan для проверки безопасности, TronGrid для транзакций
BLOCKCHAIN_PROVIDER=auto
```

### Программное использование

```typescript
import { BlockchainClientFactory } from './lib/clients';

// Получить клиент
const client = BlockchainClientFactory.getClient('trongrid');

// Использовать клиент
const transactions = await client.getTransactions(address);
const security = await client.checkAddressSecurity(address);
```

## Режимы работы

### `auto` (по умолчанию)
- Использует TronScan для проверки безопасности адресов
- Использует TronGrid для получения транзакций
- Автоматический fallback при ошибках

### `trongrid`
- Использует только TronGrid API
- Быстрее, но без проверки безопасности

### `tronscan`
- Использует только TronScan API
- Включает проверку безопасности адресов

## Добавление нового провайдера

1. Создайте новый адаптер, реализующий `IBlockchainClient`
2. Добавьте его в `BlockchainClientFactory`
3. Обновите тип `BlockchainProvider`

Пример:

```typescript
export class NewProviderAdapter implements IBlockchainClient {
  // Реализуйте все методы интерфейса
}
```
