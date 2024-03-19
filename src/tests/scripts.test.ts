import { StacksDevnet } from '@stacks/network';
import { StackingClient } from '@stacks/stacking';
import { ENV } from '../env';
import { getAccount } from '../helpers';

test('get account status', async () => {
  const steph = getAccount(ENV.REGTEST_KEYS[0]);
  const client = new StackingClient(steph.address, new StacksDevnet());
  const status = await client.getStatus();
  console.log(status);
  console.log((await client.getPoxInfo()).current_burnchain_block_height);
});
