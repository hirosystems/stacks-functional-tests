import { AccountsApi, Configuration, StacksApiSocketClient } from '@stacks/blockchain-api-client';
import { ENV } from './env';
import { StacksMainnet, StacksNetwork, StacksTestnet } from '@stacks/network';
import { logger, timeout, waiter } from '@hirosystems/api-toolkit';
import { Transaction } from '@stacks/stacks-blockchain-api-types';
import { StacksTransaction, broadcastTransaction } from '@stacks/transactions';

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

/**
 * Waits until the Stacks node reports the next nonce for the sender STX address.
 * @param currentNonce - Current nonce
 * @param interval - How often to poll the node
 */
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

export async function broadcastAndWaitForTransaction(
  tx: StacksTransaction,
  network: StacksNetwork
): Promise<Transaction> {
  const socketClient = newSocketClient();
  const txWaiter = waiter<Transaction>();

  const broadcast = await broadcastTransaction(tx, network);
  logger.debug(`Broadcast: 0x${broadcast.txid}`);
  const subscription = socketClient.subscribeTransaction(`0x${broadcast.txid}`, tx => {
    if ('block_hash' in tx) {
      logger.debug(`Confirmed: 0x${broadcast.txid}`);
      txWaiter.finish(tx);
    } else if (tx.tx_status == 'pending') {
      logger.debug(`Mempool: 0x${broadcast.txid}`);
    }
  });
  const result = await txWaiter;

  subscription.unsubscribe();
  socketClient.socket.close();
  return result;
}
