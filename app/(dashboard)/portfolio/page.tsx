"use client";

import { useState } from "react";
import {
  AppPageHeader,
  Panel,
  ProtocolIcon,
  SectionTitle,
  TokenIcon,
} from "@/app/components/AppShell";
import Sparkline from "@/app/components/Sparkline";

const portfolioData: Record<string, number[]> = {
  "1D": [4, 6, 5, 8, 9, 6, 4, 7, 6, 7, 9, 8, 11, 10, 14, 16],
  "7D": [8, 7, 5, 9, 6, 10, 12, 11, 13, 16, 14, 17, 19, 18, 21],
  "30D": [3, 5, 4, 8, 7, 12, 10, 14, 17, 16, 21, 23, 26, 24, 30],
  "90D": [4, 3, 8, 6, 11, 14, 12, 18, 22, 20, 25, 29, 27, 35, 39],
  "1Y": [2, 5, 4, 9, 7, 13, 16, 14, 21, 25, 29, 28, 36, 41, 48],
  ALL: [1, 3, 2, 6, 5, 10, 8, 15, 19, 17, 26, 32, 38, 42, 53],
};

const holdings = [
  { asset: "Ethereum", symbol: "ETH", balance: "1.0000", value: "$1,453.71", change: "+0.97%" },
  { asset: "USD Coin", symbol: "USDC", balance: "612.45", value: "$610.76", change: "+0.12%" },
  { asset: "Tether", symbol: "USDT", balance: "320.00", value: "$320.00", change: "-0.01%" },
  { asset: "Dai", symbol: "DAI", balance: "100.25", value: "$100.62", change: "+0.08%" },
  { asset: "Uniswap", symbol: "UNI", balance: "15.30", value: "$58.62", change: "+0.62%" },
];

const positions = [
  { protocol: "Uniswap V3", position: "ETH / USDC 0.05%", value: "$1,028.34", apy: "12.45%" },
  { protocol: "Aave", position: "USDC Supply", value: "$612.76", apy: "3.21%" },
  { protocol: "Curve", position: "stETH / ETH", value: "$482.11", apy: "4.87%" },
  { protocol: "Lido", position: "stETH Stake", value: "$320.00", apy: "4.15%" },
];

const activity = [
  { icon: "⇄", type: "Swap", protocol: "Uniswap", details: "Swapped 0.2 ETH for 320.12 USDC", amount: "+320.12 USDC", value: "$320.12", time: "5m ago" },
  { icon: "◉", type: "Add Liquidity", protocol: "Uniswap V3", details: "Added ETH / USDC 0.05%", amount: "-0.15 ETH, -250 USDC", value: "$550.21", time: "2h ago" },
  { icon: "↑", type: "Supply", protocol: "Aave", details: "Supplied 500 USDC", amount: "+500 USDC", value: "$500.00", time: "1d ago" },
  { icon: "◇", type: "Claim Rewards", protocol: "Lido", details: "Claimed staking rewards", amount: "+0.0021 stETH", value: "$6.72", time: "2d ago" },
];

export default function PortfolioPage() {
  const [range, setRange] = useState("1D");

  return (
    <>
      <AppPageHeader title="Portfolio" description="Track your assets, positions, and performance across DeFi." />

      <div className="portfolio-summary-grid">
        <Panel className="portfolio-value-panel">
          <SectionTitle>Total Portfolio Value <span className="info-dot">ⓘ</span></SectionTitle>
          <strong className="portfolio-value">$2,543.71</strong>
          <span className="positive portfolio-change">+0.97% (24H)</span>
          <Sparkline data={portfolioData[range]} height={95} label={`${range} portfolio value chart`} />
          <div className="range-tabs">
            {Object.keys(portfolioData).map((item) => (
              <button key={item} type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>
            ))}
          </div>
        </Panel>

        <Panel className="allocation-panel">
          <SectionTitle>Asset Allocation</SectionTitle>
          <div className="allocation-body">
            <div className="donut-chart" role="img" aria-label="ETH 57.1%, USDC 24%, USDT 12.6%, Other 6.3%">
              <div><strong>$2,543.71</strong><span>Total</span></div>
            </div>
            <dl className="allocation-legend">
              <div><dt><i className="legend-blue" />ETH</dt><dd>57.1%</dd></div>
              <div><dt><i className="legend-green" />USDC</dt><dd>24.0%</dd></div>
              <div><dt><i className="legend-gold" />USDT</dt><dd>12.6%</dd></div>
              <div><dt><i className="legend-purple" />Other</dt><dd>6.3%</dd></div>
            </dl>
          </div>
        </Panel>

        <Panel className="profit-panel">
          <SectionTitle>Profit / Loss <span className="info-dot">ⓘ</span></SectionTitle>
          <strong>+$24.31</strong>
          <span>+0.97% (24H)</span>
          <dl>
            <div><dt>24H</dt><dd>+$24.31</dd></div>
            <div><dt>7D</dt><dd>+$82.14</dd></div>
            <div><dt>30D</dt><dd>+$201.92</dd></div>
          </dl>
        </Panel>
      </div>

      <div className="portfolio-table-grid">
        <Panel className="portfolio-table-panel">
          <SectionTitle>Holdings</SectionTitle>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead><tr><th>Asset</th><th>Balance</th><th>Value</th><th>24H</th></tr></thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr key={holding.symbol}>
                    <td><div className="asset-cell"><TokenIcon symbol={holding.symbol} /><strong>{holding.asset}</strong><small>{holding.symbol}</small></div></td>
                    <td>{holding.balance}</td>
                    <td>{holding.value}</td>
                    <td className={holding.change.startsWith("+") ? "positive" : "negative"}>{holding.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="table-footer-action" type="button">View all holdings <span>›</span></button>
        </Panel>

        <Panel className="portfolio-table-panel">
          <SectionTitle>DeFi Positions</SectionTitle>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead><tr><th>Protocol</th><th>Position</th><th>Value</th><th>APY</th></tr></thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.protocol}>
                    <td><div className="asset-cell"><ProtocolIcon name={position.protocol} /><strong>{position.protocol}</strong></div></td>
                    <td>{position.position}</td>
                    <td>{position.value}</td>
                    <td className="positive">{position.apy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="table-footer-action" type="button">View all positions <span>›</span></button>
        </Panel>
      </div>

      <Panel className="activity-panel">
        <SectionTitle>Recent Activity</SectionTitle>
        <div className="app-table-wrap">
          <table className="app-table activity-table">
            <thead><tr><th>Type</th><th>Protocol</th><th>Details</th><th>Amount</th><th>Value</th><th>Time</th></tr></thead>
            <tbody>
              {activity.map((item) => (
                <tr key={`${item.type}-${item.time}`}>
                  <td><div className="activity-type"><span>{item.icon}</span><strong>{item.type}</strong></div></td>
                  <td>{item.protocol}</td>
                  <td>{item.details}</td>
                  <td className={item.amount.startsWith("+") ? "positive" : "negative"}>{item.amount}</td>
                  <td>{item.value}</td>
                  <td>{item.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="table-footer-action" type="button">View all activity <span>›</span></button>
      </Panel>
    </>
  );
}
