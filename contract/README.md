# tropa-split

A decentralized bill-splitting smart contract built on [Stellar's Soroban](https://soroban.stellar.org) platform. One person (the payer) initializes a split and registers exactly how much each friend owes. Friends can then interact with the contract to pay their share, which automatically routes the specified token amount directly to the payer's wallet while permanently recording the settled debt on-chain.

---

## Features

- **Direct peer-to-peer settlement** — the smart contract does not hold funds; when a friend pays, tokens are transferred instantly and directly to the payer.
- **Immutable debt tracking** — exact amounts owed and payment statuses are stored in persistent on-chain state, creating a trustless ledger for the group.
- **Permissioned registration** — only the authenticated payer who initiated the split can add friends and set their owed amounts, preventing unauthorized modifications.
- **Double-payment prevention** — the contract tracks who has already paid and blocks duplicate settlement attempts.
- **Any-token compatibility** — the contract works with any standard Stellar Soroban token (e.g., USDC, native XLM) defined during initialization.

---

## Payment Lifecycle

| Status | Description |
|---|---|
| `Unregistered` | The friend has not been added to the split yet. Querying their share returns `None`. |
| `Registered / Unpaid` | The payer has assigned an amount to the friend. `has_paid` returns `false`. |
| `Paid` | The friend has successfully called `pay_share`. The payer received the funds. `has_paid` returns `true`. Further payments are blocked. |

---

## Storage Layout

| Key | Type | Scope | Description |
|---|---|---|---|
| `Payer` | `Address` | Instance | The address of the person who paid the bill and receives the funds. |
| `Token` | `Address` | Instance | The token contract used for settling the debts (e.g., USDC). |
| `FriendShare(Address)` | `i128` | Persistent | The specific token amount owed by a registered friend. |
| `HasPaid(Address)` | `bool` | Persistent | Boolean flag tracking if the friend has settled their debt. |

---

## Public Interface

### Setup

#### `init_split`
```rust
pub fn init_split(
    env: Env,
    payer: Address,
    token_contract: Address,
) -> Result<(), SplitError>
```
Initializes the split. Can only be called once per contract deployment.
**Requires:** `payer` authorization.

---

### Management

#### `register_friend`
```rust
pub fn register_friend(
    env: Env,
    payer: Address,
    friend: Address,
    share_amount: i128,
) -> Result<(), SplitError>
```
Registers a friend and the exact amount they owe.
**Requires:** `payer` authorization. Payer must match the address set in `init_split`. `share_amount` must be greater than 0. Cannot register the same friend twice.

---

### Settlement

#### `pay_share`
```rust
pub fn pay_share(env: Env, friend: Address) -> Result<(), SplitError>
```
Allows a registered friend to settle their debt. The contract looks up their assigned `share_amount` and initiates a transfer from the `friend` to the `payer` using the configured `token_contract`.
**Requires:** `friend` authorization. Friend must be registered. Friend must not have already paid.

---

### Queries

| Function | Returns | Description |
|---|---|---|
| `has_paid(env, friend)` | `bool` | Returns `true` if the friend has already paid their share, `false` otherwise. |
| `get_share(env, friend)` | `Option<i128>` | Returns the registered share amount for the friend, or `None` if they are not registered. |

---

## Error Codes (`SplitError`)

| Code | Name | Reason |
|---|---|---|
| `1` | `AlreadyInitialized` | Attempted to call `init_split` on an already configured contract. |
| `2` | `Unauthorized` | Caller does not match the expected authorized address (e.g., non-payer trying to register a friend). |
| `3` | `FriendAlreadyRegistered` | Payer attempted to register an address that is already tracked in this split. |
| `4` | `FriendNotRegistered` | Friend attempted to pay, but no share amount was found for their address. |
| `5` | `InvalidAmount` | Payer attempted to register a share amount of 0 or less. |
| `6` | `AlreadyPaid` | Friend attempted to call `pay_share` after they have already successfully settled. |

---

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) with `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)

```bash
rustup target add wasm32-unknown-unknown
```

### Build

```bash
cargo build --target wasm32-unknown-unknown --release
```

Output:
```
target/wasm32-unknown-unknown/release/tropa_split.wasm
```

### Test

```bash
cargo test
```

---

## Example Walkthrough

### 1. Deploy the contract

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tropa_split.wasm \
  --source deployer --network testnet
```

### 2. Initialize the split
*Setup the contract with Alice as the payer, using a Testnet USDC token.*

```bash
stellar contract invoke \
  --id <CONTRACT_ID> --source alice --network testnet \
  -- init_split \
  --payer <ALICE_ADDRESS> \
  --token_contract <USDC_TOKEN_ADDRESS>
```

### 3. Register a friend
*Alice records that Bob owes her 150.00 USDC (represented as `1500000000` in stroops if using 7 decimals).*

```bash
stellar contract invoke \
  --id <CONTRACT_ID> --source alice --network testnet \
  -- register_friend \
  --payer <ALICE_ADDRESS> \
  --friend <BOB_ADDRESS> \
  --share_amount 1500000000
```

### 4. Friend pays their share
*Bob calls the contract to pay. He must have established a trustline to the token and have sufficient balance. The contract moves the funds to Alice.*

```bash
stellar contract invoke \
  --id <CONTRACT_ID> --source bob --network testnet \
  -- pay_share \
  --friend <BOB_ADDRESS>
```
