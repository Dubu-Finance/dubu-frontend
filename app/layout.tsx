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
    title: "Dubu — Best Price. Every Time.",
    description:
      "A proprietary AMM for clear, non-custodial swaps on GIWA Chain.",
    icons: {
      icon: "/assets/character.png",
      shortcut: "/assets/character.png",
    },
    openGraph: {
      title: "Dubu — Best Price. Every Time.",
      description: "Clear pricing, low friction, and full wallet control on GIWA Chain.",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1536,
          height: 864,
          alt: "Dubu — Best Price. Every Time.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Dubu — Best Price. Every Time.",
      description: "Clear pricing, low friction, and full wallet control on GIWA Chain.",
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
