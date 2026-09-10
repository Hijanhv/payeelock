import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/400.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'PayeeLock — safe recovery for approved payments',
  description:
    'Pause an unsafe payout wallet, recover the unpaid invoice balance with both parties, and make every old payment authorization fail.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
