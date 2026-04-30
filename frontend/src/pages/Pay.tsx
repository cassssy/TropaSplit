import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '../context/useWallet';
import * as TropaSplit from '../contracts';
import { SplitMode } from '../contracts';
import type { SplitConfig } from '../contracts';

type LobbyMember = { address: string; name: string; amount: bigint | null };

export default function Pay() {
  const { splitId } = useParams();
  const navigate = useNavigate();
  const { address, connect, disconnect } = useWallet();
  const [splitData, setSplitData] = useState<(SplitConfig & { paid_count: number }) | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Custom inputs for modes
  const [trustAmount, setTrustAmount] = useState('');
  const [hasPaid, setHasPaid] = useState(false);

  // Lobby states for Direct Mode
  const [lobbyParticipants, setLobbyParticipants] = useState<LobbyMember[]>([]);
  const [assignedAmountsDraft, setAssignedAmountsDraft] = useState<Record<string, string>>({});
  
  // Friend Lobby states
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [assignedAmount, setAssignedAmount] = useState<bigint | null>(null);
  const [joinNameInput, setJoinNameInput] = useState('');

  const roomPin = Number(splitId);
  const roomUrl = `${window.location.origin}/pay/${roomPin}`;

  const fetchRoomInfo = useCallback(async () => {
    if (!Number.isInteger(roomPin) || roomPin <= 0) {
      setErrorMessage('Invalid room PIN.');
      return;
    }

    try {
      const info = await TropaSplit.getSplitInfo({ split_id: roomPin });
      setSplitData(info.result);

      if (address && info.result) {
        // Check if paid
        const paid = await TropaSplit.hasAddressPaid({ split_id: roomPin, friend: address });
        setHasPaid(paid);

        const isOwner = address === info.result.payer;

        if (info.result.mode === SplitMode.Direct) {
          if (isOwner) {
             // Owner: fetch lobby array and hydrate with names and assigned amounts
             const addrs = await TropaSplit.getLobby({ split_id: roomPin });
             const populated: LobbyMember[] = [];
             for (const a of addrs) {
                 const name = await TropaSplit.getParticipantName({ split_id: roomPin, friend: a });
                 const amt = await TropaSplit.getAssignedAmount({ split_id: roomPin, friend: a });
                 if (name) {
                     populated.push({ address: a, name, amount: amt });
                 }
             }
             setLobbyParticipants(populated);
          } else {
             // Friend: Check if registered
             const name = await TropaSplit.getParticipantName({ split_id: roomPin, friend: address });
             setRegisteredName(name);
             if (name) {
                 const amt = await TropaSplit.getAssignedAmount({ split_id: roomPin, friend: address });
                 setAssignedAmount(amt);
             }
          }
        }
      }
    } catch (err) {
      console.error("Could not fetch room info", err);
      setErrorMessage('Could not load this room. It may not exist yet.');
    }
  }, [roomPin, address]);

  // Setup Polling
  // Setup Polling & Fetching Safely
useEffect(() => {
  let ignore = false; // React lifecycle guard to prevent race conditions

  const fetchRoomInfo = async () => {
    if (!Number.isInteger(roomPin) || roomPin <= 0) return;

    try {
      const info = await TropaSplit.getSplitInfo({ split_id: roomPin });
      if (ignore) return;
      setSplitData(info.result);

      // Save to history
      const savedSplits = JSON.parse(localStorage.getItem('tropa_splits') || '[]');
      if (!savedSplits.includes(roomPin)) {
        localStorage.setItem('tropa_splits', JSON.stringify([roomPin, ...savedSplits]));
      }

      if (address && info.result) {
        const paid = await TropaSplit.hasAddressPaid({ split_id: roomPin, friend: address });
        if (ignore) return;
        setHasPaid(paid);

        const isOwner = address === info.result.payer;

        if (info.result.mode === SplitMode.Direct) {
          if (isOwner) {
             // 🚀 FIX 1: Fetch the lobby array, then fetch names/amounts concurrently
             const addrs = await TropaSplit.getLobby({ split_id: roomPin });
             
             const populated = await Promise.all(
               addrs.map(async (a) => {
                 const [name, amt] = await Promise.all([
                   TropaSplit.getParticipantName({ split_id: roomPin, friend: a }),
                   TropaSplit.getAssignedAmount({ split_id: roomPin, friend: a })
                 ]);
                 return { address: a, name: name || 'Unknown', amount: amt };
               })
             );

             if (ignore) return;
             setLobbyParticipants(populated);
          } else {
             const [name, amt] = await Promise.all([
               TropaSplit.getParticipantName({ split_id: roomPin, friend: address }),
               TropaSplit.getAssignedAmount({ split_id: roomPin, friend: address })
             ]);
             
             if (ignore) return;
             setRegisteredName(name);
             setAssignedAmount(amt);
          }
        }
      }
    } catch (err) {
      if (!ignore) {
        console.error("Could not fetch room info", err);
        setErrorMessage('Could not load this room. It may not exist yet.');
      }
    }
  };

  // Run immediately, then interval
  void fetchRoomInfo();
  const interval = setInterval(() => { void fetchRoomInfo(); }, 5000);
  
  return () => {
    ignore = true; 
    clearInterval(interval);
  };
}, [roomPin, address]); 

  const handleJoinLobby = async () => {
    if (!address) return alert("Please connect wallet!");
    if (!joinNameInput) return alert("Enter a name!");
    try {
       setIsPaying(true);
       await TropaSplit.registerParticipant({ split_id: roomPin, friend: address, name: joinNameInput });
       alert("Joined lobby successfully!");
       await fetchRoomInfo();
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert("Failed to join lobby: " + msg);
    } finally {
       setIsPaying(false);
    }
  };

  const handleReleaseAmounts = async () => {
    try {
      setIsPaying(true);
      const STROOPS_PER_UNIT = 10000000;
      const amountsMap = new Map<string, bigint>();
      
      for (const p of lobbyParticipants) {
         const draftVal = assignedAmountsDraft[p.address];
         const parsedVal = Number(draftVal);
         
         if (draftVal && !isNaN(parsedVal) && parsedVal > 0) {
            amountsMap.set(p.address, BigInt(Math.round(parsedVal * STROOPS_PER_UNIT)));
         }
      }
 
      if (amountsMap.size === 0) return alert("No new or valid amounts entered!");
 
      await TropaSplit.assignAmounts({ split_id: roomPin, amounts: amountsMap });
      alert("Amounts released to friends!");
      setAssignedAmountsDraft({});
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert("Failed to assign: " + msg);
    } finally {
      setIsPaying(false);
    }
  };

  const handlePay = async () => {
    if (!address) return alert("Please connect your wallet first!");
    if (!splitData) return;

    try {
      setIsPaying(true);
      setErrorMessage(null);

      const STROOPS_PER_UNIT = 10000000;
      let custom = 0n;

      if (splitData.mode === SplitMode.Open) {
         if (!trustAmount || Number(trustAmount) <= 0) throw new Error("Enter valid meal amount");
         custom = BigInt(Math.round(Number(trustAmount) * STROOPS_PER_UNIT));
      }

      await TropaSplit.joinAndPay({
        split_id: roomPin,
        friend: address,
        custom_amount: custom,
      });

      alert("Payment successful!");
      setHasPaid(true);
      await fetchRoomInfo();
    } catch (error: unknown) {
      console.error("Payment failed", error);
      setErrorMessage("Payment failed or you already paid.");
    } finally {
      setIsPaying(false);
    }
  };

  if (errorMessage) {
    return <div className="page-shell"><p className="error-text">{errorMessage}</p></div>;
  }

  if (!splitData) {
    return <div className="page-shell"><p className="muted-text" style={{textAlign: 'center', marginTop: '50px'}}>Loading split on-chain...</p></div>;
  }

  const isOwner = address === splitData.payer;
  
  const totalBillHuman = (Number(splitData.total_bill) / 10000000).toFixed(2);
  const serviceChargeHuman = (Number(splitData.service_charge) / 10000000).toFixed(2);

  // Math Tax Divisor
  const divisor = splitData.owner_included ? splitData.target_people : Math.max(splitData.target_people - 1, 1);
  const mathTaxHuman = (Number(splitData.service_charge) / 10000000 / divisor).toFixed(2);
  const isFullyPaid = splitData.paid_count >= divisor;

  return (
    <div className="page-shell">
      <div className="row-actions row-end" style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', width: '100%' }}>
        <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: 'none' }}>
          ← Home
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={connect} className={address ? 'btn btn-secondary' : 'btn btn-primary'}>
            {address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
          </button>
          {address && (
            <button onClick={disconnect} className="btn btn-secondary" style={{ backgroundColor: '#ff4d4f', color: 'white', border: 'none' }}>
              Logout
            </button>
          )}
        </div>
      </div>

      <section className="panel panel-centered">
        <h1>Room: {roomPin}</h1>

        <div className="qr-container">
          <QRCodeSVG value={roomUrl} size={180} />
        </div>

        <div style={{ margin: '20px 0', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
          <p className="eyebrow" style={{ textAlign: 'center' }}>Receipt Info</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span className="muted-text">Total Bill:</span>
            <strong>${totalBillHuman}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted-text">Service Charge:</span>
            <strong>${serviceChargeHuman} (+${mathTaxHuman}/person)</strong>
          </div>
        </div>

        {/* OWNER DASHBOARD */}
        {isOwner ? (
          <div style={{ backgroundColor: '#f0fdf4', padding: '20px', borderRadius: '8px', border: '1px solid #bbf7d0', marginTop: '20px' }}>
            <h2 style={{ margin: '0 0 10px 0', color: '#166534' }}>Host Dashboard</h2>
            <p style={{ margin: '0 0 10px 0' }}>Progress: <strong>{splitData.paid_count} / {divisor}</strong> have paid.</p>
            {isFullyPaid && <p style={{ color: '#166534', fontWeight: 'bold' }}>All friends have settled up!</p>}
            
            {splitData.mode === SplitMode.Direct && (
              <div style={{ marginTop: '20px', borderTop: '1px solid #bbf7d0', paddingTop: '15px' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#166534' }}>Lobby (Live)</h3>
                {lobbyParticipants.length === 0 ? (
                  <p className="muted-text">Waiting for friends to join...</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                     {lobbyParticipants.map(p => (
                       <div key={p.address} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span>{p.name}</span>
                         {p.amount !== null ? (
                           <strong>Assigned: ${(Number(p.amount) / 10000000).toFixed(2)}</strong>
                         ) : (
                           <input 
                              type="number" 
                              className="field-input" 
                              style={{ width: '80px', padding: '5px' }} 
                              placeholder="$0.00"
                              value={assignedAmountsDraft[p.address] || ''}
                              onChange={e => setAssignedAmountsDraft(prev => ({ ...prev, [p.address]: e.target.value }))}
                           />
                         )}
                       </div>
                     ))}
                     <button onClick={handleReleaseAmounts} disabled={isPaying} className="btn btn-primary" style={{ marginTop: '10px' }}>
                        {isPaying ? 'Releasing...' : 'Release Amounts'}
                     </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* FRIEND VIEW */
          <div style={{ marginTop: '20px' }}>
            {splitData.mode === SplitMode.Standard && (
              <div className="badge" style={{ margin: '0 auto 20px auto' }}>
                 Your Share: ${((Number(splitData.total_bill) + Number(splitData.service_charge)) / 10000000 / divisor).toFixed(2)}
              </div>
            )}

            {splitData.mode === SplitMode.Open && (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                 <label>How much was your meal?</label>
                 <input className="field-input" type="number" placeholder="e.g. 15" value={trustAmount} onChange={e => setTrustAmount(e.target.value)} />
                 <p className="muted-text" style={{ fontSize: '0.9rem' }}>+ ${mathTaxHuman} Service Fee will be added automatically.</p>
               </div>
            )}

            {splitData.mode === SplitMode.Direct && (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                 {!registeredName ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <p>Enter your name to join the lobby:</p>
                      <input className="field-input" placeholder="Your Name" value={joinNameInput} onChange={e => setJoinNameInput(e.target.value)} />
                      <button onClick={handleJoinLobby} disabled={isPaying} className="btn btn-secondary">
                        {isPaying ? 'Joining...' : 'Join Lobby'}
                      </button>
                    </div>
                 ) : assignedAmount === null ? (
                    <div className="badge" style={{ margin: '0 auto 20px auto', backgroundColor: '#fef3c7', color: '#b45309' }}>
                       Waiting for Host to assign your share...
                    </div>
                 ) : (
                    <div className="badge" style={{ margin: '0 auto 20px auto' }}>
                       Host Assigned: ${(Number(assignedAmount) / 10000000).toFixed(2)} <br/>
                       <span style={{fontSize: '0.8rem'}}>+ ${mathTaxHuman} Tax</span>
                    </div>
                 )}
               </div>
            )}

            <p className="muted-text" style={{ textAlign: 'center', marginBottom: '10px' }}>
              Progress: {splitData.paid_count} / {divisor} have paid
            </p>

            {hasPaid ? (
               <div className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534', display: 'flex', justifyContent: 'center' }}>
                 ✅ You have paid your share!
               </div>
            ) : (
               /* Hide Pay button if Direct mode and amount is not yet assigned */
               (splitData.mode !== SplitMode.Direct || assignedAmount !== null) && (
                 <button onClick={handlePay} disabled={isPaying || !address} className="btn btn-primary" style={{ width: '100%' }}>
                   {isPaying ? 'Signing & Sending...' : 'Pay Now'}
                 </button>
               )
            )}
          </div>
        )}
      </section>
    </div>
  );
}