Here is the brand new `README.md` that perfectly matches the new Kahoot-style architecture we just built. It replaces the old instructions with everything you need for both the smart contract and the Vite frontend. 

### 1. Your New `README.md`
Copy this and paste it into the `README.md` file at the root of your project:

```markdown
# 🍕 Tropa Split

A decentralized, instant bill-splitting dApp built on [Stellar's Soroban](https://soroban.stellar.org) platform. No more tracking down friends for payment or manually typing in who owes what. Just create a room, share a PIN or QR code, and let your friends pay their exact share instantly.

---

## What It Is

Tropa Split works like Kahoot for bill splitting:
1. The payer inputs the **Total Bill**, the **Service Charge**, and the **Party Size**.
2. The smart contract generates a **4-digit PIN** (Room ID) and a **QR code**.
3. Friends scan the QR code at the table or enter the PIN on the website.
4. The contract automatically calculates their exact share and routes the token payment directly to the payer's wallet.

---

## Features

- **Instant Join & Pay:** No manual debt assignment needed. The contract does the math automatically.
- **Kahoot-Style Rooms:** Multiple splits are handled simultaneously through unique Room PINs (`split_id`).
- **QR Code Integration:** Mobile-friendly. Friends just scan the code to jump straight to the payment page.
- **Direct Peer-to-Peer Settlement:** The smart contract does not hold funds. Tokens are transferred instantly and directly to the payer.
- **Capacity Enforcement:** The room automatically locks once the target number of people have paid, preventing overpayments.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Rust + Soroban SDK |
| Blockchain | Stellar (Testnet) |
| Frontend | Vite + React + TypeScript |
| Wallet | Freighter Browser Extension |

---

## Running Locally

### Prerequisites
- Install [Rust](https://www.rust-lang.org/tools/install) and add the WebAssembly target: `rustup target add wasm32-unknown-unknown`
- Install [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)
- Install [Node.js](https://nodejs.org/) (v18+)
- Install the [Freighter Wallet](https://freighter.app/) extension in your browser

### 1. Build and Deploy the Contract
```bash
cd contract

# Build the optimized WASM file
cargo build --target wasm32-unknown-unknown --release

# Deploy to the Stellar Testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tropa_split.wasm \
  --source default \
  --network testnet
```
*(Save the `CONTRACT_ID` that the terminal prints out!)*

### 2. Connect the Frontend
```bash
cd ../frontend

# Generate the TypeScript bindings (Replace <YOUR_CONTRACT_ID> with the ID from above)
stellar contract bindings typescript \
  --network testnet \
  --contract-id <YOUR_CONTRACT_ID> \
  --output-dir src/contracts/tropa-split \
  --overwrite
```

### 3. Run the App
```bash
# Install frontend dependencies
npm install

# Start the Vite server
npm run dev
```

Open `http://localhost:5173` in your browser to start splitting bills!
```

---

### 2. How to Work It (Step-by-Step Guide)

To actually test this out locally and see it working on your machine, follow these steps:

**Step 1: Setup your Freighter Wallet**
1. Open your Freighter browser extension and make sure the network is set to **Testnet** (click the gear icon > Preferences > Network > Testnet).
2. Go to the [Stellar Laboratory Friendbot](https://laboratory.stellar.org/#txbuilder?network=test) or just look for the "Fund with Friendbot" button inside Freighter to get some free fake Testnet XLM. 

**Step 2: Deploy & Generate**
1. Open your terminal, navigate to the `contract` folder, and run the two commands under the **Build and Deploy the Contract** section in the README. 
2. Copy the `C...` string it spits out (that's your contract ID).
3. Navigate to the `frontend` folder in your terminal and run the `stellar contract bindings` command, pasting your contract ID at the end. This magically creates the `src/contracts/tropa-split` folder with all your backend logic!

**Step 3: Run the App**
1. Inside the `frontend` folder, run `npm install` and then `npm run dev`.
2. Click the `http://localhost:5173` link in your terminal.
3. Click **Connect Wallet** in the top right.
4. Type in `1000` for the bill, `100` for service charge, and `5` for people, then click **Create Room**.
5. It will take you to the payment page and generate the QR code! (You will see Freighter pop up asking you to sign the transaction to create the room).

Let me know if you hit any bumps while running those terminal commands!