import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = { title: "QuickPlate", description: "Food from restaurants near you" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/">QuickPlate</Link>
          <Link href="/login" className="muted" style={{ fontWeight: 500 }}>Sign in</Link>
        </header>
        {children}
      </body>
    </html>
  );
}
