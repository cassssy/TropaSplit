import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/useWallet';
import * as TropaSplit from '../contracts';
import { SplitMode } from '../contracts';

export default function Home() {
  const navigate = useNavigate();
  const { address, connect, disconnect } = useWallet();
  const [baseAmount, setBaseAmount] = useState('');
  const [serviceCharge, setServiceCharge] = useState('');
  const [people, setPeople] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Toggles
  const [mode, setMode] = useState<SplitMode>(SplitMode.Standard);
  const [ownerIncluded, setOwnerIncluded] = useState<boolean>(true);

  const handleCreateSplit = async () => {
    setErrorMessage(null);

    if (!address) return alert("Please connect your wallet first!");

    const parsedBase = Number(baseAmount);
    const parsedService = Number(serviceCharge);
    const parsedPeople = Number(people);

    if (!Number.isFinite(parsedBase) || parsedBase < 0) {
      setErrorMessage('Enter a valid base amount.');
      return;
    }

    if (!Number.isFinite(parsedService) || parsedService < 0) {
      setErrorMessage('Enter a valid service charge.');
      return;
    }

    if (!Number.isInteger(parsedPeople) || parsedPeople < 2) {
      setErrorMessage('Party size should be at least 2 people.');
      return;
    }
    
    try {
      setIsCreating(true);
      const STROOPS_PER_UNIT = 10000000;
      const baseStroops = BigInt(Math.round(parsedBase * STROOPS_PER_UNIT));
      const serviceStroops = BigInt(Math.round(parsedService * STROOPS_PER_UNIT));
      // TESTNET USDC Address
      const USDC_ADDRESS = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

      // You must provide exactly what the Rust contract expects, plus the network options!
      const tx = await TropaSplit.createSplit(
        {
          payer: address,
          token: USDC_ADDRESS,
          total_bill: baseStroops,
          service_charge: serviceStroops,
          target_people: parsedPeople,
          mode: mode,
          owner_included: ownerIncluded,
        },
        {
          networkPassphrase: "Test SDF Network ; September 2015",
          rpcUrl: "https://soroban-testnet.stellar.org:443",
          publicKey: address,
        }
      );
      
      const splitId = tx.result;
      navigate(`/pay/${splitId}`);
    } catch (error: unknown) {
      console.error("Failed to create split", error);
      const msg = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Could not create the split: ${msg}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSplit = () => {
    setErrorMessage(null);
    const parsedPin = Number(joinPin);
    if (!Number.isInteger(parsedPin) || parsedPin <= 0) {
      setErrorMessage('Enter a valid numeric room PIN.');
      return;
    }

    navigate(`/pay/${parsedPin}`);
  };

  return (
    <div className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Stellar Testnet Split Rooms</p>
          <h1>Split the table bill in one tap.</h1>
          <p className="muted-text">Create a room, share the PIN, and let everyone settle directly to your wallet.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={connect} className="btn btn-secondary">
            {address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
          </button>
          {address && (
            <button onClick={disconnect} className="btn btn-secondary" style={{ backgroundColor: '#ff4d4f', color: 'white', border: 'none' }}>
              Logout
            </button>
          )}
        </div>
      </section>

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      
      <section className="panel">
        <h2>Join a Split</h2>
        <div className="row-actions">
          <input
            className="field-input"
            type="number"
            placeholder="Enter 4-Digit PIN" 
            value={joinPin} 
            onChange={(e) => setJoinPin(e.target.value)}
          />
          <button onClick={handleJoinSplit} className="btn btn-primary">Join Room</button>
        </div>
      </section>

      <section className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ width: '100%', maxWidth: '400px', textAlign: 'left' }}>Create a Split</h2>
        <div className="form-grid" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: '#555' }}>Split Mode</label>
            <select className="field-input" value={mode} onChange={(e) => setMode(parseInt(e.target.value, 10) as SplitMode)}>
              <option value={SplitMode.Standard}>Standard (Everyone pays same)</option>
              <option value={SplitMode.Open}>Open (Friends declare amount)</option>
              <option value={SplitMode.Direct}>Direct (Assign specific amounts)</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.97rem', color: '#333', fontWeight: 500 }}>
              <input type="checkbox" checked={ownerIncluded} onChange={(e) => setOwnerIncluded(e.target.checked)} />
              Include <span style={{fontWeight:600}}>myself</span> on the bill
            </label>
            <span className="muted-text" style={{ fontSize: '0.85rem', marginLeft: '24px', marginTop: '-6px' }}>
              (Uncheck if you are not paying)
            </span>
          </div>

          <input className="field-input" type="number" placeholder="Total Bill (e.g. 100)" onChange={(e) => setBaseAmount(e.target.value)} />
          <input className="field-input" type="number" placeholder="Service Charge (e.g. 10)" onChange={(e) => setServiceCharge(e.target.value)} />
          <input className="field-input" type="number" placeholder="Number of friends (excluding you)" onChange={(e) => setPeople(e.target.value)} />
          <span className="muted-text" style={{ fontSize: '0.85rem', marginLeft: '2px', marginTop: '-8px' }}>
            Enter the number of friends joining. You (the host) are toggled above.
          </span>

          <button onClick={handleCreateSplit} className="btn btn-primary" disabled={isCreating} style={{ marginTop: '10px' }}>
            {isCreating ? 'Creating on Ledger...' : 'Create Room & Get QR'}
          </button>
        </div>
      </section>
    </div>
  );
}