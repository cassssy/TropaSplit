import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { isAllowed, setAllowed, requestAccess } from '@stellar/freighter-api';
import { WalletContext } from './walletContextObject';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      const permission = await isAllowed();
      if (!permission.isAllowed || permission.error) {
        return;
      }

      const access = await requestAccess();
      if (!access.error && access.address) {
        setAddress(access.address);
      }
    };

    checkConnection();
  }, []);

  const connect = async () => {
    const permission = await setAllowed();
    if (!permission.isAllowed || permission.error) {
      alert('Freighter permission was denied.');
      return;
    }

    const access = await requestAccess();
    if (access.error || !access.address) {
      alert('Could not read your Freighter address.');
      return;
    }

    setAddress(access.address);
  };

  const disconnect = () => {
    setAddress(null);
  };

  return (
    <WalletContext.Provider value={{ address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}