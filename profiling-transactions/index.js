import { makeSTXTokenTransfer, broadcastTransaction } from '@stacks/transactions';
import {
  createApiKeyMiddleware,
  createFetchFn,
  StacksMainnet,
  StacksTestnet,
} from '@stacks/network';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const ENV = process.env;
const bufferTime = 1000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const INITIAL_RUN = true;
const TRANSACTIONS_TO_RUN = 2;

// strucutre tx saved json
// txid
// updated_receipt: boolean
// receipt_time: int
// block_time: int
// delta_time: int

const stacksNetworkApi = () => {
  const url = ENV.STACKS_API;
  const apiKey = ENV.STACKS_API_KEY;

  const opts = { url };
  if (apiKey?.length) {
    const apiMiddleware = createApiKeyMiddleware({ apiKey });
    opts.fetchFn = createFetchFn(apiMiddleware);
  }
  switch (ENV.STACKS_CHAIN) {
    case 'mainnet':
      return new StacksMainnet(opts);
    case 'testnet':
      return new StacksTestnet(opts);
  }
};

const network = stacksNetworkApi();

const getNextNonce = async () => {
  const apiUrl = `${ENV.STACKS_API}/extended/v1/address/${ENV.SENDER_STX_ADDRESS}/nonces`;

  const response = await fetch(apiUrl, {
    headers: {
      'x-api-key': ENV.STACKS_API_KEY,
    },
  });
  const nonce = (await response.json()).possible_next_nonce;
  console.log(nonce);
  return nonce;
};

const stxTransferInit = async nonce => {
  const tx = await makeSTXTokenTransfer({
    network,
    nonce,
    recipient: ENV.RECEIVER_STX_ADDRESS,
    amount: 10_000,
    anchorMode: 'any',
    senderKey: ENV.SENDER_KEY,
    fee: 4_000_000, // 4 STX (1 STX = 1,000,000 microSTX)
  });

  const apiUrl = `${ENV.STACKS_API}/extended/v1/tx/mempool?limit=1&unanchored=true`;

  const response = await fetch(apiUrl, {
    headers: {
      'x-api-key': ENV.STACKS_API_KEY,
    },
  });
  const mempoolData = await response.json();
  const result = await broadcastTransaction(tx, network);
  const currentTime = Date.now();
  return {
    txid: result.txid,
    updated_receipt: false,
    receipt_time: currentTime,
    block_time: null,
    delta_time: null,
    mempool_transactions: mempoolData.total,
  };
};

const fetchTransaction = async txid => {
  const response = await fetch(`${ENV.STACKS_API}/extended/v1/tx/${txid}`, {
    headers: {
      'x-api-key': ENV.STACKS_API_KEY,
    },
  });
  return response.json();
};

const get_receipt_time = async transaction => {
  // fetch transaction
  while (true) {
    const fetchedTransaction = await fetchTransaction(transaction.txid);

    if (fetchedTransaction.receipt_time) {
      transaction.updated_receipt = true;
      transaction.receipt_time = fetchedTransaction.receipt_time;
      return transaction;
    }

    // couldn't get receipt time, will use the local time
    if (transaction.block_time) {
      return transaction;
    }

    // If neither receipt_time nor block_time is available, wait and retry
    await wait(1000);
  }
};

const get_block_time = async transaction => {
  const fetchedTransaction = await fetchTransaction(transaction.txid);
  transaction.block_time = fetchedTransaction.block_time;
  console.log(fetchedTransaction);
  return transaction;
};

const broadcast_initial = async () => {
  const txs = [];
  // Read existing transactions from file if it exists
  try {
    const existingData = fs.readFileSync('txs.json', 'utf8');
    txs = JSON.parse(existingData);
  } catch (error) {
    // File doesn't exist or is empty, start with an empty array
    console.log('No existing transactions file found. Starting fresh.');
  }
  let myNonce = await getNextNonce();

  for (let i = 0; i < TRANSACTIONS_TO_RUN; i++) {
    let tx = await stxTransferInit(myNonce);
    myNonce++;
    tx = await get_receipt_time(tx);
    txs.push(tx);
    await wait(bufferTime);
  }

  fs.writeFileSync('txs.json', JSON.stringify(txs, null, 2));
};

const get_block_times = async () => {
  const txs = JSON.parse(fs.readFileSync('txs.json', 'utf8'));
  const new_txs = [];
  // get the receipt time for all transactions
  for (let tx of txs) {
    tx = await get_block_time(tx);
    const delta = tx.block_time - tx.receipt_time;
    tx.delta_time = delta;
    new_txs.push(tx);
  }

  fs.writeFileSync('txs_new.json', JSON.stringify(new_txs, null, 2));
};

// perform operations
const get_statistics = async () => {
  const txs = JSON.parse(fs.readFileSync('txs_new.json', 'utf8'));
  const deltas = [];
  for (const tx of txs) {
    deltas.push(tx.delta_time);
    console.log(tx);
  }

  const min = Math.min(...deltas);
  const max = Math.max(...deltas);
  const average = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const median = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)];

  console.log(`Min: ${min}, Max: ${max}, Average: ${average}, Median: ${median}`);
};

const main = async () => {
  if (INITIAL_RUN === true) {
    await broadcast_initial();
  } else {
    await get_block_times();
    await get_statistics();
  }
};

main();
