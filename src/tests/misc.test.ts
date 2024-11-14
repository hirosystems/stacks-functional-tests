import { waitForBurnBlockHeight, getStacksBlock, getStacksBlockRaw } from '../helpers';

test('wip test', async () => {
  await waitForBurnBlockHeight(132);

  const block = await getStacksBlock();
  console.log('stx block', block.height, block.hash);

  const blockRaw = await getStacksBlockRaw(block.height);
  console.log('stx block raw', blockRaw);
});
