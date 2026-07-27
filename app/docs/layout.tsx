import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dubu Docs — Trade and build onchain",
  description: "Learn how to trade, provide liquidity, and integrate with Dubu.",
};

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
