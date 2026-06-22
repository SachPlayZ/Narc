import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono, Doto } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

const doto = Doto({
  variable: "--font-doto",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Narc — Autonomous Risk Guardian",
  description: "Live audit dashboard for the Narc dual-agent trading system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${spaceMono.variable} ${doto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#050505] text-zinc-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
