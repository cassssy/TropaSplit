import { useContext } from 'react';
import { WalletContext } from './walletContextObject';

export const useWallet = () => useContext(WalletContext);
