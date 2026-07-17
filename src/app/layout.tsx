import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "./register-sw";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wolf Daniels — Inventario",
  description: "Inventario y ventas de mayoreo — Wolf Daniels",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WD Inventario",
  },
  icons: {
    icon: [{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-brand-black text-brand-cream">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
