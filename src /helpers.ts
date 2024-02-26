import { AccountsApi, Configuration, StacksApiSocketClient } from '@stacks/blockchain-api-client';
import { ENV } from './env';
import { StacksMainnet, StacksNetwork, StacksTestnet } from '@stacks/network';
import { timeout } from '@hirosystems/api-toolkit';

export function newSocketClient(): StacksApiSocketClient {
  return new StacksApiSocketClient({
    url: `http://${ENV.STACKS_API_HOST}:${ENV.STACKS_API_PORT}`,
    socketOpts: { reconnection: false },
  });
}

export function stacksNetwork(): StacksNetwork {
  const url = `http://${ENV.STACKS_NODE_HOST}:${ENV.STACKS_NODE_PORT}`;
  switch (ENV.STACKS_CHAIN) {
    case 'mainnet':
      return new StacksMainnet({ url });
    case 'testnet':
      return new StacksTestnet({ url });
  }
}

export async function getNextNonce(fromStacksNode: boolean = true): Promise<number> {
  const config = new Configuration({
    basePath: `http://${ENV.STACKS_API_HOST}:${ENV.STACKS_API_PORT}`,
  });
  const api = new AccountsApi(config);
  if (fromStacksNode) {
    const result = await api.getAccountInfo({ principal: ENV.SENDER_STX_ADDRESS });
    return result.nonce;
  } else {
    const result = await api.getAccountNonces({ principal: ENV.SENDER_STX_ADDRESS });
    return result.possible_next_nonce;
  }
}

export async function waitForNextNonce(
  currentNonce: number,
  interval: number = 100
): Promise<void> {
  let next: number = currentNonce;
  do {
    await timeout(interval);
    next = await getNextNonce();
  } while (next != currentNonce + 1);
}
