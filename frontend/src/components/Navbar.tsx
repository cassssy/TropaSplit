import { Link } from 'react-router-dom';
import { useWallet } from '../context/useWallet';

export default function Navbar() {
  const { address, connect } = useWallet();

  return (
    <nav className="navbar">
      <Link to="/" className="brand-link">
        🍕 TropaSplit
      </Link>

      <button onClick={connect} className={address ? 'btn btn-secondary' : 'btn btn-primary'}>
        {address ? `Connected: ${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
      </button>
    </nav>
  );
}