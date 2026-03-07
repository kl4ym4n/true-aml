import type { IBlockchainClient } from '../../../lib/blockchain-client.interface';
import type { AddressInfo, ContractInfo, LiquidityEvents } from '../address-check.pattern-analyzer';

export interface AddressContext {
  addressInfo: AddressInfo | null;
  contractInfo: ContractInfo | null;
  liquidityEvents: LiquidityEvents | null;
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
        if (
          'getContractInfo' in blockchainClient &&
          typeof (blockchainClient as any).getContractInfo === 'function'
        ) {
          contractInfo = (await (blockchainClient as any).getContractInfo(
            address
          )) as ContractInfo;
        }
        if (
          'hasLiquidityPoolEvents' in blockchainClient &&
          typeof (blockchainClient as any).hasLiquidityPoolEvents === 'function'
        ) {
          liquidityEvents = (await (blockchainClient as any).hasLiquidityPoolEvents(
            address,
            50
          )) as LiquidityEvents;
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
