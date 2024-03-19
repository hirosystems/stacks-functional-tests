import {
  AccountsApi,
  Configuration,
  InfoApi,
  StackingRewardsApi,
  StacksApiSocketClient,
  TransactionsApi,
} from '@stacks/blockchain-api-client';
import { ENV } from './env';
import { StacksMainnet, StacksNetwork, StacksTestnet } from '@stacks/network';
import { logger, timeout, waiter } from '@hirosystems/api-toolkit';
import { Transaction } from '@stacks/stacks-blockchain-api-types';
import {
  StacksTransaction,
  broadcastTransaction,
  createStacksPrivateKey,
  getAddressFromPrivateKey,
  getPublicKey,
} from '@stacks/transactions';
import { TransactionVersion, bytesToHex, hexToBytes } from '@stacks/common';
import { NETWORK, TEST_NETWORK, getAddress } from '@scure/btc-signer';
import { PoxInfo } from '@stacks/stacking';
import { withRetry, withTimeout } from './utils';

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

export function burnHeightToRewardCycle(burnHeight: number, poxInfo: PoxInfo): number {
  // pox-4.clar
  // (/ (- height (var-get first-burnchain-block-height)) (var-get pox-reward-cycle-length)))
  return Math.floor(
    (burnHeight - poxInfo.first_burnchain_block_height) / poxInfo.reward_cycle_length
  );
}

export function rewardCycleToBurnHeight(cycle: number, poxInfo: PoxInfo): number {
  // pox-4.clar
  // (+ (var-get first-burnchain-block-height) (* cycle (var-get pox-reward-cycle-length))))
  return poxInfo.first_burnchain_block_height + cycle * poxInfo.reward_cycle_length;
}

// There's two ways of determining if a block is in the prepare phase:
// - the "normal" prepare phase; based on phase lengths the last X blocks of the
//   cycle (preparing the next)
// - the "blockchain" way; instead shifts this to the right by one; X-1 blocks
//   of the cycle and the 0 index block of the next cycle are sort of part of
//   the prepare phase

export function isInNeglectedPhase(blockHeight: number, poxInfo: PoxInfo): boolean {
  // BASED ON stacks-core prepare-phase
  if (blockHeight <= poxInfo.first_burnchain_block_height) return false;
  const effectiveHeight = blockHeight - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  return pos === 0 || pos > poxInfo.reward_cycle_length - poxInfo.prepare_phase_block_length;
}

export function isInPreparePhase(blockHeight: number, poxInfo: PoxInfo): boolean {
  // BASED ON stacks-core
  // if (blockHeight <= poxInfo.first_burnchain_block_height) return false;
  // const effectiveHeight = blockHeight - poxInfo.first_burnchain_block_height;
  // const pos = effectiveHeight % poxInfo.reward_cycle_length;
  // return pos === 0 || pos > poxInfo.reward_cycle_length - poxInfo.prepare_phase_block_length;

  // BASED ON regtest-env
  const effectiveHeight = blockHeight - poxInfo.first_burnchain_block_height;
  return (
    poxInfo.reward_cycle_length - (effectiveHeight % poxInfo.reward_cycle_length) <= // WARNING using `<=` rather than `<`
    poxInfo.prepare_phase_block_length
  );
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

export async function getRewards(btcAddress: string) {
  const config = new Configuration({
    basePath: `http://${ENV.STACKS_API_HOST}:${ENV.STACKS_API_PORT}`,
  });
  const api = new StackingRewardsApi(config);
  return (await api.getBurnchainRewardListByAddress({ address: btcAddress })).results;
}

export const getBurnBlockHeight = withRetry(3, async () => {
  const config = new Configuration({
    basePath: `http://${ENV.STACKS_API_HOST}:${ENV.STACKS_API_PORT}`,
  });
  const api = new InfoApi(config);
  const result = await api.getCoreApiInfo();
  return result.burn_block_height;
});

export async function getTransaction(txid: string) {
  const config = new Configuration({
    basePath: `http://${ENV.STACKS_API_HOST}:${ENV.STACKS_API_PORT}`,
  });
  const api = new TransactionsApi(config);
  try {
    return (await api.getTransactionById({ txId: txid })) as Transaction;
  } catch (error) {
    return null;
  }
}

export async function getPox4Events() {
  const basePath = `http://${ENV.STACKS_API_HOST}:${ENV.STACKS_API_PORT}`;
  return fetch(`${basePath}/extended/v1/pox4/events`).then(
    res =>
      res.json() as Promise<{
        results: {
          block_height: number;
          tx_id: string;
          tx_index: number;
          event_index: number;
          stacker: string;
          locked: string;
          balance: string;
          burnchain_unlock_height: string;
          pox_addr: string;
          pox_addr_raw: string;
          name: string;
          data: {
            lock_amount: string;
            lock_period: string;
            start_burn_height: string;
            unlock_burn_height: string;
            signer_key: string;
            end_cycle_id: string;
            start_cycle_id: string;
          };
        }[];
      }>
  );
}

export function getAccount(key: string) {
  const network = stacksNetwork();
  return {
    key,
    address: getAddressFromPrivateKey(
      key,
      network.isMainnet() ? TransactionVersion.Mainnet : TransactionVersion.Testnet
    ),
    signerPrivateKey: createStacksPrivateKey(key), // don't do this in production
    signerPublicKey: bytesToHex(getPublicKey(createStacksPrivateKey(key)).data),
    btcAddress: getAddress(
      'pkh',
      hexToBytes(key).slice(0, 32),
      network.isMainnet() ? NETWORK : TEST_NETWORK
    ) as string,
  };
}

export async function waitForPreparePhase(poxInfo: PoxInfo) {
  if (isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)) return;

  const effectiveHeight =
    (poxInfo.current_burnchain_block_height as number) - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  const blocksUntilPreparePhase = poxInfo.reward_phase_block_length - pos;
  return waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + blocksUntilPreparePhase
  );
}

export async function waitForNeglectedPhase(poxInfo: PoxInfo) {
  if (isInNeglectedPhase(poxInfo.current_burnchain_block_height as number, poxInfo)) return;

  const effectiveHeight =
    (poxInfo.current_burnchain_block_height as number) - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  const blocksUntilPreparePhase = poxInfo.reward_phase_block_length - pos;
  return waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + blocksUntilPreparePhase
  );
}

export async function waitForRewardPhase(poxInfo: PoxInfo) {
  if (!isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)) return;

  const effectiveHeight =
    (poxInfo.current_burnchain_block_height as number) - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  const blocksUntilRewardPhase = poxInfo.reward_cycle_length - pos;
  return waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + blocksUntilRewardPhase
  );
}

// export async function waitForCycle(cycle: number) {}

/**
 * Waits until the Stacks node reports the next nonce for the sender STX address.
 * @param currentNonce - Current nonce
 * @param interval - How often to poll the node
 */
export async function waitForNextNonce(
  currentNonce: number,
  interval: number = ENV.POLL_INTERVAL
): Promise<void> {
  let next: number = currentNonce;
  while (next != currentNonce + 1) {
    await timeout(interval);
    next = await getNextNonce();
  }
}

/** Waits until the burn block height is reached */
export async function waitForBurnBlockHeight(
  burnBlockHeight: number,
  interval: number = ENV.POLL_INTERVAL
): Promise<void> {
  let height: number = -1;
  while (height < burnBlockHeight) {
    await timeout(interval);
    height = await getBurnBlockHeight();
    console.log('waiting', height, '<', burnBlockHeight);
  }
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

export const waitForTransaction = withTimeout(
  ENV.STACKS_TX_TIMEOUT,
  async (txid: string): Promise<Transaction> => {
    const socketClient = newSocketClient();
    const txWaiter = waiter<Transaction>();

    const subscription = socketClient.subscribeTransaction(`0x${txid}`, tx => {
      if ('block_hash' in tx) {
        logger.debug(`Confirmed: 0x${txid}`);
        txWaiter.finish(tx);
      } else if (tx.tx_status == 'pending') {
        logger.debug(`Mempool: 0x${txid}`);
      }
    });
    // const tx = await getTransaction(txid);
    // const result = tx?.tx_status === 'success' ? tx : await txWaiter;

    try {
      return await txWaiter;
    } finally {
      subscription.unsubscribe();
      socketClient.socket.close();
    }
  }
);
