import { StacksDevnet } from '@stacks/network';
import { c32addressDecode } from 'c32check';
import { StackingClient } from '@stacks/stacking';
import { ENV } from '../env';
import { getAccount, getRewardSlots, getTentativeStackerSet, getTransactions } from '../helpers';
import { Cl, ClarityType } from '@stacks/transactions';

test('get account status', async () => {
  const steph = getAccount(ENV.PRIVATE_KEYS[0]);
  const client = new StackingClient(steph.address, new StacksDevnet());
  const status = await client.getStatus();
  console.log(status);
  console.log((await client.getPoxInfo()).current_burnchain_block_height);
});

test('get account', async () => {
  const steph = getAccount('7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801');
  console.log(steph);
  const balances = await steph.client.getAccountExtendedBalances();
  console.log(balances);
});

test('get reward slot', async () => {
  const steph = getAccount(ENV.PRIVATE_KEYS[0]);
  const rewards = await getRewardSlots(steph.btcAddress);
  console.log(rewards[0]);
});

test('get transactions', async () => {
  const steph = getAccount(ENV.PRIVATE_KEYS[0]);
  const txs = await getTransactions(steph.address);
  console.log(txs);
});

test('get env info', () => {
  console.log(typeof ENV.SKIP_UNLOCK);
});

test('get pox-4 maps', async () => {
  const steph = getAccount(ENV.PRIVATE_KEYS[0]);
  console.log('steph', steph.address, c32addressDecode(steph.address));
  const poxInfo = await steph.client.getPoxInfo();
  const set = await getTentativeStackerSet(6, poxInfo);

  console.log(set);
});

test('log all account addresses', () => {
  const addresses = ENV.PRIVATE_KEYS.map(key => getAccount(key).address);
  console.log(addresses);
});
