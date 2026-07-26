"use client";

import { useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  SectionTitle,
  TokenIcon,
} from "@/app/components/AppShell";
import Sparkline from "@/app/components/Sparkline";

const baseVolume = [3, 3.5, 4.4, 5.7, 5.1, 6.1, 6.5, 7.2, 6.4, 5.8, 6.7, 7.7, 7.9, 9.2, 10.1, 11.7, 10.3, 9.1, 8.4, 7.6, 7.7, 8.6, 9.5, 10.2];
const routeEfficiency = [84, 82, 85, 83, 84, 83, 88, 84, 82, 83, 83, 84, 81, 79, 82, 80, 78, 83, 88, 91, 88, 86, 89, 87, 90, 87, 86, 88, 91];

const pairs = [
  { a: "ETH", b: "USDC", volume: "$13.24M", share: "27.4%", change: "+21.3%" },
  { a: "USDC", b: "USDT", volume: "$9.81M", share: "20.3%", change: "+15.7%" },
  { a: "ETH", b: "USDT", volume: "$6.72M", share: "13.9%", change: "+17.8%" },
  { a: "WBTC", b: "ETH", volume: "$4.93M", share: "10.2%", change: "+11.6%" },
  { a: "ARB", b: "ETH", volume: "$3.26M", share: "6.8%", change: "+9.4%" },
];

const networks = [
  { name: "Ethereum", symbol: "ETH", volume: "$32.41M", change: "+18.9%", data: [2, 4, 3, 6, 5, 8, 6, 4, 7, 6, 9] },
  { name: "Arbitrum", symbol: "ARB", volume: "$9.27M", change: "+16.4%", data: [3, 3, 5, 4, 7, 6, 4, 5, 7, 6, 8] },
  { name: "Base", symbol: "BASE", volume: "$4.18M", change: "+22.7%", data: [2, 2, 4, 3, 6, 4, 7, 5, 8, 6, 9] },
  { name: "Optimism", symbol: "OP", volume: "$2.46M", change: "+11.3%", data: [5, 4, 6, 5, 3, 5, 6, 4, 6, 5, 7] },
  { name: "Polygon", symbol: "MATIC", volume: "$0.82M", change: "+8.6%", data: [2, 2, 3, 2, 4, 3, 4, 4, 3, 5, 8] },
];

export default function AnalyticsPage() {
  const [volumeRange, setVolumeRange] = useState("7D");
  const [efficiencyRange, setEfficiencyRange] = useState("7D");

  const volumeData = useMemo(
    () => volumeRange === "7D" ? baseVolume : volumeRange === "30D" ? [...baseVolume].map((value, index) => value + Math.sin(index) * 1.2) : [...baseVolume].map((value, index) => value * 0.7 + index * 0.18),
    [volumeRange],
  );

  const efficiencyData = useMemo(
    () => efficiencyRange === "7D" ? routeEfficiency : efficiencyRange === "30D" ? routeEfficiency.map((value, index) => value - (index % 4)) : routeEfficiency.map((value, index) => value - 3 + Math.cos(index) * 2),
    [efficiencyRange],
  );

  return (
    <>
      <AppPageHeader title="Analytics" description="Explore DEX activity and route performance on Dubu." />

      <div className="analytics-stat-grid">
        {[
          ["▥", "Volume", "$48.32M", "+18.6%"],
          ["♧", "Users", "12,847", "+14.2%"],
          ["⇄", "Route Savings", "$2.87M", "+20.4%"],
          ["✦", "Fees Saved", "$412.6K", "+16.1%"],
        ].map(([icon, label, value, change]) => (
          <Panel className="analytics-stat" key={label}>
            <span>{icon}</span>
            <div><small>{label}</small><strong>{value}</strong><b>{change} <em>vs. 7D</em></b></div>
          </Panel>
        ))}
      </div>

      <div className="analytics-chart-grid">
        <Panel className="analytics-chart-panel">
          <SectionTitle
            action={
              <div className="segmented-control">
                {["7D", "30D", "90D"].map((item) => <button key={item} type="button" className={volumeRange === item ? "active" : ""} onClick={() => setVolumeRange(item)}>{item}</button>)}
              </div>
            }
          >
            Trading Volume <span className="info-dot">ⓘ</span>
          </SectionTitle>
          <div className="chart-kpi"><strong>$48.32M</strong><span>+18.6% <em>vs. 7D</em></span></div>
          <div className="chart-with-axis">
            <div className="y-axis"><span>$12M</span><span>$9M</span><span>$6M</span><span>$3M</span><span>$0</span></div>
            <Sparkline data={volumeData} height={180} grid label={`${volumeRange} trading volume chart`} />
          </div>
          <div className="x-axis"><span>May 13</span><span>May 14</span><span>May 15</span><span>May 16</span><span>May 17</span><span>May 18</span><span>May 19</span></div>
        </Panel>

        <Panel className="analytics-chart-panel">
          <SectionTitle
            action={
              <div className="segmented-control">
                {["7D", "30D", "90D"].map((item) => <button key={item} type="button" className={efficiencyRange === item ? "active" : ""} onClick={() => setEfficiencyRange(item)}>{item}</button>)}
              </div>
            }
          >
            Route Efficiency <span className="info-dot">ⓘ</span>
          </SectionTitle>
          <div className="chart-kpi"><strong>91.2%</strong><span>+2.3% <em>vs. 7D</em></span></div>
          <div className="chart-with-axis">
            <div className="y-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
            <Sparkline data={efficiencyData} color="#4b8c3f" fill="rgba(88, 147, 75, 0.12)" height={180} grid label={`${efficiencyRange} route efficiency chart`} />
          </div>
          <div className="x-axis"><span>May 13</span><span>May 14</span><span>May 15</span><span>May 16</span><span>May 17</span><span>May 18</span><span>May 19</span></div>
          <p className="chart-note">Route Efficiency = 1 - (Executed Price / Best Available Price)</p>
        </Panel>
      </div>

      <div className="analytics-table-grid">
        <Panel className="analytics-table-panel">
          <SectionTitle>Top Trading Pairs</SectionTitle>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead><tr><th>#</th><th>Pair</th><th>Volume (7D)</th><th>Volume %</th><th>7D Change</th></tr></thead>
              <tbody>
                {pairs.map((pair, index) => (
                  <tr key={`${pair.a}-${pair.b}`}>
                    <td>{index + 1}</td>
                    <td><div className="pool-pair"><span><TokenIcon symbol={pair.a} /><TokenIcon symbol={pair.b} /></span><strong>{pair.a} / {pair.b}</strong></div></td>
                    <td>{pair.volume}</td><td>{pair.share}</td><td className="positive">{pair.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="table-footer-action" type="button">View all pairs <span>›</span></button>
        </Panel>

        <Panel className="analytics-table-panel">
          <SectionTitle>Network Activity</SectionTitle>
          <div className="app-table-wrap">
            <table className="app-table network-table">
              <thead><tr><th>Network</th><th>Volume (7D)</th><th>7D Change</th><th>Trend (7D)</th></tr></thead>
              <tbody>
                {networks.map((network) => (
                  <tr key={network.name}>
                    <td><div className="asset-cell"><TokenIcon symbol={network.symbol} /><strong>{network.name}</strong></div></td>
                    <td>{network.volume}</td><td className="positive">{network.change}</td>
                    <td className="mini-chart"><Sparkline data={network.data} height={34} label={`${network.name} network volume trend`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="table-footer-action" type="button">View all networks <span>›</span></button>
        </Panel>
      </div>
    </>
  );
}
