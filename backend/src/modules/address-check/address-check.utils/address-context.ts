import type { IBlockchainClient } from '../../../lib/blockchain-client.interface';
import type {
  AddressInfo,
  ContractInfo,
  LiquidityEvents,
} from '../address-check.pattern-analyzer';

export interface AddressContext {
  addressInfo: AddressInfo | null;
  contractInfo: ContractInfo | null;
  liquidityEvents: LiquidityEvents | null;
}

type ClientWithContractInfo = IBlockchainClient & {
  getContractInfo: (address: string) => Promise<ContractInfo | null>;
};

type ClientWithLiquidityEvents = IBlockchainClient & {
  hasLiquidityPoolEvents: (
    address: string,
    limit?: number
  ) => Promise<LiquidityEvents | null>;
};

function hasGetContractInfo(
  client: IBlockchainClient
): client is ClientWithContractInfo {
  return (
    'getContractInfo' in client &&
    typeof (client as { getContractInfo?: unknown }).getContractInfo ===
      'function'
  );
}

function hasLiquidityPoolEvents(
  client: IBlockchainClient
): client is ClientWithLiquidityEvents {
  return (
    'hasLiquidityPoolEvents' in client &&
    typeof (client as { hasLiquidityPoolEvents?: unknown })
      .hasLiquidityPoolEvents === 'function'
  );
}

/** Fetch address info, then contract info and liquidity events if address is a contract. */
export async function fetchAddressContext(
  blockchainClient: IBlockchainClient,
  address: string
): Promise<AddressContext> {
  let addressInfo: AddressInfo | null = null;
  let contractInfo: ContractInfo | null = null;
  let liquidityEvents: LiquidityEvents | null = null;

  try {
    const addressInfoResponse = await blockchainClient.getAddressInfo(address);
    addressInfo = addressInfoResponse as AddressInfo;

    const isContract =
      addressInfo?.accountType === 'Contract' ||
      addressInfo?.accountType === 'ContractCreator';

    if (isContract) {
      try {
        if (hasGetContractInfo(blockchainClient)) {
          contractInfo = await blockchainClient.getContractInfo(address);
        }
        if (hasLiquidityPoolEvents(blockchainClient)) {
          liquidityEvents = await blockchainClient.hasLiquidityPoolEvents(
            address,
            50
          );
        }
      } catch {
        // continue without contract/liquidity data
      }
    }
  } catch {
    // continue without address info
  }

  return { addressInfo, contractInfo, liquidityEvents };
}
