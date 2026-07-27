"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AppPageHeader,
  Panel,
  useAppWallet,
} from "@/app/components/AppShell";

export default function PortfolioPage() {
  const { connected, address, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const [tab, setTab] = useState<"Positions" | "History" | "Closed">("Positions");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [search, setSearch] = useState("");
  const shortAddress = address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "";

  const emptyTitle = tab === "Positions"
    ? connected ? "No open positions" : "Connect your wallet"
    : tab === "History"
      ? "No position history"
      : "No closed positions";
  const emptyDescription = tab === "Positions"
    ? connected
      ? "Deposit liquidity into a Dubu pool to create your first position."
      : "Connect a wallet to view liquidity, fees earned, and active price ranges."
    : tab === "History"
      ? "Liquidity deposits, withdrawals, and fee collections will appear here."
      : "Positions removed from Dubu pools will appear here.";

  function handleEmptyAction() {
    if (!connected) {
      openWallet();
      return;
    }
    if (!onGiwa) void switchToGiwa();
  }

  return (
    <>
      <div className="lp-portfolio-header">
        <AppPageHeader
          title="Portfolio"
          description="View and manage your Dubu liquidity positions on GIWA Sepolia."
        />
        {connected && (
          <div className="portfolio-account-chip">
            <span className="app-wallet-orb" />
            <div><strong>{shortAddress}</strong><small>{onGiwa ? "GIWA Sepolia" : "Unsupported network"}</small></div>
          </div>
        )}
      </div>

      <Panel className="lp-summary-bar">
        <div className="lp-summary-primary">
          <small>Total position value</small>
          <strong>—</strong>
          <span>{connected ? "Awaiting indexer" : "Wallet not connected"}</span>
        </div>
        <div className="lp-summary-metric">
          <small>Total liquidity value</small>
          <strong>—</strong>
        </div>
        <div className="lp-summary-metric">
          <small>Estimated fees (24H)</small>
          <strong>—</strong>
        </div>
        <div className="lp-summary-metric lp-pending-fees">
          <div><small>Pending fees</small><strong>—</strong></div>
          <button type="button" disabled>Collect all</button>
        </div>
      </Panel>

      <Panel className={`lp-portfolio-panel ${layout === "grid" ? "grid-view" : ""}`}>
        <div className="lp-portfolio-topline">
          <div className="lp-view-tabs" role="tablist" aria-label="Portfolio type">
            <button type="button" role="tab" aria-selected className="active">Liquidity positions</button>
          </div>
          <Link className="lp-add-position-link" href="/pools">＋ Add liquidity</Link>
        </div>

        <div className="lp-position-toolbar">
          <div className="lp-subtabs" role="tablist" aria-label="Position status">
            {([
              ["Positions", "Positions"],
              ["History", "History"],
              ["Closed", "Closed positions"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="lp-toolbar-actions">
            <label className="app-search lp-position-search">
              <span>⌕</span>
              <input
                aria-label="Search positions"
                placeholder="Search tokens or pools"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="lp-view-toggle" aria-label="Position layout">
              <button type="button" className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")} aria-label="List view">☷</button>
              <button type="button" className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")} aria-label="Grid view">▦</button>
            </div>
            <button className="lp-tool-button" type="button" aria-label="Portfolio settings" title="Portfolio settings">⚙</button>
            <button className="lp-tool-button" type="button" disabled aria-label="Export positions" title="Export positions">⇩</button>
          </div>
        </div>

        <div className="app-table-wrap lp-position-table-wrap">
          <table className="app-table lp-position-table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Balance</th>
                <th>Total PnL</th>
                <th>Pending fees</th>
                <th>Est. APR</th>
                <th>Position range</th>
                <th>Current price</th>
              </tr>
            </thead>
          </table>
          <div className="lp-empty-state">
            <div className="lp-empty-visual" aria-hidden="true"><span /><i>◇</i></div>
            <strong>{emptyTitle}</strong>
            <p>{emptyDescription}</p>
            {tab === "Positions" && (
              connected && onGiwa
                ? <Link className="app-primary-button lp-empty-action" href="/pools">Explore pools</Link>
                : (
                  <button className="app-primary-button lp-empty-action" type="button" onClick={handleEmptyAction}>
                    {connected ? "Switch to GIWA" : "Connect wallet"}
                  </button>
                )
            )}
          </div>
        </div>
        <div className="lp-indexer-note"><span>i</span> Position balances and performance populate from the Dubu indexer.</div>
      </Panel>
    </>
  );
}
