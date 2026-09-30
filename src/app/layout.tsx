import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

export const metadata: Metadata = {
  title: 'Bossa CRM',
  description: 'CRM comercial da Bossa Empreendimentos',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body><Script src="/crm-theme.js" strategy="beforeInteractive" />{children}</body>
    </html>
  );
}
