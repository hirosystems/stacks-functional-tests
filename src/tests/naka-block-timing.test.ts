import { StacksTestnet } from '@stacks/network';
import { StackingClient } from '@stacks/stacking';
import { Wallet, generateNewAccount, generateWallet } from '@stacks/wallet-sdk';
import { ENV } from '../env';
import { startRegtestEnv, stopRegtestEnv, withRetry } from '../utils';
import { getAccount, getWallet, waitForBurnBlockHeight, waitForNode, waitForTransaction } from '../helpers';
import { broadcastTransaction, makeSTXTokenTransfer } from '@stacks/transactions';
import { stopwatch } from '@hirosystems/api-toolkit';

jest.setTimeout(1_000_000_000);

describe('nakamoto pox-4', () => {
  const network = new StacksTestnet({
    url: ENV.STACKS_API,
    fetchFn: withRetry(5, fetch),
  });

  let wallet: Wallet;

  beforeEach(async () => {
    await startRegtestEnv();
    await waitForNode();
  });

  afterEach(async () => {
    await stopRegtestEnv();
  });

  beforeAll(async () => {
    wallet = await getWallet(7);
    console.log(wallet.accounts.map(a => getAccount(a.stxPrivateKey)));
  });

  test('get account status', async () => {
    const account = getAccount(wallet.accounts[0].stxPrivateKey);
    const client = new StackingClient(account.address, network);

    const res = await client.getAccountExtendedBalances();
    console.log(res);
  });

  test('create and time transaction', async () => {
    const account0 = getAccount(wallet.accounts[0].stxPrivateKey);
    const account1 = getAccount(wallet.accounts[1].stxPrivateKey);

    await waitForBurnBlockHeight(152 + 1); // one after nakamoto blocks enable

    const tx = await makeSTXTokenTransfer({
      recipient: account1.address,
      amount: 1000000000n,
      anchorMode: 'any',
      senderKey: account0.key,
      network,
    });

    const time = stopwatch();
    const res = await broadcastTransaction(tx, network);
    await waitForTransaction(res.txid);
    console.log(`Time taken: ${time.getElapsed()}ms`);
  });
});
