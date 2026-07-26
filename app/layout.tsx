import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3002";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const base = new URL(`${protocol}://${host}`);

  return {
    metadataBase: base,
    title: "Dubu — One Swap. Best Price. Every Time.",
    description:
      "Dubu finds the most efficient swap route across decentralized exchanges so you keep more of every trade.",
    icons: {
      icon: "/assets/character.png",
      shortcut: "/assets/character.png",
    },
    openGraph: {
      title: "Dubu — One Swap. Best Price. Every Time.",
      description: "Smarter routing across DeFi. Better price, less friction, total control.",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1536,
          height: 864,
          alt: "Dubu — One Swap. Best Price. Every Time.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Dubu — One Swap. Best Price. Every Time.",
      description: "Smarter routing across DeFi. Better price, less friction, total control.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
