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
const liquiditySeries = [72, 73, 72, 74, 75, 74, 76, 77, 76, 78, 79, 78, 80, 81, 82, 81, 83, 84, 83, 85, 86, 85, 87, 88, 87, 89, 90, 89, 91];

const pairs = [
  { a: "ETH", b: "USDC", volume: "$13.24M", share: "27.4%", change: "+21.3%" },
  { a: "USDC", b: "USDT", volume: "$9.81M", share: "20.3%", change: "+15.7%" },
  { a: "ETH", b: "USDT", volume: "$6.72M", share: "13.9%", change: "+17.8%" },
  { a: "WBTC", b: "ETH", volume: "$4.93M", share: "10.2%", change: "+11.6%" },
  { a: "ETH", b: "DAI", volume: "$3.26M", share: "6.8%", change: "+9.4%" },
];

const poolActivity = [
  { a: "ETH", b: "USDC", type: "Volatile", fee: "0.30%", status: "Active" },
  { a: "USDC", b: "USDT", type: "Stable", fee: "0.05%", status: "Active" },
  { a: "ETH", b: "USDT", type: "Volatile", fee: "0.30%", status: "Active" },
  { a: "WBTC", b: "ETH", type: "Volatile", fee: "0.30%", status: "Active" },
  { a: "ETH", b: "DAI", type: "Volatile", fee: "0.30%", status: "Active" },
];

export default function AnalyticsPage() {
  const [volumeRange, setVolumeRange] = useState("7D");
  const [liquidityRange, setLiquidityRange] = useState("7D");

  const volumeData = useMemo(
    () => volumeRange === "7D" ? baseVolume : volumeRange === "30D" ? [...baseVolume].map((value, index) => value + Math.sin(index) * 1.2) : [...baseVolume].map((value, index) => value * 0.7 + index * 0.18),
    [volumeRange],
  );

  const liquidityData = useMemo(
    () => liquidityRange === "7D" ? liquiditySeries : liquidityRange === "30D" ? liquiditySeries.map((value, index) => value - (index % 4)) : liquiditySeries.map((value, index) => value - 3 + Math.cos(index) * 2),
    [liquidityRange],
  );

  return (
    <>
      <AppPageHeader title="Analytics" description="Dubu AMM activity on GIWA Sepolia." />

      <div className="analytics-stat-grid">
        {[
          ["▥", "24h Volume", "$8.42M", "+6.8%"],
          ["⇄", "24h Swaps", "18,274", "+4.2%"],
          ["♧", "Active Traders", "3,847", "+8.1%"],
          ["◇", "Total Liquidity", "$24.68M", "+2.4%"],
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
          <div className="x-axis"><span>Jul 21</span><span>Jul 22</span><span>Jul 23</span><span>Jul 24</span><span>Jul 25</span><span>Jul 26</span><span>Jul 27</span></div>
        </Panel>

        <Panel className="analytics-chart-panel">
          <SectionTitle
            action={
              <div className="segmented-control">
                {["7D", "30D", "90D"].map((item) => <button key={item} type="button" className={liquidityRange === item ? "active" : ""} onClick={() => setLiquidityRange(item)}>{item}</button>)}
              </div>
            }
          >
            Total Liquidity <span className="info-dot">ⓘ</span>
          </SectionTitle>
          <div className="chart-kpi"><strong>$24.68M</strong><span>+2.4% <em>vs. 7D</em></span></div>
          <div className="chart-with-axis">
            <div className="y-axis"><span>$30M</span><span>$25M</span><span>$20M</span><span>$15M</span><span>$10M</span></div>
            <Sparkline data={liquidityData} color="#4b8c3f" fill="rgba(88, 147, 75, 0.12)" height={180} grid label={`${liquidityRange} total liquidity chart`} />
          </div>
          <div className="x-axis"><span>Jul 21</span><span>Jul 22</span><span>Jul 23</span><span>Jul 24</span><span>Jul 25</span><span>Jul 26</span><span>Jul 27</span></div>
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
          <SectionTitle>Pool Activity</SectionTitle>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead><tr><th>Pool</th><th>Model</th><th>Fee tier</th><th>Status</th></tr></thead>
              <tbody>
                {poolActivity.map((pool) => (
                  <tr key={`${pool.a}-${pool.b}`}>
                    <td><div className="pool-pair"><span><TokenIcon symbol={pool.a} /><TokenIcon symbol={pool.b} /></span><strong>{pool.a} / {pool.b}</strong></div></td>
                    <td>{pool.type}</td>
                    <td>{pool.fee}</td>
                    <td><span className="pool-live-status"><i />{pool.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="table-footer-action" type="button">View all pools <span>›</span></button>
        </Panel>
      </div>
    </>
  );
}
