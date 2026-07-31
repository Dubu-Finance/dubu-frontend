import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DuBu protocol documentation",
  description:
    "The prop AMM, its pricing curve, the aggregator API, and the contracts on GIWA Sepolia.",
};

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
