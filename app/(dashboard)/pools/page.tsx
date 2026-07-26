"use client";

import { useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  SectionTitle,
  Toast,
  TokenIcon,
} from "@/app/components/AppShell";
import Sparkline from "@/app/components/Sparkline";

const poolRows = [
  { a: "ETH", b: "USDC", fee: "0.05%", apy: "9.42%", tvl: "$8.74M", position: "$1,245.67" },
  { a: "WETH", b: "USDC", fee: "0.05%", apy: "8.21%", tvl: "$6.21M", position: "$842.19" },
  { a: "ETH", b: "DAI", fee: "0.30%", apy: "6.87%", tvl: "$4.11M", position: "$0.00" },
  { a: "USDC", b: "DAI", fee: "0.01%", apy: "4.23%", tvl: "$3.62M", position: "$512.78" },
];

const positionRows = [
  { a: "ETH", b: "USDC", fee: "0.05%", liquidity: "$1,245.67", apy: "9.42%", pnl: "+$12.34", data: [2, 4, 3, 6, 4, 7, 5, 8, 7, 10, 8, 12] },
  { a: "WETH", b: "USDC", fee: "0.05%", liquidity: "$842.19", apy: "8.21%", pnl: "-$3.21", data: [9, 7, 8, 6, 5, 5, 6, 4, 3, 2, 2, 1] },
  { a: "USDC", b: "DAI", fee: "0.01%", liquidity: "$512.78", apy: "4.23%", pnl: "+$1.98", data: [2, 2, 4, 3, 5, 6, 5, 7, 6, 8, 9, 8] },
];

export default function PoolsPage() {
  const [activeTab, setActiveTab] = useState("All Pools");
  const [search, setSearch] = useState("");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [toast, setToast] = useState(false);

  const filteredPools = useMemo(() => {
    return poolRows.filter((pool) => {
      const matchesSearch = `${pool.a}/${pool.b}`.toLowerCase().includes(search.toLowerCase());
      const matchesTab = activeTab === "All Pools" || pool.position !== "$0.00";
      return matchesSearch && matchesTab;
    });
  }, [activeTab, search]);

  function addLiquidity() {
    setToast(true);
    window.setTimeout(() => setToast(false), 2600);
  }

  return (
    <>
      <AppPageHeader title="Pools" description="Provide liquidity, earn fees, and grow your assets." />

      <div className="pool-stat-grid">
        <Panel className="pool-stat">
          <div><span>Total Value Locked</span><strong>$24.68M</strong></div>
          <b>⌁</b>
        </Panel>
        <Panel className="pool-stat">
          <div><span>Average APY</span><strong>12.34% <small>▲ 0.86%</small></strong></div>
          <b>♧</b>
        </Panel>
        <Panel className="pool-stat">
          <div><span>24h Fees</span><strong>$18,432.51</strong></div>
          <b>$</b>
        </Panel>
      </div>

      <div className="pools-main-grid">
        <Panel className="add-liquidity-panel">
          <SectionTitle>Add liquidity</SectionTitle>
          <div className="liquidity-input">
            <button type="button" className="token-picker"><TokenIcon symbol="ETH" /><strong>ETH</strong><span>⌄</span></button>
            <div><span>Balance: 2.5687 ETH</span><input aria-label="ETH liquidity amount" value={amountA} placeholder="0.0" onChange={(event) => setAmountA(event.target.value.replace(/[^0-9.]/g, ""))} /><small>${((Number(amountA) || 0) * 2568.7).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small></div>
          </div>
          <div className="liquidity-plus">＋</div>
          <div className="liquidity-input">
            <button type="button" className="token-picker"><TokenIcon symbol="USDC" /><strong>USDC</strong><span>⌄</span></button>
            <div><span>Balance: 1,234.56 USDC</span><input aria-label="USDC liquidity amount" value={amountB} placeholder="0.0" onChange={(event) => setAmountB(event.target.value.replace(/[^0-9.]/g, ""))} /><small>${(Number(amountB) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small></div>
          </div>
          <button className="app-primary-button" type="button" onClick={addLiquidity}>Add Liquidity</button>
        </Panel>

        <Panel className="pool-list-panel">
          <div className="pool-list-toolbar">
            <div className="app-tabs">
              {["All Pools", "My Pools"].map((tab) => (
                <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>
              ))}
            </div>
            <label className="app-search">
              <span>⌕</span>
              <input aria-label="Search pools" placeholder="Search pools" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
          <div className="app-table-wrap">
            <table className="app-table pool-table">
              <thead><tr><th>Pool</th><th>APY</th><th>TVL ↓</th><th>My Position</th><th /></tr></thead>
              <tbody>
                {filteredPools.map((pool) => (
                  <tr key={`${pool.a}-${pool.b}`}>
                    <td><div className="pool-pair"><span><TokenIcon symbol={pool.a} /><TokenIcon symbol={pool.b} /></span><strong>{pool.a} / {pool.b}</strong><small>{pool.fee}</small></div></td>
                    <td className="positive">{pool.apy}</td>
                    <td>{pool.tvl}</td>
                    <td>{pool.position}</td>
                    <td><button className="row-arrow" type="button" aria-label={`Open ${pool.a} ${pool.b} pool`}>›</button></td>
                  </tr>
                ))}
                {filteredPools.length === 0 && <tr><td colSpan={5} className="empty-cell">No pools match your search.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="positions-panel">
        <SectionTitle action={<button className="app-select-button" type="button">24h⌄</button>}>Your positions</SectionTitle>
        <div className="app-table-wrap">
          <table className="app-table positions-table">
            <thead><tr><th>Pool</th><th>Your Liquidity</th><th>APY</th><th>P&amp;L (24h)</th><th aria-label="Trend" /></tr></thead>
            <tbody>
              {positionRows.map((position) => (
                <tr key={`${position.a}-${position.b}`}>
                  <td><div className="pool-pair"><span><TokenIcon symbol={position.a} /><TokenIcon symbol={position.b} /></span><strong>{position.a} / {position.b}</strong><small>{position.fee}</small></div></td>
                  <td>{position.liquidity}</td>
                  <td className="positive">{position.apy}</td>
                  <td className={position.pnl.startsWith("+") ? "positive" : "negative"}>{position.pnl}</td>
                  <td className="mini-chart"><Sparkline data={position.data} height={38} label={`${position.a} ${position.b} position trend`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {toast && <Toast>Liquidity preview prepared. Connect a wallet to continue.</Toast>}
    </>
  );
}
