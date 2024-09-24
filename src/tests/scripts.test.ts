import { StacksDevnet } from '@stacks/network';
import { StackingClient } from '@stacks/stacking';
import { c32addressDecode } from 'c32check';
import { ENV } from '../env';
import { getAccount, getRewardSlots, getTentativeStackerSet, getTransactions } from '../helpers';

test('get info', async () => {
  const steph = getAccount(ENV.PRIVATE_KEYS[0]);
  const client = new StackingClient(steph.address, new StacksDevnet());
  const status = await client.getStatus();
  console.log(status);
  const poxInfo = await client.getPoxInfo();
  console.log(poxInfo.current_burnchain_block_height);
  console.log(poxInfo.min_amount_ustx);
  const balances = await steph.client.getAccountExtendedBalances();
  console.log(balances);
  console.log(BigInt(balances.stx.balance as string) > BigInt(poxInfo.min_amount_ustx) * 2n);
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
