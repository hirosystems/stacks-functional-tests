import { StacksTransaction, makeSTXTokenTransfer } from '@stacks/transactions';
import { ENV } from '../env';
import {
  broadcastAndWaitForTransaction,
  getAccount,
  getNextNonce,
  getWallet,
  stacksNetwork,
  waitForNextNonce,
} from '../helpers';
import { StacksNetwork } from '@stacks/network';
import { Wallet } from '@stacks/wallet-sdk';
import { logger, stopwatch } from '@hirosystems/api-toolkit';

// This test requires SENDER_STX_ADDRESS to have at least 100 STX
// The test will send this to 10000 different addresses, and then they will send it back
// This test will measure how well the network handles a massive amount of transactions

// This test takes a long time
jest.setTimeout(1_000_000_000);

// Max transactions an account can make in a single block
// MUST MATCH VALUE IN stacks-node!!!
const MAXIMUM_MEMPOOL_TX_CHAINING = 25;
// Number of transactions to use for load testing
const LOAD_TEST_TRANSACTIONS = 10_000;

// This gives us something like Rust's `.drain()` method for arrays
declare global {
  interface Array<T> {
    drain(o: number): Array<T>;
  }
}

Array.prototype.drain = function(amount: number): Array<any> {
  let arr = [];
  // TODO: Can this be done more efficiently?
  for (let i=0; i<amount; i++) {
    let elem = this.shift();
    if (!elem) break;
    arr.push(elem)
  }
  return arr;
};

describe('Network load testing', () => {
  let network: StacksNetwork;
  let senderNonce: number;
  let wallet: Wallet;

  beforeAll(async () => {
    network = stacksNetwork();
    wallet = await getWallet(LOAD_TEST_TRANSACTIONS);
  });

  beforeEach(async () => {
    senderNonce = await getNextNonce();
  });

  afterEach(async () => {
    await waitForNextNonce(senderNonce);
  });

  test(`Send ${LOAD_TEST_TRANSACTIONS} STX transfers`, async () => {
    // Amount SENDER will need for each transaction
    const amount = 10_000;
    // Use fixed fee so we know we can calculate exact amount to send back
    const fee = 1_000;

    let addresses = wallet.accounts.map(a => getAccount(a.stxPrivateKey).address)
    const amount0 = amount - fee;

    // Set up test by sending STX to large amount of addresses
    logger.debug(`Preparing load test by funding ${LOAD_TEST_TRANSACTIONS} accounts`);
    const time = stopwatch();
    for (let batch=1; addresses?.length; batch++) {
      // Send transactions in chunks of MAXIMUM_MEMPOOL_TX_CHAINING
      const addrChunk = addresses.drain(MAXIMUM_MEMPOOL_TX_CHAINING);
    
      const txs = addrChunk.map(async (recipient: string) => {
        const tx = await makeSTXTokenTransfer({
          network,
          nonce: senderNonce++,
          recipient,
          amount: amount0,
          fee,
          anchorMode: 'any',
          senderKey: ENV.SENDER_KEY,
        })
        return await broadcastAndWaitForTransaction(tx, network);
      });
      // Send and wait for all transactions to be confirmed
      logger.debug(`Submitting batch ${batch} of ${MAXIMUM_MEMPOOL_TX_CHAINING} transactions from SENDER`);
      const timeBatch = stopwatch();
      await Promise.all(txs);
      logger.debug(`Confirmed batch ${batch} of txs from SENDER in ${timeBatch.getElapsed()} ms`);
    }
    logger.debug(`Load test setup complete. SENDER funded ${LOAD_TEST_TRANSACTIONS} accounts in ${time.getElapsedSeconds()} seconds`);

    const amount1 = amount0 - fee;

    // Prepare txs to send from accounts back to SENDER
    logger.debug(`Preparing ${LOAD_TEST_TRANSACTIONS} STX transfers to SENDER`);
    const privkeys = wallet.accounts.map(a => a.stxPrivateKey);
    let txMake = privkeys.map(async (senderKey: string) => 
        await makeSTXTokenTransfer({
          network,
          recipient: ENV.SENDER_STX_ADDRESS,
          amount: amount1,
          fee,
          anchorMode: 'any',
          senderKey,
        })
    )
    let txs = await Promise.all(txMake);
    
    // Send all STX back to SENDER and wait for confirmation
    logger.debug(`Sending ${LOAD_TEST_TRANSACTIONS} STX transfers to SENDER`);
    time.restart();
    let txSend = txs.map(async (tx: StacksTransaction) => await broadcastAndWaitForTransaction(tx, network));
    let results = await Promise.all(txSend);

    logger.debug(`Load test complete. Sent ${LOAD_TEST_TRANSACTIONS} STX transfers to SENDER in ${time.getElapsed()} ms`);
  });
});
