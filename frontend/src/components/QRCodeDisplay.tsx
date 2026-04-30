import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  url: string;
  pin: string | undefined;
}

export default function QRCodeDisplay({ url, pin }: QRCodeDisplayProps) {
  return (
    <div className="qr-card">
      <QRCodeSVG value={url} size={200} level="H" />
      <h3 className="qr-title">Room PIN: {pin}</h3>
      <p className="muted-text">
        Scan with your phone camera to pay
      </p>
    </div>
  );
}