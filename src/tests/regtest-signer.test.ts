import { StackingClient } from '@stacks/stacking';
import {
  bitcoindClient,
  getPubKeyHashFromTx,
  getStacksBlock,
  getStacksBlockHeight,
  isInPreparePhase,
  stacksNetwork,
  waitForBurnBlockHeight,
  waitForNetwork,
  waitForNextCycle,
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

test('signer rollover', async () => {
  // TEST CASE
  // some signers are active 3/5 (stacking)
  // we start two additional signers 5/5 (stacking)

  const client = new StackingClient('', stacksNetwork());

  // ===========================================================================
  // CYCLE 8:
  await waitForBurnBlockHeight(165);
  expect((await client.getPoxInfo()).reward_cycle_id).toBe(8);

  // we're still in the reward phase
  let info = await client.getPoxInfo();
  expect(isInPreparePhase(info.current_burnchain_block_height as number, info)).toBe(false);

  // cycle 8 (reward phase)
  // stacker script should have stacked until 9
  const cycle8 = await getStacksBlock();
  console.log('cycle: 8; stx height:', cycle8.height, cycle8.hash);

  // shut off stackers (still in cycle 8)
  console.log('shutting off stackers; stx height:', await getStacksBlockHeight());
  await regtestComposeDown('stacker');
  console.log('shut off all stackers; stx height:', await getStacksBlockHeight());

  // ===========================================================================
  // CYCLE 9: original signers can take on cycle 9
  await waitForNextCycle(await client.getPoxInfo());
  expect((await client.getPoxInfo()).reward_cycle_id).toBe(9);

  // we're still in the reward phase
  info = await client.getPoxInfo();
  expect(isInPreparePhase(info.current_burnchain_block_height as number, info)).toBe(false);

  // cycle 9 (reward phase)
  const cycle9 = await getStacksBlock();
  console.log('cycle: 9; stx height:', cycle9.height, cycle9.hash);

  // wait for a few blocks to make sure signers can sign cycle 9
  info = await client.getPoxInfo();
  await waitForBurnBlockHeight((info.current_burnchain_block_height as number) + 5);
  // todo: make sure signer set is working

  // check pox is active
  info = await client.getPoxInfo();
  expect(info.current_cycle.is_pox_active).toBe(true);

  // power up new stackers (in cycle 9)
  console.log('powering up new stackers; stx height:', await getStacksBlockHeight());
  console.log(await regtestComposeUp('stacker', '--env-file .env-signers-5'));
  console.log('powered up new stackers;  stx height:', await getStacksBlockHeight());

  // ===========================================================================
  // CYCLE 10: new stackers take on cycle 10
  await waitForNextCycle(await client.getPoxInfo());
  expect((await client.getPoxInfo()).reward_cycle_id).toBe(10);

  // we're still in the reward phase
  info = await client.getPoxInfo();
  expect(isInPreparePhase(info.current_burnchain_block_height as number, info)).toBe(false);

  // cycle 10 (reward phase)
  const cycle10 = await getStacksBlock();
  console.log('cycle: 10; stx height:', cycle10.height, cycle10.hash);

  // check pox is active
  info = await client.getPoxInfo();
  expect(info.current_cycle.is_pox_active).toBe(true);

  // ===========================================================================
  // make sure 2 cycles from now everything still works
  await waitForNextCycle(await client.getPoxInfo());
  await waitForNextCycle(await client.getPoxInfo());

  // todo: check signer set is different
});

// import * as P from 'micro-packed';
// import { sha512_256 } from '@noble/hashes/sha2';

// export type BitVec = {
//   length: number;
//   bytes: Uint8Array;
// };

// function dataLen(_len: number) {
//   const len = BigInt(_len);
//   const extra = len % 8n === 0n ? 0n : 1n;
//   return len / 8n + extra;
// }

// export const BitVecCoder = P.wrap({
//   encodeStream: (w: P.Writer, data: BitVec) => {
//     // const len = data.length;
//     P.U16BE.encodeStream(w, data.length);
//     P.U32BE.encodeStream(w, data.bytes.length);
//     w.bytes(data.bytes);
//   },
//   decodeStream: (r: P.Reader) => {
//     const len = P.U16BE.decodeStream(r);
//     // console.log("len", len);
//     const bytesLen = dataLen(len);
//     // console.log("bytesLen", bytesLen);
//     const bytes = P.bytes(P.U32BE).decodeStream(r);
//     return {
//       length: len,
//       bytes,
//     };
//   },
// });

// export const SignerMessageTypePrefix = {
//   /// Block Proposal message from miners
//   BlockProposal: 0,
//   /// Block Response message from signers
//   BlockResponse: 1,
//   /// Block Pushed message from miners
//   BlockPushed: 2,
//   /// Mock block proposal message from Epoch 2.5 miners
//   MockProposal: 3,
//   /// Mock block signature message from Epoch 2.5 signers
//   MockSignature: 4,
//   /// Mock block message from Epoch 2.5 miners
//   MockBlock: 5,
// } as const;

// export type SignerMessageTypeId =
//   (typeof SignerMessageTypePrefix)[keyof typeof SignerMessageTypePrefix];

// export function TypeIdCoder<T extends SignerMessageTypeId>(id: T): P.CoderType<T> {
//   return P.wrap({
//     encodeStream: (w: P.Writer, value: T) => w.byte(value),
//     decodeStream: (r: P.Reader): T => {
//       const value = r.byte();
//       return value as T;
//     },
//     validate: (value: T) => {
//       if (typeof value !== 'number') throw new Error(`TypeIdCoder: invalid value ${value}`);
//       if (value !== id) throw new Error(`TypeIdCoder: invalid value ${value}`);
//       return value;
//     },
//   });
// }

// export const _TypeIdCoder = (id: SignerMessageTypeId): P.CoderType<SignerMessageTypeId> =>
//   P.wrap({
//     encodeStream: (w: P.Writer, value: SignerMessageTypeId) => w.byte(value),
//     decodeStream: (r: P.Reader): SignerMessageTypeId => {
//       const value = r.byte();
//       return value as SignerMessageTypeId;
//     },
//     validate: (value: SignerMessageTypeId) => {
//       if (typeof value !== 'number') throw new Error(`TypeIdCoder: invalid value ${value}`);
//       if (value !== id) throw new Error(`TypeIdCoder: invalid value ${value}`);
//       return value;
//     },
//   });

// export const MockProposalCoder = P.struct({
//   typeId: TypeIdCoder(SignerMessageTypePrefix.MockProposal),
//   burnBlockHeight: P.U64BE,
//   consensusHash: P.bytes(20),
//   stacksTip: P.bytes(32),
//   stacksHeight: P.U64BE,
//   server: P.prefix(P.U8, P.string(null)),
//   poxConsensus: P.bytes(20),
//   chainId: P.U32BE,
//   signature: P.bytes(65),
// });

// export const MockBlockCoder = P.struct({
//   typeId: TypeIdCoder(SignerMessageTypePrefix.MockBlock),
//   proposal: MockProposalCoder,
//   signatures: P.array(P.U32BE, P.bytes(65)),
//   rest: P.bytes(null),
// });

// export const BlockProposalCoder = P.struct({
//   typeId: TypeIdCoder(SignerMessageTypePrefix.BlockProposal),
//   blockVersion: P.U8,
//   chainLength: P.U64BE,
//   burnSpent: P.U64BE,
//   consensusHash: P.bytes(20),
//   parentBlockId: P.bytes(32),
//   txMerkleRoot: P.bytes(32),
//   stateRoot: P.bytes(32),
//   timestamp: P.U64BE,
//   minerSignature: P.bytes(65),
//   signerSignature: P.array(P.U32BE, P.bytes(65)),
//   bitvec: BitVecCoder,
//   // txs
//   // burn height
//   // reward cycle
//   rest: P.bytes(null),
// });

// export const BlockPushedCoder = P.struct({
//   typeId: TypeIdCoder(SignerMessageTypePrefix.BlockPushed),
//   blockVersion: P.U8,
//   chainLength: P.U64BE,
//   burnSpent: P.U64BE,
//   consensusHash: P.bytes(20),
//   parentBlockId: P.bytes(32),
//   txMerkleRoot: P.bytes(32),
//   stateRoot: P.bytes(32),
//   timestamp: P.U64BE,
//   minerSignature: P.bytes(65),
//   signerSignature: P.array(P.U32BE, P.bytes(65)),
//   bitvec: BitVecCoder,
//   // txs
//   rest: P.bytes(null),
// });

// export const SignerSignatureHashCoder = P.struct({
//   blockVersion: P.U8,
//   chainLength: P.U64BE,
//   burnSpent: P.U64BE,
//   consensusHash: P.bytes(20),
//   parentBlockId: P.bytes(32),
//   txMerkleRoot: P.bytes(32),
//   stateRoot: P.bytes(32),
//   timestamp: P.U64BE,
//   minerSignature: P.bytes(65),
//   bitvec: BitVecCoder,
// });

// export const InverseBoolCoder: P.CoderType<boolean> = /* @__PURE__ */ P.wrap({
//   size: 1,
//   encodeStream: (w: P.Writer, value: boolean) => w.byte(value ? 0 : 1),
//   decodeStream: (r: P.Reader): boolean => {
//     const value = r.byte();
//     if (value !== 0 && value !== 1) throw r.err(`bool: invalid value ${value}`);
//     return value === 0;
//   },
//   validate: value => {
//     if (typeof value !== 'boolean') throw new Error(`bool: invalid value ${value}`);
//     return value;
//   },
// });

// export const BlockResponseAcceptedCoder = P.struct({
//   typeId: TypeIdCoder(SignerMessageTypePrefix.BlockResponse),
//   accepted: InverseBoolCoder,
//   signerSignatureHash: P.bytes(32),
//   signature: P.bytes(65),
// });

// export const BlockResponseRejectedCoder = P.struct({
//   typeId: TypeIdCoder(SignerMessageTypePrefix.BlockResponse),
//   accepted: InverseBoolCoder,
//   reason: P.prefix(P.U32BE, P.string(null)),
//   reason_code: P.U8,
//   signerSignatureHash: P.bytes(32),
//   chain_id: P.U32BE,
//   signature: P.bytes(65),
// });

// export type MockBlock = P.UnwrapCoder<typeof MockBlockCoder>;
// export type MockProposal = P.UnwrapCoder<typeof MockProposalCoder>;
// export type BlockProposal = P.UnwrapCoder<typeof BlockProposalCoder>;
// export type BlockResponseAccepted = P.UnwrapCoder<typeof BlockResponseAcceptedCoder>;
// export type BlockResponseRejected = P.UnwrapCoder<typeof BlockResponseRejectedCoder>;
// export type BlockPushed = P.UnwrapCoder<typeof BlockPushedCoder>;

// export type NakamotoBlock = Omit<BlockPushed, 'rest' | 'typeId'>;

// export function chunkTypeName(chunk: Uint8Array) {
//   const type = chunk[0];
//   return Object.keys(SignerMessageTypePrefix)[type];
// }

// export type DecodedChunk = ReturnType<typeof decodeChunk>;

// export function decodeChunk(chunk: Uint8Array) {
//   const type = chunk[0];
//   // console.log(Object.keys(SignerMessageTypePrefix));
//   // console.log("Type: ", type);
//   // console.log(Object.keys(SignerMessageTypePrefix)[type]);
//   if (type === SignerMessageTypePrefix.MockBlock) {
//     return MockBlockCoder.decode(chunk);
//   }
//   if (type === SignerMessageTypePrefix.MockProposal) {
//     return MockProposalCoder.decode(chunk);
//   }
//   if (type === SignerMessageTypePrefix.BlockResponse) {
//     const accepted = chunk[1];
//     if (accepted === 0) {
//       return BlockResponseAcceptedCoder.decode(chunk);
//     }
//     return BlockResponseRejectedCoder.decode(chunk);
//   }
//   if (type === SignerMessageTypePrefix.BlockProposal) {
//     const { rest: remaining, ...proposal } = BlockProposalCoder.decode(chunk);
//     const withoutTxs = remaining.slice(-16);
//     const extra = P.struct({
//       blockHeight: P.U64BE,
//       rewardCycle: P.U64BE,
//     }).decode(withoutTxs);
//     return {
//       ...proposal,
//       blockHeight: extra.blockHeight,
//       rewardCycle: extra.rewardCycle,
//     };
//   }
//   if (type === SignerMessageTypePrefix.BlockPushed) {
//     return BlockPushedCoder.decode(chunk);
//   }
//   throw new Error(`Unknown type: ${type} (${Object.keys(SignerMessageTypePrefix)[type]})`);
// }

// export function makeSignerSignatureHash(block: Omit<NakamotoBlock, 'signer_signature_hash'>) {
//   const message = SignerSignatureHashCoder.encode(block);
//   return sha512_256(message);
// }
