import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NiftyPredictor Dashboard',
  description: 'Live Nifty 50 and Bank Nifty predictions powered by ML',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-100 text-slate-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
