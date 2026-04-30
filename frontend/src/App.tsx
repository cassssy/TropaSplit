import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Pay from './pages/Pay';

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        {/* The Navbar sits outside the Routes so it appears on every page */}
        <Navbar /> 
        
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pay/:splitId" element={<Pay />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}