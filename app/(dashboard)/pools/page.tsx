"use client";

import { useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  SectionTitle,
  Toast,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";

const poolRows = [
  { a: "ETH", b: "USDC", fee: "0.05%", apy: "9.42%", tvl: "$8.74M", volume: "$3.82M" },
  { a: "WETH", b: "USDC", fee: "0.05%", apy: "8.21%", tvl: "$6.21M", volume: "$2.14M" },
  { a: "ETH", b: "DAI", fee: "0.30%", apy: "6.87%", tvl: "$4.11M", volume: "$1.06M" },
  { a: "USDC", b: "DAI", fee: "0.01%", apy: "4.23%", tvl: "$3.62M", volume: "$924K" },
];

export default function PoolsPage() {
  const { connected, ethBalance, openWallet } = useAppWallet();
  const [activeTab, setActiveTab] = useState("All Pools");
  const [search, setSearch] = useState("");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [toast, setToast] = useState(false);
  const [selectedPool, setSelectedPool] = useState<(typeof poolRows)[number] | null>(null);

  const filteredPools = useMemo(() => {
    return poolRows.filter((pool) => {
      const matchesSearch = `${pool.a}/${pool.b}`.toLowerCase().includes(search.toLowerCase());
      const matchesTab = activeTab === "All Pools";
      return matchesSearch && matchesTab;
    });
  }, [activeTab, search]);

  function addLiquidity() {
    if (!connected) {
      openWallet();
      return;
    }
    setToast(true);
    window.setTimeout(() => setToast(false), 2600);
  }

  return (
    <>
      <AppPageHeader title="Pools" description="Explore liquidity pools and manage your positions." />

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
            <div><span>Balance: {connected && ethBalance ? `${ethBalance} ETH` : "—"}</span><input aria-label="ETH liquidity amount" value={amountA} placeholder="0.0" onChange={(event) => {
              const next = event.target.value.replace(/[^0-9.]/g, "");
              setAmountA(next);
              setAmountB(next ? (Number(next) * 2568.7).toFixed(2) : "");
            }} /><small>${((Number(amountA) || 0) * 2568.7).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small></div>
          </div>
          <div className="liquidity-plus">＋</div>
          <div className="liquidity-input">
            <button type="button" className="token-picker"><TokenIcon symbol="USDC" /><strong>USDC</strong><span>⌄</span></button>
            <div><span>Balance: —</span><input aria-label="USDC liquidity amount" value={amountB} placeholder="0.0" onChange={(event) => setAmountB(event.target.value.replace(/[^0-9.]/g, ""))} /><small>${(Number(amountB) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small></div>
          </div>
          <div className="pool-range-summary">
            <span>Fee tier <strong>0.05%</strong></span>
            <span>Price range <strong>Full range</strong></span>
          </div>
          <button className="app-primary-button" type="button" disabled={connected && (!amountA || !amountB)} onClick={addLiquidity}>
            {!connected ? "Connect wallet" : !amountA || !amountB ? "Enter amounts" : "Review position"}
          </button>
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
              <thead><tr><th>Pool</th><th>APR</th><th>TVL ↓</th><th>24h volume</th><th /></tr></thead>
              <tbody>
                {activeTab === "My Pools" ? (
                  <tr><td colSpan={5}><div className="table-connect-state"><strong>{connected ? "No active positions" : "Connect your wallet to view positions"}</strong>{!connected && <button type="button" onClick={openWallet}>Connect wallet</button>}</div></td></tr>
                ) : filteredPools.map((pool) => (
                  <tr key={`${pool.a}-${pool.b}`}>
                    <td><div className="pool-pair"><span><TokenIcon symbol={pool.a} /><TokenIcon symbol={pool.b} /></span><strong>{pool.a} / {pool.b}</strong><small>{pool.fee}</small></div></td>
                    <td className="positive">{pool.apy}</td>
                    <td>{pool.tvl}</td>
                    <td>{pool.volume}</td>
                    <td><button className="row-arrow" type="button" aria-label={`Open ${pool.a} ${pool.b} pool`} onClick={() => setSelectedPool(pool)}>›</button></td>
                  </tr>
                ))}
                {filteredPools.length === 0 && <tr><td colSpan={5} className="empty-cell">No pools match your search.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="positions-panel">
        <SectionTitle>Your positions</SectionTitle>
        <div className="dex-empty-state pool-position-empty">
          <span>◇</span>
          <strong>{connected ? "No active liquidity positions" : "No wallet connected"}</strong>
          <p>{connected ? "Positions on Ethereum will appear here." : "Connect your wallet to view and manage your liquidity."}</p>
          {!connected && <button type="button" onClick={openWallet}>Connect wallet</button>}
        </div>
      </Panel>

      {selectedPool && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal pool-detail-modal" role="dialog" aria-modal="true" aria-labelledby="pool-detail-title">
            <button className="app-modal-close" type="button" aria-label="Close pool details" onClick={() => setSelectedPool(null)}>×</button>
            <div className="pool-detail-pair"><TokenIcon symbol={selectedPool.a} /><TokenIcon symbol={selectedPool.b} /><div><h2 id="pool-detail-title">{selectedPool.a} / {selectedPool.b}</h2><span>{selectedPool.fee} fee tier</span></div></div>
            <dl className="review-details">
              <div><dt>Total value locked</dt><dd>{selectedPool.tvl}</dd></div>
              <div><dt>24h volume</dt><dd>{selectedPool.volume}</dd></div>
              <div><dt>Estimated APR</dt><dd className="positive">{selectedPool.apy}</dd></div>
            </dl>
            <button className="app-primary-button" type="button" onClick={() => {
              setSelectedPool(null);
              if (!connected) openWallet();
            }}>{connected ? "Add liquidity" : "Connect wallet"}</button>
          </div>
        </div>
      )}

      {toast && <Toast>Position ready to confirm in your wallet.</Toast>}
    </>
  );
}
