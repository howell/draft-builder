import type { Metadata } from "next";
import React from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "../components/auth";
import { MigrationGate } from "../components/auth/MigrationGate";
import { QueryProvider } from '@/lib/query/QueryProvider';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dominate Your Auction Draft",
  description: "Dominate Your Auction Draft",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.DISABLE_ANALYTICS === 'true';
  
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"></link>
      </head>
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            <MigrationGate>
              {children}
            </MigrationGate>
          </AuthProvider>
        </QueryProvider>
        {!isTestMode && <Analytics />}
      </body>
    </html>
  );
}
