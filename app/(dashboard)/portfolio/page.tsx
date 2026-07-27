"use client";

import { useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  SectionTitle,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import Sparkline from "@/app/components/Sparkline";

const portfolioData: Record<string, number[]> = {
  "1D": [4, 6, 5, 8, 9, 6, 4, 7, 6, 7, 9, 8, 11, 10, 14, 16],
  "7D": [8, 7, 5, 9, 6, 10, 12, 11, 13, 16, 14, 17, 19, 18, 21],
  "1M": [3, 5, 4, 8, 7, 12, 10, 14, 17, 16, 21, 23, 26, 24, 30],
};

export default function PortfolioPage() {
  const { connected, address, ethBalance, openWallet } = useAppWallet();
  const [range, setRange] = useState("1D");

  const numericBalance = Number(ethBalance ?? 0);
  const portfolioValue = useMemo(() => numericBalance * 2568.7, [numericBalance]);
  const shortAddress = address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "";

  if (!connected) {
    return (
      <>
        <AppPageHeader title="Portfolio" description="Balances and positions for your connected wallet." />
        <Panel className="portfolio-connect-panel">
          <div className="portfolio-connect-visual">
            <span className="wallet-ring ring-one" />
            <span className="wallet-ring ring-two" />
            <img src="/assets/character.png" alt="" />
          </div>
          <h2>Connect your wallet</h2>
          <p>View token balances, liquidity positions, and recent onchain activity in one place.</p>
          <button className="app-primary-button" type="button" onClick={openWallet}>Connect wallet</button>
          <small>Read-only portfolio data. Dubu never takes custody of your assets.</small>
        </Panel>
      </>
    );
  }

  return (
    <>
      <div className="portfolio-connected-header">
        <AppPageHeader title="Portfolio" description="Balances and positions on Ethereum." />
        <div className="portfolio-account-chip"><span className="app-wallet-orb" /><div><strong>{shortAddress}</strong><small>Ethereum</small></div></div>
      </div>

      <div className="portfolio-summary-grid connected">
        <Panel className="portfolio-value-panel">
          <SectionTitle>Net worth</SectionTitle>
          <strong className="portfolio-value">${portfolioValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong>
          <span className="portfolio-change app-muted-copy">Wallet balance at current market price</span>
          <Sparkline data={portfolioData[range]} height={95} label={`${range} wallet value chart`} />
          <div className="range-tabs">
            {Object.keys(portfolioData).map((item) => (
              <button key={item} type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>
            ))}
          </div>
        </Panel>

        <Panel className="portfolio-balance-panel">
          <SectionTitle>Token balances</SectionTitle>
          <div className="portfolio-token-row">
            <TokenIcon symbol="ETH" />
            <div><strong>Ethereum</strong><span>ETH</span></div>
            <div><strong>{ethBalance ?? "0.0000"} ETH</strong><span>${portfolioValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></div>
          </div>
          <p>ERC-20 balances require an indexed data source and will appear when the portfolio API is connected.</p>
        </Panel>

        <Panel className="portfolio-network-panel">
          <SectionTitle>Network</SectionTitle>
          <div className="network-allocation">
            <div className="network-donut"><span>100%</span></div>
            <div><strong>Ethereum</strong><span>${portfolioValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></div>
          </div>
        </Panel>
      </div>

      <div className="portfolio-table-grid">
        <Panel className="portfolio-table-panel">
          <SectionTitle>Liquidity positions</SectionTitle>
          <div className="dex-empty-state compact">
            <span>◇</span>
            <strong>No positions found</strong>
            <p>Active Dubu liquidity positions will appear here.</p>
          </div>
        </Panel>
        <Panel className="portfolio-table-panel">
          <SectionTitle>Recent activity</SectionTitle>
          <div className="dex-empty-state compact">
            <span>↗</span>
            <strong>No Dubu transactions yet</strong>
            <p>Your swaps and liquidity actions will appear after submission.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
