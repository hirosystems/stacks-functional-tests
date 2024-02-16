import { StacksApiSocketClient } from '@stacks/blockchain-api-client';
import { ENV } from './env';
import { StacksMainnet, StacksNetwork, StacksTestnet } from '@stacks/network';

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
