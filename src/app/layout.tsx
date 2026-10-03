import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sekretari Dixhitale",
  description: "Kolegji Universitar LOGOS — digital secretariat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sq">
      <body>{children}</body>
    </html>
  );
}
