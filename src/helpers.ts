import RpcClient from '@btc-helpers/rpc';
import { logger, timeout, waiter } from '@hirosystems/api-toolkit';
import * as btc from '@scure/btc-signer';
import { NETWORK, TEST_NETWORK, getAddress } from '@scure/btc-signer';
import {
  AccountsApi,
  BlocksApi,
  Configuration,
  InfoApi,
  StackingRewardsApi,
  StacksApiSocketClient,
  TransactionsApi,
} from '@stacks/blockchain-api-client';
import { TransactionVersion, bytesToHex, hexToBytes } from '@stacks/common';
import { StacksMainnet, StacksNetwork, StacksTestnet } from '@stacks/network';
import { PoxInfo, StackingClient } from '@stacks/stacking';
import { Transaction } from '@stacks/stacks-blockchain-api-types';
import {
  BufferCV,
  Cl,
  ClarityType,
  OptionalCV,
  PrincipalCV,
  StacksTransaction,
  TupleCV,
  UIntCV,
  broadcastTransaction,
  createStacksPrivateKey,
  getAddressFromPrivateKey,
  getContractMapEntry,
  getPublicKey,
  isClarityType,
} from '@stacks/transactions';
import { Wallet, generateNewAccount, generateWallet } from '@stacks/wallet-sdk';
import { Toxiproxy } from 'toxiproxy-node-client';
import { ENV } from './env';
import { withRetry, withTimeout } from './utils';
import { c32addressDecode } from 'c32check';

export function newSocketClient(): StacksApiSocketClient {
  return new StacksApiSocketClient({
    url: ENV.STACKS_API,
    socketOpts: { reconnection: false },
  });
}

export function stacksNetwork(): StacksNetwork {
  const url = ENV.STACKS_API;
  switch (ENV.STACKS_CHAIN) {
    case 'mainnet':
      return new StacksMainnet({ url, fetchFn: withRetry(10, fetch) });
    case 'testnet':
      return new StacksTestnet({ url, fetchFn: withRetry(10, fetch) });
  }
}

export function burnHeightToRewardCycle(burnHeight: number, poxInfo: PoxInfo): number {
  // BASED ON pox-4.clar
  // (/ (- height (var-get first-burnchain-block-height)) (var-get pox-reward-cycle-length)))
  return Math.floor(
    (burnHeight - poxInfo.first_burnchain_block_height) / poxInfo.reward_cycle_length
  );
}

export function rewardCycleToBurnHeight(cycle: number, poxInfo: PoxInfo): number {
  // BASED ON pox-4.clar
  // (+ (var-get first-burnchain-block-height) (* cycle (var-get pox-reward-cycle-length))))
  return poxInfo.first_burnchain_block_height + cycle * poxInfo.reward_cycle_length;
}

// There's two ways of determining if a block is in the prepare phase:
// - the "normal" prepare phase; based on phase lengths the last X(-1) blocks of the
//   cycle (preparing the next)
// - the "blockchain" way; instead shifts this to the right by one; X-1 blocks
//   of the cycle and the 0 index block of the next cycle are sort of part of
//   the prepare phase

export function isInPreparePhase(blockHeight: number, poxInfo: PoxInfo): boolean {
  // BASED ON regtest-env
  // const effectiveHeight = blockHeight - poxInfo.first_burnchain_block_height;
  // return (
  //   poxInfo.reward_cycle_length - (effectiveHeight % poxInfo.reward_cycle_length) <
  //   poxInfo.prepare_phase_block_length
  // );

  // BASED ON stacks-core
  if (blockHeight <= poxInfo.first_burnchain_block_height) return false;
  const effectiveHeight = blockHeight - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  return pos > poxInfo.reward_cycle_length - poxInfo.prepare_phase_block_length; //  equivalent to the regtest-env way
  // return pos === 0 || pos > poxInfo.reward_cycle_length - poxInfo.prepare_phase_block_length;
}

export async function getNextNonce(
  address: string,
  fromStacksNode: boolean = true
): Promise<number> {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new AccountsApi(config);
  if (fromStacksNode) {
    const result = await api.getAccountInfo({ principal: address });
    return result.nonce;
  } else {
    const result = await api.getAccountNonces({ principal: address });
    return result.possible_next_nonce;
  }
}

export async function getStacksBlockHeight() {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new InfoApi(config);
  const result = await api.getCoreApiInfo();
  return result.stacks_tip_height;
}

export async function getRewards(btcAddress: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new StackingRewardsApi(config);
  return (await api.getBurnchainRewardListByAddress({ address: btcAddress })).results;
}

export async function getRewardSlots(btcAddress: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new StackingRewardsApi(config);
  return (await api.getBurnchainRewardSlotHoldersByAddress({ address: btcAddress })).results;
}

export const getBurnBlockHeight = withRetry(5, async () => {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new InfoApi(config);
  const result = await api.getCoreApiInfo();
  return result.burn_block_height;
});

export async function getTransaction(txid: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new TransactionsApi(config);
  try {
    return (await api.getTransactionById({ txId: txid })) as Transaction;
  } catch (error) {
    return null;
  }
}

export async function getTransactions(address: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new AccountsApi(config);
  try {
    return await api.getAccountTransactions({ principal: address });
  } catch (error) {
    return null;
  }
}

export async function getStacksBlock(blockHeight?: number) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
    // fetchApi: withRetry(5, fetch),
  });
  const api = new BlocksApi(config);

  if (blockHeight) {
    return await api.getBlock({
      heightOrHash: blockHeight,
    });
  }

  return (
    await api.getBlocks({
      limit: 1,
    })
  ).results[0];
}

export async function getStacksBlockRaw(blockHeight: number) {
  const blockInfo = await getStacksBlock(blockHeight);
  const blockId = blockInfo.hash;

  return fetch(`${ENV.STACKS_NODE}/v3/blocks/${blockId}`)
    .then(res => res.blob())
    .then(blob => blob.arrayBuffer())
    .then(buffer => bytesToHex(new Uint8Array(buffer)));
}

export async function getStackerSet(cycle: number) {
  const basePath = ENV.STACKS_NODE;
  return (
    await fetch(`${basePath}/v3/stacker_set/${cycle}`).then(
      res =>
        res.json() as Promise<{
          stacker_set: {
            rewarded_addresses: object[];
            start_cycle_state: {
              missed_reward_slots: any[];
            };
            signers: {
              signing_key: string;
              stacked_amt: number;
              weight: number;
            }[];
            pox_ustx_threshold: number;
          };
        }>
    )
  ).stacker_set;
}

/** Uses the clarity map entries of the pox contract to get the reward set of a cycle */
export async function getTentativeStackerSet(cycle: number, poxInfo: PoxInfo) {
  const [contractAddress, contractName] = poxInfo.contract_id.split('.');
  const lenTuple = (await getContractMapEntry({
    contractAddress,
    contractName,
    mapName: 'reward-cycle-pox-address-list-len',
    mapKey: Cl.tuple({ 'reward-cycle': Cl.uint(cycle) }),
    network: stacksNetwork(),
  })) as OptionalCV<TupleCV<{ len: UIntCV }>>;
  if (isClarityType(lenTuple, ClarityType.OptionalNone)) throw 'reward entry list length is none';
  const len = lenTuple.value.data.len.value;
  console.log(len);

  const range = Array.from({ length: Number(len) }, (_, i) => i); // range from 0 to len-1
  const entries = await Promise.all(
    range.map(async i => {
      const entry = (await getContractMapEntry({
        contractAddress,
        contractName,
        mapName: 'reward-cycle-pox-address-list',
        mapKey: Cl.tuple({ 'reward-cycle': Cl.uint(cycle), index: Cl.uint(i) }),
        network: stacksNetwork(),
      })) as OptionalCV<
        TupleCV<{
          'pox-addr': TupleCV<{ version: BufferCV; hashbytes: BufferCV }>;
          'total-ustx': UIntCV;
          stacker: OptionalCV<PrincipalCV>;
          signer: BufferCV;
        }>
      >;
      if (isClarityType(entry, ClarityType.OptionalNone)) throw 'entry is none';
      return Object.fromEntries(
        Object.entries(entry.value.data).map(([key, value]) => [key, Cl.stringify(value)])
      );
    })
  );

  return entries;
}

export async function getPox4Events() {
  const basePath = ENV.STACKS_API;
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

async function getInfoStatus() {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new InfoApi(config);
  return await Promise.race([
    api.getStatus(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ENV.RETRY_INTERVAL)),
  ]);
}

export function getAccount(key: string) {
  const network = stacksNetwork();
  const address = getAddressFromPrivateKey(
    key,
    network.isMainnet() ? TransactionVersion.Mainnet : TransactionVersion.Testnet
  );
  return {
    key,
    address,
    signerPrivateKey: createStacksPrivateKey(key), // don't do this in production
    signerPublicKey: bytesToHex(getPublicKey(createStacksPrivateKey(key)).data),
    btcAddress: getAddress(
      'pkh',
      hexToBytes(key).slice(0, 32),
      network.isMainnet() ? NETWORK : TEST_NETWORK
    ) as string,
    client: new StackingClient(address, network),
    hashBytes: c32addressDecode(address)[1],
  };
}

export async function getWalletAccounts(seed: string) {
  const wallet = await generateWallet({
    secretKey: seed,
    password: '',
  });
  const accounts = Array.from({ length: 10 })
    .reduce((acc: Wallet) => generateNewAccount(acc), wallet)
    .accounts.map(a => getAccount(a.stxPrivateKey));
  return accounts;
}

export async function waitForNetwork() {
  console.log('waiting for network...');
  await withRetry(1_000, getInfoStatus)();
  await waitForBurnBlockHeight(ENV.WAIT_UNTIL_BURN_HEIGHT);
}

export async function waitForNextCycle(poxInfo: PoxInfo) {
  return await waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + poxInfo.next_reward_cycle_in
  );
}

/** Wait until we're in the neglected part of the prepare phase */
export async function waitForPreparePhase(poxInfo: PoxInfo, diff: number = 0) {
  if (isInPreparePhase((poxInfo.current_burnchain_block_height as number) + diff, poxInfo)) return;

  const effectiveHeight =
    (poxInfo.current_burnchain_block_height as number) - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  const blocksUntilPreparePhase = poxInfo.reward_phase_block_length - pos + 1;
  return waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + blocksUntilPreparePhase + diff
  );
}

export async function waitForRewardPhase(poxInfo: PoxInfo, diff: number = 0) {
  if (!isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)) return;

  const effectiveHeight =
    (poxInfo.current_burnchain_block_height as number) - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  const blocksUntilRewardPhase = poxInfo.reward_cycle_length - pos;
  return waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + blocksUntilRewardPhase + diff
  );
}

// export async function waitForCycle(cycle: number) {}

/**
 * Waits until the Stacks node reports the next nonce for the sender STX address.
 * @param currentNonce - Current nonce
 * @param interval - How often to poll the node
 */
export async function waitForNextNonce(
  address: string,
  currentNonce: number,
  interval: number = ENV.POLL_INTERVAL
): Promise<void> {
  let next: number = currentNonce;
  while (next != currentNonce + 1) {
    await timeout(interval);
    next = await getNextNonce(address);
  }
}

/** Waits until the burn block height is reached */
export async function waitForBurnBlockHeight(
  burnBlockHeight: number,
  interval: number = ENV.POLL_INTERVAL
): Promise<void> {
  let lastHeight = -1;
  let lastHeightTime = Date.now();

  while (true) {
    const currentHeight = await getBurnBlockHeight();

    if (currentHeight >= burnBlockHeight) {
      console.log(`block height ${currentHeight} (reached)`);
      break;
    }

    if (currentHeight === lastHeight) {
      if (Date.now() - lastHeightTime > ENV.BITCOIN_TX_TIMEOUT) {
        throw `Burn block height hasn't changed for ${ENV.BITCOIN_TX_TIMEOUT / 1000} seconds`;
      }
    } else {
      lastHeight = currentHeight;
      lastHeightTime = Date.now();
      console.log(`block height ${currentHeight} (waiting for ${burnBlockHeight})`);
    }

    await timeout(interval);
  }
}

export const broadcastAndWaitForTransaction = withTimeout(
  ENV.STACKS_TX_TIMEOUT,
  async (tx: StacksTransaction, network: StacksNetwork): Promise<Transaction> => {
    const socketClient = newSocketClient();
    const txWaiter = waiter<Transaction>();

    const broadcast = await broadcastTransaction(tx, network);
    logger.debug(`Broadcast: 0x${broadcast.txid}`);

    if (broadcast.error) {
      logger.error(broadcast.error);
      if (broadcast.reason) logger.error(broadcast.reason);
      if (broadcast.reason_data) logger.error(broadcast.reason_data);
      throw 'broadcast failed';
    }

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
);

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

// TOXI PROXY ==================================================================
const proxyClient = new Toxiproxy('http://localhost:8474');

type ProxyName =
  | 'stacks-node'
  | 'stacks-api'
  | 'stacks-signer-1'
  | 'stacks-signer-2'
  | 'stacks-signer-3';

export async function getProxies() {
  return await proxyClient.getAll();
}

export async function getProxy(name: ProxyName) {
  return await proxyClient.get(name);
}

export async function pauseProxy(name: ProxyName) {
  const proxy = await proxyClient.get(name);
  await proxy.update({ enabled: false, listen: proxy.listen, upstream: proxy.upstream });
  return proxy;
}

export async function resumeProxy(name: ProxyName) {
  const proxy = await proxyClient.get(name);
  await proxy.update({ enabled: true, listen: proxy.listen, upstream: proxy.upstream });
  return proxy;
}
// =============================================================================

// BITCOIND RPC ================================================================
export const bitcoindClient = new RpcClient('http://btc:btc@localhost:18443').Typed;
// =============================================================================

export function getPubKeyHashFromTx(tx: string) {
  const transaction = btc.Transaction.fromRaw(hexToBytes(tx), {
    allowUnknownOutputs: true,
  });
  const input = transaction.getInput(0);
  if (!input.finalScriptSig) throw 'unexpected type';
  const decodedScript = btc.Script.decode(input.finalScriptSig);
  return bytesToHex(decodedScript[1] as Uint8Array);
}
