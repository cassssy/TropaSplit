import { Client, networks } from './frontend/src/contracts/tropa-split/dist/index.js';
import { Keypair } from '@stellar/stellar-sdk';

async function test() {
  const kp = Keypair.random();
  const address = kp.publicKey();
  console.log("Using address:", address);
  const client = new Client({
    publicKey: address,
    contractId: networks.testnet.contractId,
    networkPassphrase: networks.testnet.networkPassphrase,
    rpcUrl: 'https://soroban-testnet.stellar.org',
  });

  try {
    const tx = await client.init_split({
      payer: address,
      token_contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
    });
    console.log("Success", tx);
  } catch (e) {
    console.error("Error calling init_split:", e);
  }
}

test();
