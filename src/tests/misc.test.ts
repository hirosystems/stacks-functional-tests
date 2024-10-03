import {
  waitForBurnBlockHeight,
  getStacksBlock,
  getStacksBlockRaw,
  getStacksBlockHeight,
  bitcoindClient,
  getPubKeyHashFromTx,
} from '../helpers';
import { regtestComposeDown, regtestComposeUp } from '../utils';

test('wip test', async () => {
  await waitForBurnBlockHeight(132);

  const block = await getStacksBlock();
  console.log('stx block', block.height, block.hash);

  const blockRaw = await getStacksBlockRaw(block.height);
  console.log('stx block raw', blockRaw);
});

test('signer rollover', async () => {
  await waitForBurnBlockHeight(110);
  console.log(await regtestComposeDown('stacker'));
  console.log(await regtestComposeUp('stacker', '--env-file .env-signers-5'));
  // cycle 5 (reward phase)
  // stacker script should have stacked until 6
  // shut off stackers (in cycle 5)
  // original signers can take on cycle 6
  // power up new stackers (in cycle 6)
  // new stackers take on cycle 7
});

test('multiple miners are active', async () => {
  // PREP
  await waitForBurnBlockHeight(109);

  const height = await getStacksBlockHeight();
  const range = Array.from({ length: height - 1 }, (_, i) => i + 1);
  console.log('height', height, 'range', range.length);

  const pubKeyHashes = await Promise.all(
    range.map(async height => {
      const block = await getStacksBlock(height);
      const tx = await bitcoindClient.getrawtransaction({
        txid: block.miner_txid.replace('0x', ''),
      });
      return getPubKeyHashFromTx(tx as string);
    })
  );

  expect(range.length).toBeGreaterThan(0);
  expect(pubKeyHashes.length).toBeGreaterThan(0);

  expect(new Set(pubKeyHashes).size).toBe(2);
});
