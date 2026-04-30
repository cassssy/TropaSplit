import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/useWallet';
import * as TropaSplit from '../contracts';
import { SplitMode } from '../contracts';
import type { SplitConfig } from '../contracts';

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

  // Recent Rooms
  const [recentRooms, setRecentRooms] = useState<{ id: number, data: SplitConfig | null }[]>([]);

  useEffect(() => {
    const fetchRecent = async () => {
      const saved = JSON.parse(localStorage.getItem('tropa_splits') || '[]');
      const loaded = [];
      for (const id of saved.slice(0, 5)) {
        try {
          const info = await TropaSplit.getSplitInfo({ split_id: id });
          loaded.push({ id, data: info.result as SplitConfig });
        } catch {
          loaded.push({ id, data: null });
        }
      }
      setRecentRooms(loaded);
    };
    fetchRecent();
  }, []);

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

    if (!Number.isInteger(parsedPeople) || parsedPeople < 1) {
      setErrorMessage('You need at least 1 friend to split with.');
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
      const savedSplits = JSON.parse(localStorage.getItem('tropa_splits') || '[]');
      if (!savedSplits.includes(splitId)) {
        localStorage.setItem('tropa_splits', JSON.stringify([splitId, ...savedSplits]));
      }
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
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={connect} className="btn btn-primary" style={{ padding: '10px 20px', fontWeight: 500 }}>
            {address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
          </button>
          {address && (
            <button onClick={disconnect} className="btn" style={{ padding: '10px 20px', backgroundColor: '#fecaca', color: '#7f1d1d', border: '1px solid #fca5a5', fontWeight: 500, cursor: 'pointer' }}>
              Logout
            </button>
          )}
        </div>
      </section>

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

      {recentRooms.length > 0 && (
        <section className="panel">
          <h2 style={{ marginBottom: '15px' }}>Recent Rooms</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {recentRooms.map(room => (
              <div 
                key={room.id} 
                onClick={() => navigate(`/pay/${room.id}`)}
                style={{ 
                  padding: '14px',
                  backgroundColor: '#f8fafc',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#eff6ff';
                  (e.currentTarget as HTMLElement).style.borderColor = '#0284c7';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc';
                  (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }}
              >
                <strong style={{ color: '#1e293b', fontSize: '1rem' }}>Room {room.id}</strong>
                <span style={{ fontSize: '1.2rem' }}>
                  {room.data 
                    ? (address === room.data.payer ? '👑' : '👤') 
                    : '?'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      
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

      <section className="panel" style={{ padding: '20px 24px' }}>
        <h2 style={{ marginBottom: '20px' }}>Create a Split</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.9rem', color: '#555', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Split Mode</label>
            <select className="field-input" value={mode} onChange={(e) => setMode(parseInt(e.target.value, 10) as SplitMode)} style={{ width: '100%' }}>
              <option value={SplitMode.Standard}>Standard (Everyone pays same)</option>
              <option value={SplitMode.Open}>Open (Friends declare amount)</option>
              <option value={SplitMode.Direct}>Direct (Assign specific amounts)</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1', paddingBottom: '15px', borderBottom: '1px solid #e5e7eb' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.97rem', color: '#333', fontWeight: 500, cursor: 'pointer' }}>
              <input type="checkbox" checked={ownerIncluded} onChange={(e) => setOwnerIncluded(e.target.checked)} style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
              Include <span style={{fontWeight:600}}>myself</span> on the bill
            </label>
            <span className="muted-text" style={{ fontSize: '0.85rem', marginLeft: '26px', marginTop: '4px', display: 'block' }}>
              (Uncheck if you are not paying)
            </span>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Total Bill</label>
            <input className="field-input" type="number" placeholder="e.g. 100" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Service Charge</label>
            <input className="field-input" type="number" placeholder="e.g. 10" value={serviceCharge} onChange={(e) => setServiceCharge(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Number of Friends</label>
            <input className="field-input" type="number" placeholder="excluding you" value={people} onChange={(e) => setPeople(e.target.value)} style={{ width: '100%' }} />
            <span className="muted-text" style={{ fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
              Friends joining (you are toggled above)
            </span>
          </div>

          <button onClick={handleCreateSplit} disabled={isCreating} className="btn btn-primary" style={{ gridColumn: '1 / -1', marginTop: '6px', padding: '12px 16px', fontWeight: 500 }}>
            {isCreating ? 'Creating on Ledger...' : 'Create Room & Get QR'}
          </button>
        </div>
      </section>
    </div>
  );
}