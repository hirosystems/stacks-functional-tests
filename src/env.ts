import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

const schema = Type.Object({
  STACKS_CHAIN: Type.Enum({ mainnet: 'mainnet', testnet: 'testnet' }),
  /* STX address of the issuer of all transactions we will be testing */
  SENDER_STX_ADDRESS: Type.String(),
  /* `SENDER_STX_ADDRESS`'s hex private key */
  SENDER_KEY: Type.String(),
  /* STX address of the receiver of any sent tokens */
  RECEIVER_STX_ADDRESS: Type.String(),

  /* Stacks Blockchain API host */
  STACKS_API_HOST: Type.String(),
  /* Stacks Blockchain API port */
  STACKS_API_PORT: Type.Integer(),
  /* Stacks node host */
  STACKS_NODE_HOST: Type.String(),
  /* Stacks node port */
  STACKS_NODE_PORT: Type.Integer(),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  schema: schema,
  dotenv: true,
});
