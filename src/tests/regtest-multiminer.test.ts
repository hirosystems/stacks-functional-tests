import {
  bitcoindClient,
  getPubKeyHashFromTx,
  getStacksBlock,
  getStacksBlockHeight,
  stacksNetwork,
  waitForBurnBlockHeight,
  waitForNetwork,
} from '../helpers';
import { networkEnvDown, networkEnvUp, regtestComposeDown, regtestComposeUp } from '../utils';

const network = stacksNetwork();

beforeEach(async () => {
  await networkEnvUp();
  await waitForNetwork();
});

afterEach(async () => {
  await networkEnvDown();
});

test('multiple miners are active', async () => {
  // TEST CASE
  // wait for some stacks blocks to be mined
  // get the pubkey hashes from the stacks blocks
  // ensure there are EXACTLY TWO unique pubkeys mining

  await waitForBurnBlockHeight(300);

  const height = await getStacksBlockHeight();
  const range = Array.from({ length: height - 1 }, (_, i) => i + 1);

  const pubKeyHashes = await Promise.all(
    range.map(async height => {
      const block = await getStacksBlock(height);
      const tx = await bitcoindClient.getrawtransaction({
        txid: block.miner_txid.replace('0x', ''),
      });
      return getPubKeyHashFromTx(tx as string);
    })
  );

  console.log('pubkey hashes length', pubKeyHashes.length);

  expect(range.length).toBeGreaterThan(0);
  expect(pubKeyHashes.length).toBeGreaterThan(0);

  const uniques = new Set(pubKeyHashes);
  console.log('unique pubkeys', uniques.size);

  const counts = pubKeyHashes.reduce(
    (acc, hash) => {
      acc[hash] = (acc[hash] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.log('miner counts', counts);

  expect(uniques.size).toBe(2);
});

test('miner recovers after restart in live network', async () => {
  // TEST CASE
  // two miner setup
  // wait for some stacks blocks to be mined
  // compose DOWN a miner (without signers or other event observers)
  // wait for a few blocks
  // compose UP the miner
  // wait for a few blocks
  // ensure the miner has caught up to the network

  await waitForBurnBlockHeight(120);

  await regtestComposeDown('stacks-miner-2');

  await waitForBurnBlockHeight(130);

  await regtestComposeUp('stacks-miner-2');

  await waitForBurnBlockHeight(140);

  const info1: any = await fetch('http://localhost:20443/v2/info').then(r => r.json());
  const info2: any = await fetch('http://localhost:40443/v2/info').then(r => r.json());

  expect(info1.pox_consensus).toBe(info2.pox_consensus);
  expect(info1.burn_block_height).toBe(info2.burn_block_height);
  expect(info1.stacks_tip_height).toBe(info2.stacks_tip_height);
  expect(info1.stacks_tip_consensus_hash).toBe(info2.stacks_tip_consensus_hash);
});
