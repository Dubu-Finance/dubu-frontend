"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import Sparkline from "@/app/components/Sparkline";

const ETH_USD_PRICE = 2568.7;
const historyShape: Record<string, number[]> = {
  "24H": [92, 94, 93, 96, 97, 95, 99, 101, 100, 102, 103, 101, 104, 106, 105, 108],
  "1W": [80, 82, 85, 83, 88, 91, 89, 94, 96, 95, 99, 102, 100, 105, 108, 110],
  "1M": [72, 76, 74, 81, 79, 84, 87, 92, 89, 95, 98, 96, 102, 106, 104, 110],
  "1Y": [45, 51, 48, 58, 63, 61, 72, 69, 78, 86, 81, 92, 89, 101, 106, 110],
};

export default function PortfolioPage() {
  const { connected, address, ethBalance, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const [range, setRange] = useState("24H");
  const [section, setSection] = useState<"Assets" | "Activity">("Assets");
  const [hideSmall, setHideSmall] = useState(false);
  const [query, setQuery] = useState("");
  const [inspectedAddress, setInspectedAddress] = useState("");
  const [inspectedBalance, setInspectedBalance] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState("");

  const visibleAddress = inspectedAddress || address;
  const visibleBalance = inspectedAddress ? inspectedBalance : ethBalance;
  const numericBalance = Number(visibleBalance ?? 0);
  const estimatedValue = numericBalance * ETH_USD_PRICE;
  const shortAddress = visibleAddress
    ? `${visibleAddress.slice(0, 8)}...${visibleAddress.slice(-6)}`
    : "No wallet selected";
  const chartData = useMemo(() => {
    const scale = estimatedValue > 0 ? estimatedValue / 110 : 1;
    return historyShape[range].map((point) => point * scale);
  }, [estimatedValue, range]);
  const identicon = useMemo(() => {
    const seed = visibleAddress || "dubu";
    return Array.from({ length: 16 }, (_, index) => {
      const code = seed.charCodeAt(index % seed.length) + index * 7;
      return code % 3 !== 0;
    });
  }, [visibleAddress]);

  async function inspectAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = query.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
      setSearchStatus("Enter a valid 0x wallet address.");
      return;
    }
    if (!window.ethereum) {
      setSearchStatus("Connect a wallet to search addresses.");
      return;
    }
    if (!onGiwa) {
      setSearchStatus("Switch your browser wallet to GIWA Sepolia first.");
      return;
    }

    setSearchStatus("Loading address…");
    try {
      const value = await window.ethereum.request({
        method: "eth_getBalance",
        params: [candidate, "latest"],
      });
      const wei = BigInt(String(value));
      setInspectedAddress(candidate);
      setInspectedBalance((Number(wei) / 1e18).toFixed(4));
      setSearchStatus("");
    } catch {
      setSearchStatus("We couldn’t load this address. Try again.");
    }
  }

  function resetToConnectedWallet() {
    setInspectedAddress("");
    setInspectedBalance(null);
    setQuery("");
    setSearchStatus("");
  }

  return (
    <>
      <div className="wallet-portfolio-header">
        <AppPageHeader title="Portfolio" description="Track wallet assets and onchain activity on GIWA Sepolia." />
        <form className="portfolio-address-search" onSubmit={inspectAddress}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet address" aria-label="Wallet address" />
          <button type="submit">View</button>
        </form>
      </div>

      <Panel className="wallet-overview-panel">
        <div className="wallet-identity-block">
          <div className="wallet-identicon" aria-hidden="true">
            {identicon.map((active, index) => <i key={index} className={active ? "active" : ""} />)}
          </div>
          <div>
            <span>{inspectedAddress ? "Viewing address" : connected ? "Connected wallet" : "Portfolio"}</span>
            <strong>{shortAddress}</strong>
            <small>{onGiwa ? "GIWA Sepolia" : connected ? "Unsupported network" : "Connect to begin"}</small>
          </div>
        </div>
        <div className="wallet-total-value">
          <small>Estimated portfolio value</small>
          <strong>{visibleBalance ? `$${estimatedValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</strong>
          <span>GIWA Sepolia</span>
        </div>
        <div className="wallet-overview-actions">
          {inspectedAddress ? (
            <button type="button" onClick={resetToConnectedWallet}>Back to my wallet</button>
          ) : !connected ? (
            <button className="app-primary-button" type="button" onClick={openWallet}>Connect wallet</button>
          ) : !onGiwa ? (
            <button className="app-primary-button" type="button" onClick={() => void switchToGiwa()}>Switch to GIWA</button>
          ) : (
            <span><i /> Updated from wallet</span>
          )}
        </div>
      </Panel>
      {searchStatus && <p className="portfolio-search-status" role="status">{searchStatus}</p>}

      <Panel className="wallet-allocation-panel">
        <div className="wallet-allocation-head">
          <div><span>Asset allocation</span><strong>{visibleBalance ? "Native assets" : "No assets loaded"}</strong></div>
          <label>
            <span>Hide small balances</span>
            <button type="button" role="switch" aria-checked={hideSmall} className={hideSmall ? "active" : ""} onClick={() => setHideSmall((current) => !current)}><i /></button>
          </label>
        </div>
        <div className="wallet-allocation-bar"><span style={{ width: visibleBalance ? "100%" : "0%" }} /></div>
        <div className="wallet-allocation-legend">
          <span><i /> ETH · Native</span>
          <strong>{visibleBalance ? "100%" : "—"}</strong>
        </div>
      </Panel>

      <div className="wallet-section-tabs" role="tablist" aria-label="Portfolio section">
        {(["Assets", "Activity"] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={section === item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>
            {item}
          </button>
        ))}
      </div>

      {section === "Assets" ? (
        <>
          <Panel className="portfolio-value-chart">
            <div className="portfolio-chart-head">
              <div><small>Total value</small><strong>{visibleBalance ? `$${estimatedValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</strong></div>
              <div role="tablist" aria-label="Chart range">
                {Object.keys(historyShape).map((item) => (
                  <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>
                ))}
              </div>
            </div>
            {visibleBalance ? (
              <>
                <Sparkline data={chartData} height={220} grid label={`${range} portfolio value`} />
                <div className="portfolio-chart-axis"><span>{range === "24H" ? "Earlier" : "Start"}</span><span>Midpoint</span><span>Now</span></div>
              </>
            ) : (
              <div className="portfolio-chart-empty"><span>⌁</span><strong>No portfolio data</strong><p>Connect a wallet or search an address to view its balance.</p></div>
            )}
          </Panel>

          <Panel className="wallet-assets-panel">
            <div className="wallet-assets-head">
              <div><h2>Tokens</h2><span>{visibleBalance ? "1 asset" : "0 assets"}</span></div>
              <span>GIWA Sepolia</span>
            </div>
            <div className="app-table-wrap">
              <table className="app-table wallet-assets-table">
                <thead><tr><th>Token</th><th>Type</th><th>Balance</th><th>Price</th><th>Value</th></tr></thead>
                {visibleBalance && (
                  <tbody>
                    <tr>
                      <td><div className="wallet-token-cell"><TokenIcon symbol="ETH" /><div><strong>Ether</strong><small>ETH</small></div></div></td>
                      <td><span className="wallet-native-badge">Native</span></td>
                      <td>{visibleBalance} ETH</td>
                      <td>${ETH_USD_PRICE.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td><strong>${estimatedValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong></td>
                    </tr>
                  </tbody>
                )}
              </table>
              {!visibleBalance && (
                <div className="wallet-assets-empty">
                  <strong>No assets to display</strong>
                  <p>Wallet balances will appear here after connection.</p>
                </div>
              )}
            </div>
          </Panel>
        </>
      ) : (
        <Panel className="wallet-activity-panel">
          <div className="wallet-activity-head"><h2>Activity</h2><span>Swaps and orders</span></div>
          <div className="wallet-activity-empty"><span>↗</span><strong>No Dubu activity yet</strong><p>Completed swaps, limit orders, and approvals will appear here.</p></div>
        </Panel>
      )}
    </>
  );
}
