import { Cl, getContractMapEntry, OptionalCV, UIntCV } from '@stacks/transactions';
import { ENV } from '../env';
import {
  bitcoindClient,
  getAccount,
  getPubKeyHashFromTx,
  getStacksBlock,
  getStacksBlockHeight,
  getTentativeStackerSet,
  stacksNetwork,
  waitForBurnBlockHeight,
  waitForNetwork,
  waitForNextCycle,
  waitForRewardPhase,
  waitForTransaction,
} from '../helpers';
import { networkEnvDown, networkEnvUp, regtestComposeDown, regtestComposeUp } from '../utils';
import { poxAddressToTuple, PoxInfo, StackingClient } from '@stacks/stacking';
import { timeout } from '@hirosystems/api-toolkit';

const network = stacksNetwork();

beforeEach(async () => {
  await networkEnvUp();
  await waitForNetwork();
});

afterEach(async () => {
  await networkEnvDown();
});

test('total locked is incorrect', async () => {
  // TEST CASE
  // alice stacks minimum times 13 stx
  // bob stacks minumum times 3 stx (less than alice) to the same pox address
  // check total locked

  const alice = getAccount(ENV.PRIVATE_KEYS[0]);
  const bob = getAccount(ENV.PRIVATE_KEYS[1]);
  const signer = getAccount(ENV.PRIVATE_KEYS[2]);

  const poxAddress = alice.btcAddress;
  console.log('pox address', poxAddress, alice.hashBytes);

  // PREP
  const client = new StackingClient('', network);

  await waitForBurnBlockHeight(140); // nakamoto

  await regtestComposeDown('stacker'); // ensure signers aren't changing their stacking

  let poxInfo = await client.getPoxInfo();
  await waitForRewardPhase(poxInfo, +10);

  poxInfo = await client.getPoxInfo();
  const poxInfoPreAlice = poxInfo;

  const minAmount = BigInt(poxInfo.min_amount_ustx);
  const aliceAmount = minAmount * 11n;
  const bobAmount = minAmount * 3n;
  const totalAmount = aliceAmount + bobAmount;

  expect(aliceAmount).toBeGreaterThan(bobAmount);
  expect(bobAmount).toBeGreaterThan(0n);

  console.log('reward cycle id', poxInfo.reward_cycle_id);

  // TRANSACTION (alice stack)
  const aliceSignature = client.signPoxSignature({
    topic: 'stack-stx',
    period: 1,
    rewardCycle: poxInfo.reward_cycle_id,
    poxAddress,
    signerPrivateKey: alice.signerPrivateKey,
    maxAmount: aliceAmount,
    authId: 0,
  });
  const { txid: aliceStack } = await alice.client.stack({
    amountMicroStx: aliceAmount,
    poxAddress,
    cycles: 1,
    burnBlockHeight: poxInfo.current_burnchain_block_height,
    signerKey: alice.signerPublicKey,
    signerSignature: aliceSignature,
    maxAmount: aliceAmount,
    authId: 0,
    privateKey: alice.key,
  });
  const aliceStackTx = await waitForTransaction(aliceStack);
  expect(aliceStackTx.tx_result.repr).toContain('(ok');
  expect(aliceStackTx.tx_status).toBe('success');

  await timeout(500);
  poxInfo = await client.getPoxInfo();

  let stackerSet = await getTentativeStackerSet(poxInfo.reward_cycle_id + 1, poxInfo);
  let stackerMap = new Map(stackerSet.map(s => [s['pox-addr'].match(/[a-f0-9]{40}/)?.at(0), s]));
  console.log('stacker set (w/ alice)', stackerSet);

  expect(stackerMap.get(alice.hashBytes)).toBeDefined();
  expect(stackerMap.get(bob.hashBytes)).not.toBeDefined();
  expect(stackerMap.get(alice.hashBytes)?.['total-ustx']).toBe(`u${aliceAmount}`); // as expected

  const poxInfoPreBob = poxInfo;
  const stackerSetTotalPreBob = stackerSet.reduce(
    (acc, s) => acc + BigInt(s['total-ustx'].replace('u', '')),
    0n
  );
  expect(stackerSetTotalPreBob).toBe(BigInt(poxInfo.next_cycle.stacked_ustx));
  console.log('stacker set total pre bob', stackerSetTotalPreBob);

  // TRANSACTION (bob stack)
  const bobSignature = client.signPoxSignature({
    topic: 'stack-stx',
    period: 1,
    rewardCycle: poxInfo.reward_cycle_id,
    poxAddress,
    signerPrivateKey: bob.signerPrivateKey,
    maxAmount: bobAmount,
    authId: 0,
  });
  const { txid: bobStack } = await bob.client.stack({
    amountMicroStx: bobAmount,
    poxAddress,
    cycles: 1,
    burnBlockHeight: poxInfo.current_burnchain_block_height,
    signerKey: bob.signerPublicKey,
    signerSignature: bobSignature,
    maxAmount: bobAmount,
    authId: 0,
    privateKey: bob.key,
  });
  const bobStackTx = await waitForTransaction(bobStack);
  expect(bobStackTx.tx_result.repr).toContain('(ok');
  expect(bobStackTx.tx_status).toBe('success');

  await timeout(500);
  poxInfo = await client.getPoxInfo();

  stackerSet = await getTentativeStackerSet(poxInfo.reward_cycle_id + 1, poxInfo);
  stackerMap = new Map(stackerSet.map(s => [s['pox-addr'].match(/[a-f0-9]{40}/)?.at(0), s]));
  console.log('stacker set (w/ alice & bob)', stackerSet);

  expect(stackerMap.get(alice.hashBytes)).toBeDefined();
  expect(stackerMap.get(alice.hashBytes)?.['total-ustx']).toBe(`u${bobAmount}`); // bob used alices pox address, and overrode her stack/reward
  expect(stackerMap.get(alice.hashBytes)?.signer).toBe(`0x${bob.signerPublicKey}`);

  const poxInfoPostBob = poxInfo;
  const stackerSetTotalPostBob = stackerSet.reduce(
    (acc, s) => acc + BigInt(s['total-ustx'].replace('u', '')),
    0n
  );
  console.log('stacker set total post bob', stackerSetTotalPostBob);

  expect(stackerSetTotalPostBob).toBeLessThan(stackerSetTotalPreBob); // stacker/reward set total went down

  expect(stackerSetTotalPostBob).not.toBe(BigInt(poxInfo.next_cycle.stacked_ustx));

  expect(poxInfoPostBob.next_cycle.stacked_ustx).toBeLessThan(
    poxInfoPreBob.next_cycle.stacked_ustx // total went down?!
  );

  console.log('reward cycle id', poxInfo.reward_cycle_id);
});

// alice u8892290000000000
// bob   u2425170000000000
