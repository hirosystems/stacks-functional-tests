import { StacksDevnet, StacksMainnet, StacksTestnet } from '@stacks/network';
import { StackingClient } from '@stacks/stacking';
import { c32addressDecode } from 'c32check';
import { ENV } from '../env';
import {
  getAccount,
  getRewardSlots,
  getStacksBlock,
  getTentativeStackerSet,
  getTransactions,
  stacksNetwork,
  waitForTransaction,
} from '../helpers';
import { callReadOnlyFunction, Cl } from '@stacks/transactions';
import { Configuration, SmartContractsApi } from '@stacks/blockchain-api-client';
import { bytesToHex } from '@stacks/common';

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
  const steph = getAccount(ENV.PRIVATE_KEYS[0]);
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

test('stack for Steph (nakamoto)', async () => {
  const steph = getAccount(ENV.PRIVATE_KEYS[0]);
  const client = new StackingClient(
    steph.address,
    new StacksTestnet({
      url: 'https://api.nakamoto-1.hiro.so',
    })
  );

  // Get POX info
  const poxInfo = await client.getPoxInfo();

  // Get the account balance and use it as the amount to stack
  const balances = await client.getAccountExtendedBalances();
  const amount = BigInt(balances.stx.balance as number) - 10_000_000n;

  console.log('amount', amount);

  // Get the current burn block height
  const burnBlockHeight = poxInfo.current_burnchain_block_height as number;

  // Create a signature for stacking
  const authId = 2; // You can use a random number here if you prefer
  const signature = client.signPoxSignature({
    topic: 'stack-stx',
    period: 1, // Stack for 1 cycle
    rewardCycle: poxInfo.reward_cycle_id,
    poxAddress: steph.btcAddress,
    signerPrivateKey: steph.signerPrivateKey,
    maxAmount: amount,
    authId,
  });

  // Perform the stacking transaction
  const res = await client.stack({
    amountMicroStx: amount,
    poxAddress: steph.btcAddress,
    cycles: 1,
    burnBlockHeight,
    signerKey: steph.signerPublicKey,
    signerSignature: signature,
    maxAmount: amount,
    authId,
    privateKey: steph.key,
  });

  console.log('Stacking transaction ID:', res);

  // Wait for the transaction to be processed
  const result = await waitForTransaction(res.txid);

  // Check if the stacking was successful
  expect(result.tx_status).toBe('success');
  expect(result.tx_result.repr).toContain('(ok');

  // Verify that Steph is now stacking
  const stackingStatus = await client.getStatus();
  expect(stackingStatus.stacked).toBe(true);
});

test('stacker set total (nakamoto)', async () => {
  const client = new StackingClient('', stacksNetwork());
  const poxInfo = await client.getPoxInfo();

  console.log('reward cycle id', poxInfo.reward_cycle_id);
  const stackerSet = await getTentativeStackerSet(poxInfo.reward_cycle_id, poxInfo);
  const stackerSetTotal = stackerSet.reduce(
    (acc, s) => acc + BigInt(s['total-ustx'].replace('u', '')),
    0n
  );

  console.log('total signers', stackerSet.length);

  console.log('stacker set total', stackerSetTotal);
  console.log('current cycle total', poxInfo.current_cycle.stacked_ustx);
  console.log('next cycle total', poxInfo.next_cycle.stacked_ustx);
});

test('read total stacked from pox contract', async () => {
  const network = stacksNetwork();
  const alice = getAccount(ENV.PRIVATE_KEYS[0]);
  const client = new StackingClient('', network);
  const poxInfo = await client.getPoxInfo();

  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new SmartContractsApi(config);

  const cycle = 93;
  const tip = 165966;

  const [contractAddress, contractName] = poxInfo.contract_id.split('.');

  const blockTip = await getStacksBlock(tip);
  const rawWithTip = await api.callReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: 'get-total-ustx-stacked',
    readOnlyFunctionArgs: {
      arguments: [bytesToHex(Cl.serialize(Cl.uint(cycle)))],
      sender: alice.address,
    },
    tip: blockTip.index_block_hash.replace('0x', ''),
  });
  console.log(Cl.deserialize(rawWithTip.result as string));

  const blockTipBefore = await getStacksBlock(tip - 1);
  const rawBeforeTip = await api.callReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: 'get-total-ustx-stacked',
    readOnlyFunctionArgs: {
      arguments: [bytesToHex(Cl.serialize(Cl.uint(cycle)))],
      sender: alice.address,
    },
    tip: blockTipBefore.index_block_hash.replace('0x', ''),
  });
  console.log(Cl.deserialize(rawBeforeTip.result as string));
});
