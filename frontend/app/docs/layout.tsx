import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dubu protocol documentation",
  description:
    "Dubu bootstraps liquidity on GIWA with three products: Dubu PropAMM, Dubu Aggregator and Dubu RFQ. Contracts, pricing, API.",
};

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
