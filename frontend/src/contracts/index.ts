/**
 * Wrapper around the generated Soroban contract bindings.
 * Adapts the real contract interface to match the expected API.
 */

import { requestAccess, signTransaction } from '@stellar/freighter-api';
// Import from the src folder to allow Vite to compile it natively
import { Client, networks, SplitMode } from './tropa-split/src/index';
import type { SplitConfig } from './tropa-split/src/index';
import { TransactionBuilder, rpc } from '@stellar/stellar-sdk';

// Export these for use in UI components
export { SplitMode };
export type { SplitConfig };

// Token contract: native XLM or USDC
const TOKEN_CONTRACT_ID = import.meta.env.VITE_USDC_CONTRACT_ID || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

// Testnet config
const TESTNET = networks.testnet;
const RPC_URL = import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org:443';
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || TESTNET.networkPassphrase;

type FreighterSignResult =
  | string
  | {
      error?: string;
      signedTxXdr?: string;
      signedTransaction?: string;
      transaction?: string;
    };


async function signAndSubmit(tx: any): Promise<void> {
  const passphrase = NETWORK_PASSPHRASE;

  // 1. Get raw XDR from the simulated transaction
  const rawXdr = tx.built.toXDR();

  // 2. Request Freighter signature
  const res = await signTransaction(rawXdr, { networkPassphrase: passphrase });
  
  // Handle different Freighter API return types safely
  const signedXdrStr = typeof res === 'string' ? res : res.signedTxXdr;
  
  if (!signedXdrStr) {
    throw new Error('Transaction was not signed by Freighter');
  }

  // 3. Convert the returned base64 string back to a valid Transaction object
  const signedTx = TransactionBuilder.fromXDR(signedXdrStr, passphrase);

  // 4. Submit directly to the RPC
  const server = new rpc.Server(RPC_URL);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendResponse = await server.sendTransaction(signedTx as any);

  if (sendResponse.status !== 'PENDING') {
    throw new Error(`Sending the transaction failed!\n${JSON.stringify(sendResponse)}`);
  }

  // 5. Poll the network manually (bypasses the buggy SDK parser)
  let status = sendResponse.status as string;
  while (status === 'PENDING') {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    const pollResponse = await server.getTransaction(sendResponse.hash);
    status = pollResponse.status;
    
    if (status === 'FAILED') {
      console.error("🚨 On-chain failure details:", pollResponse);
      throw new Error("Transaction failed on the ledger! Check console for details.");
    }
  }
}

// Initialize a Soroban client with Freighter wallet integration.
export async function getFreighterClient(overrides?: { networkPassphrase?: string; rpcUrl?: string; publicKey?: string; }): Promise<Client> {
  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new Error('Freighter wallet access required');
  }

  const publicKey = overrides?.publicKey || access.address;
  const networkPassphrase = overrides?.networkPassphrase || NETWORK_PASSPHRASE;
  const rpcUrl = overrides?.rpcUrl || RPC_URL;

  return new Client({
    publicKey,
    contractId: import.meta.env.VITE_CONTRACT_ID || TESTNET.contractId,
    networkPassphrase,
    rpcUrl,
    allowHttp: true,
    signTransaction: async (xdr: string, opts?: any) => {
      const res = (await signTransaction(xdr, { networkPassphrase, ...opts })) as any;
      console.log("Freighter signTransaction response:", res);

      if (typeof res === 'string') return res;
      if (res.error) throw new Error(res.error);
      return res.signedTxXdr;
    }
  });
}

/**
 * Create a split on-chain.
 */
export async function createSplit(input: {
  payer: string;
  token: string;
  total_bill: bigint;
  service_charge: bigint;
  target_people: number;
  mode: SplitMode;
  owner_included: boolean;
}, networkOverrides?: { networkPassphrase?: string; rpcUrl?: string; publicKey?: string; }): Promise<{ result: number }> {
  const client = await getFreighterClient(networkOverrides);

  // 1. Simulates the transaction on the network
  const tx = await client.create_split({
    payer: input.payer,
    token: input.token || TOKEN_CONTRACT_ID,
    total_bill: input.total_bill,
    service_charge: input.service_charge,
    target_people: input.target_people,
    mode: input.mode as unknown as number,
    owner_included: input.owner_included,
  });

  // Intercept and log simulation failures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = (tx as any).simulation;
  if (sim && sim.error) {
    console.error("🚨 REAL SOROBAN ERROR:", sim);
    throw new Error("Transaction simulation failed on the network. Check console.");
  }

  // 2. Extract the simulated split ID
  const splitId = tx.result;

  // 3. Manually sign, submit, and confirm
  await signAndSubmit(tx);

  // 4. Return the ID so the UI can route to the room
  return { result: splitId };
}
/**
 * Get split info (on-chain state).
 */
export async function getSplitInfo(input: { split_id: number }): Promise<{
  result: SplitConfig & { paid_count: number };
}> {
  const client = await getFreighterClient();

  const splitReq = await client.get_split({ split_id: input.split_id });
  const splitRes = splitReq.result;
  if (!splitRes) throw new Error("Could not find split");
  
  if (splitRes.isErr()) {
      throw new Error("Split not found");
  }
  const config = splitRes.unwrap();

  const countReq = await client.get_paid_count({ split_id: input.split_id });
  const count = countReq.result || 0;

  return {
    result: {
      ...config,
      paid_count: count,
    },
  };
}

/**
 * Check if a specific address has paid
 */
export async function hasAddressPaid(input: { split_id: number, friend: string }): Promise<boolean> {
  const client = await getFreighterClient();
  const req = await client.has_address_paid({ split_id: input.split_id, addr: input.friend });
  return req.result || false;
}

/**
 * Get the list of addresses in the lobby
 */
export async function getLobby(input: { split_id: number }): Promise<string[]> {
  const client = await getFreighterClient();
  const req = await client.get_lobby({ split_id: input.split_id });
  return req.result || [];
}
/**
 * Get the name associated with an address in the lobby
 */
export async function getParticipantName(input: { split_id: number, friend: string }): Promise<string | null> {
  const client = await getFreighterClient();
  const req = await client.get_participant_name({ split_id: input.split_id, friend: input.friend });
  
  // Option<T> natively returns T | undefined in the JS SDK. No unwrap() needed.
  return req.result !== undefined ? req.result : null;
}

/**
 * Get the assigned amount for an address
 */
export async function getAssignedAmount(input: { split_id: number, friend: string }): Promise<bigint | null> {
  const client = await getFreighterClient();
  const req = await client.get_assigned_amount({ split_id: input.split_id, friend: input.friend });
  
  // Option<T> natively returns T | undefined in the JS SDK. No unwrap() needed.
  return req.result !== undefined ? req.result : null;
}
/**
 * Register a friend into the lobby
 */
export async function registerParticipant(input: { split_id: number, friend: string, name: string }): Promise<void> {
  const client = await getFreighterClient();
  const tx = await client.register_participant({
    split_id: input.split_id,
    friend: input.friend,
    name: input.name,
  });
  
  await signAndSubmit(tx);
}

/**
 * Owner assigns amounts to friends in the lobby
 */
export async function assignAmounts(input: { split_id: number, amounts: Map<string, bigint> }): Promise<void> {
  const client = await getFreighterClient();
  const tx = await client.assign_amounts({
    split_id: input.split_id,
    amounts: input.amounts,
  });
  await signAndSubmit(tx);
}

/**
 * Pay your share of the split.
 */
export async function joinAndPay(input: {
  split_id: number;
  friend: string;
  custom_amount?: bigint;
}): Promise<{ result: true }> {
  const client = await getFreighterClient();

  const tx = await client.pay_share({
    split_id: input.split_id,
    friend: input.friend,
    custom_amount: input.custom_amount || 0n,
  });

  await signAndSubmit(tx);

  return { result: true };
}
