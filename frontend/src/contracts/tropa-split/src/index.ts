import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
// export * from "@stellar/stellar-sdk";
// export * as contract from "@stellar/stellar-sdk/contract";
// export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CA6GQTASFPVFE5HTZD3NK6PUMKOTHGDSUDLXRNZZAVTPNOEQEXDZGDO2",
  }
} as const

export const Errors = {
  1: {message:"SplitNotFound"},
  2: {message:"AlreadyPaid"},
  3: {message:"InvalidAmount"},
  4: {message:"InvalidName"},
  5: {message:"Unauthorized"},
  6: {message:"NotAssigned"},
  7: {message:"AlreadyRegistered"}
}

export type DataKey = {tag: "Counter", values: void} | {tag: "Config", values: readonly [u32]} | {tag: "PaidCount", values: readonly [u32]} | {tag: "Lobby", values: readonly [u32]} | {tag: "ParticipantName", values: readonly [u32, string]} | {tag: "AssignedAmount", values: readonly [u32, string]} | {tag: "PaidAddr", values: readonly [u32, string]};

export enum SplitMode {
  Standard = 0,
  Open = 1,
  Direct = 2,
}


export interface SplitConfig {
  mode: SplitMode;
  owner_included: boolean;
  payer: string;
  service_charge: i128;
  target_people: u32;
  token: string;
  total_bill: i128;
}

export interface Client {
  /**
   * Construct and simulate a get_lobby transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the list of lobby participants
   */
  get_lobby: ({split_id}: {split_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gets the split configuration
   */
  get_split: ({split_id}: {split_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<SplitConfig>>>

  /**
   * Construct and simulate a pay_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays a share of the split.
   * - For Standard mode: `custom_amount` is ignored.
   * - For Open mode: `custom_amount` must be provided.
   * - For Direct mode: `custom_amount` is ignored (uses AssignedAmount).
   */
  pay_share: ({split_id, friend, custom_amount}: {split_id: u32, friend: string, custom_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a new split and returns the generated split_id
   */
  create_split: ({payer, token, total_bill, service_charge, target_people, mode, owner_included}: {payer: string, token: string, total_bill: i128, service_charge: i128, target_people: u32, mode: u32, owner_included: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a assign_amounts transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Assign amounts to participants in the lobby (Callable only by payer)
   */
  assign_amounts: ({split_id, amounts}: {split_id: u32, amounts: Map<string, i128>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_paid_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gets the number of people who have paid
   */
  get_paid_count: ({split_id}: {split_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a has_address_paid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Checks if an address has paid
   */
  has_address_paid: ({split_id, addr}: {split_id: u32, addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_assigned_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the assigned amount for a participant
   */
  get_assigned_amount: ({split_id, friend}: {split_id: u32, friend: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<i128>>>

  /**
   * Construct and simulate a get_participant_name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the name of a participant
   */
  get_participant_name: ({split_id, friend}: {split_id: u32, friend: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a register_participant transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a participant in the lobby (Direct Mode)
   */
  register_participant: ({split_id, friend, name}: {split_id: u32, friend: string, name: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAANU3BsaXROb3RGb3VuZAAAAAAAAAEAAAAAAAAAC0FscmVhZHlQYWlkAAAAAAIAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAADAAAAAAAAAAtJbnZhbGlkTmFtZQAAAAAEAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAAFAAAAAAAAAAtOb3RBc3NpZ25lZAAAAAAGAAAAAAAAABFBbHJlYWR5UmVnaXN0ZXJlZAAAAAAAAAc=",
        "AAAAAAAAACJHZXQgdGhlIGxpc3Qgb2YgbG9iYnkgcGFydGljaXBhbnRzAAAAAAAJZ2V0X2xvYmJ5AAAAAAAAAQAAAAAAAAAIc3BsaXRfaWQAAAAEAAAAAQAAA+oAAAAT",
        "AAAAAAAAABxHZXRzIHRoZSBzcGxpdCBjb25maWd1cmF0aW9uAAAACWdldF9zcGxpdAAAAAAAAAEAAAAAAAAACHNwbGl0X2lkAAAABAAAAAEAAAPpAAAH0AAAAAtTcGxpdENvbmZpZwAAAAAD",
        "AAAAAAAAAMNQYXlzIGEgc2hhcmUgb2YgdGhlIHNwbGl0LgotIEZvciBTdGFuZGFyZCBtb2RlOiBgY3VzdG9tX2Ftb3VudGAgaXMgaWdub3JlZC4KLSBGb3IgT3BlbiBtb2RlOiBgY3VzdG9tX2Ftb3VudGAgbXVzdCBiZSBwcm92aWRlZC4KLSBGb3IgRGlyZWN0IG1vZGU6IGBjdXN0b21fYW1vdW50YCBpcyBpZ25vcmVkICh1c2VzIEFzc2lnbmVkQW1vdW50KS4AAAAACXBheV9zaGFyZQAAAAAAAAMAAAAAAAAACHNwbGl0X2lkAAAABAAAAAAAAAAGZnJpZW5kAAAAAAATAAAAAAAAAA1jdXN0b21fYW1vdW50AAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAAB0NvdW50ZXIAAAAAAQAAAAAAAAAGQ29uZmlnAAAAAAABAAAABAAAAAEAAAAAAAAACVBhaWRDb3VudAAAAAAAAAEAAAAEAAAAAQAAAAAAAAAFTG9iYnkAAAAAAAABAAAABAAAAAEAAAAAAAAAD1BhcnRpY2lwYW50TmFtZQAAAAACAAAABAAAABMAAAABAAAAAAAAAA5Bc3NpZ25lZEFtb3VudAAAAAAAAgAAAAQAAAATAAAAAQAAAAAAAAAIUGFpZEFkZHIAAAACAAAABAAAABM=",
        "AAAAAwAAAAAAAAAAAAAACVNwbGl0TW9kZQAAAAAAAAMAAAAAAAAACFN0YW5kYXJkAAAAAAAAAAAAAAAET3BlbgAAAAEAAAAAAAAABkRpcmVjdAAAAAAAAg==",
        "AAAAAAAAADZDcmVhdGVzIGEgbmV3IHNwbGl0IGFuZCByZXR1cm5zIHRoZSBnZW5lcmF0ZWQgc3BsaXRfaWQAAAAAAAxjcmVhdGVfc3BsaXQAAAAHAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAKdG90YWxfYmlsbAAAAAAACwAAAAAAAAAOc2VydmljZV9jaGFyZ2UAAAAAAAsAAAAAAAAADXRhcmdldF9wZW9wbGUAAAAAAAAEAAAAAAAAAARtb2RlAAAABAAAAAAAAAAOb3duZXJfaW5jbHVkZWQAAAAAAAEAAAABAAAABA==",
        "AAAAAQAAAAAAAAAAAAAAC1NwbGl0Q29uZmlnAAAAAAcAAAAAAAAABG1vZGUAAAfQAAAACVNwbGl0TW9kZQAAAAAAAAAAAAAOb3duZXJfaW5jbHVkZWQAAAAAAAEAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAOc2VydmljZV9jaGFyZ2UAAAAAAAsAAAAAAAAADXRhcmdldF9wZW9wbGUAAAAAAAAEAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACnRvdGFsX2JpbGwAAAAAAAs=",
        "AAAAAAAAAERBc3NpZ24gYW1vdW50cyB0byBwYXJ0aWNpcGFudHMgaW4gdGhlIGxvYmJ5IChDYWxsYWJsZSBvbmx5IGJ5IHBheWVyKQAAAA5hc3NpZ25fYW1vdW50cwAAAAAAAgAAAAAAAAAIc3BsaXRfaWQAAAAEAAAAAAAAAAdhbW91bnRzAAAAA+wAAAATAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAACdHZXRzIHRoZSBudW1iZXIgb2YgcGVvcGxlIHdobyBoYXZlIHBhaWQAAAAADmdldF9wYWlkX2NvdW50AAAAAAABAAAAAAAAAAhzcGxpdF9pZAAAAAQAAAABAAAABA==",
        "AAAAAAAAAB1DaGVja3MgaWYgYW4gYWRkcmVzcyBoYXMgcGFpZAAAAAAAABBoYXNfYWRkcmVzc19wYWlkAAAAAgAAAAAAAAAIc3BsaXRfaWQAAAAEAAAAAAAAAARhZGRyAAAAEwAAAAEAAAAB",
        "AAAAAAAAAClHZXQgdGhlIGFzc2lnbmVkIGFtb3VudCBmb3IgYSBwYXJ0aWNpcGFudAAAAAAAABNnZXRfYXNzaWduZWRfYW1vdW50AAAAAAIAAAAAAAAACHNwbGl0X2lkAAAABAAAAAAAAAAGZnJpZW5kAAAAAAATAAAAAQAAA+gAAAAL",
        "AAAAAAAAAB1HZXQgdGhlIG5hbWUgb2YgYSBwYXJ0aWNpcGFudAAAAAAAABRnZXRfcGFydGljaXBhbnRfbmFtZQAAAAIAAAAAAAAACHNwbGl0X2lkAAAABAAAAAAAAAAGZnJpZW5kAAAAAAATAAAAAQAAA+gAAAAR",
        "AAAAAAAAADFSZWdpc3RlciBhIHBhcnRpY2lwYW50IGluIHRoZSBsb2JieSAoRGlyZWN0IE1vZGUpAAAAAAAAFHJlZ2lzdGVyX3BhcnRpY2lwYW50AAAAAwAAAAAAAAAIc3BsaXRfaWQAAAAEAAAAAAAAAAZmcmllbmQAAAAAABMAAAAAAAAABG5hbWUAAAARAAAAAQAAA+kAAAPtAAAAAAAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_lobby: this.txFromJSON<Array<string>>,
        get_split: this.txFromJSON<Result<SplitConfig>>,
        pay_share: this.txFromJSON<Result<void>>,
        create_split: this.txFromJSON<u32>,
        assign_amounts: this.txFromJSON<Result<void>>,
        get_paid_count: this.txFromJSON<u32>,
        has_address_paid: this.txFromJSON<boolean>,
        get_assigned_amount: this.txFromJSON<Option<i128>>,
        get_participant_name: this.txFromJSON<Option<string>>,
        register_participant: this.txFromJSON<Result<void>>
  }
}