import { waitForBurnBlockHeight, getStacksBlock, getStacksBlockRaw } from '../helpers';
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
