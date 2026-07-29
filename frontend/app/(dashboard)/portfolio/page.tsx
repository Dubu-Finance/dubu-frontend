"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import {
  balanceOf,
  fromBaseUnits,
  TOKEN_LIST,
  TokenSymbol,
} from "@/app/lib/dubu";
import { fetchMarketSnapshot } from "@/app/lib/market-data";
import Sparkline from "@/app/components/Sparkline";

type PortfolioAsset = {
  symbol: TokenSymbol;
  name: string;
  amount: number;
  balance: string;
  price: number | null;
  value: number | null;
  history: number[];
};

const PORTFOLIO_TOKENS = TOKEN_LIST.filter(
  (token) => token.address !== null && token.symbol !== "mSPCX",
);

const MARKET_ID_BY_SYMBOL: Partial<Record<TokenSymbol, string>> = {
  mWETH: "mweth-musdc",
  mWBTC: "mwbtc-musdc",
  mBNB: "mbnb-musdc",
  mXRP: "mxrp-musdc",
  mSOL: "msol-musdc",
};

const RANGE_POINTS: Record<string, number> = {
  "24H": 24,
  "1W": 24 * 7,
  "1M": 24 * 30,
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
}

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2,
  });
}

export default function PortfolioPage() {
  const { connected, address, openWallet } = useAppWallet();
  const [range, setRange] = useState("24H");
  const [section, setSection] = useState<"Assets" | "Activity">("Assets");
  const [hideSmall, setHideSmall] = useState(false);
  const [query, setQuery] = useState("");
  const [inspectedAddress, setInspectedAddress] = useState("");
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState("");
  const [searchStatus, setSearchStatus] = useState("");

  const visibleAddress = inspectedAddress || address;
  const shortAddress = visibleAddress
    ? `${visibleAddress.slice(0, 8)}...${visibleAddress.slice(-6)}`
    : "No wallet selected";

  useEffect(() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(visibleAddress)) {
      setAssets([]);
      setPortfolioError("");
      setPortfolioLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setPortfolioLoading(true);
    setPortfolioError("");

    void Promise.all(
      PORTFOLIO_TOKENS.map(async (token): Promise<PortfolioAsset | null> => {
        try {
          const rawBalance = await balanceOf(
            token.address as `0x${string}`,
            visibleAddress as `0x${string}`,
          );
          const balance = fromBaseUnits(rawBalance, token.decimals, 8);
          const amount = Number(balance);

          if (token.symbol === "mUSDC") {
            return {
              symbol: token.symbol,
              name: token.name,
              amount,
              balance,
              price: 1,
              value: amount,
              history: [],
            };
          }

          const marketId = MARKET_ID_BY_SYMBOL[token.symbol];
          if (!marketId || rawBalance === 0n) {
            return {
              symbol: token.symbol,
              name: token.name,
              amount,
              balance,
              price: null,
              value: null,
              history: [],
            };
          }

          try {
            const snapshot = await fetchMarketSnapshot(marketId, "1h", controller.signal);
            const history = snapshot.candles.map((candle) => candle[5]);
            const price = snapshot.ticker?.lastPrice ?? history.at(-1) ?? null;
            return {
              symbol: token.symbol,
              name: token.name,
              amount,
              balance,
              price,
              value: price === null ? null : amount * price,
              history,
            };
          } catch {
            return {
              symbol: token.symbol,
              name: token.name,
              amount,
              balance,
              price: null,
              value: null,
              history: [],
            };
          }
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!active) return;
      if (results.every((result) => result === null)) {
        setAssets([]);
        setPortfolioError("Portfolio balances could not be loaded.");
      } else {
        setAssets(
          results
            .filter((asset): asset is PortfolioAsset => asset !== null)
            .filter((asset) => asset.amount > 0),
        );
      }
      setPortfolioLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [visibleAddress]);

  const pricedAssets = assets.filter((asset) => asset.value !== null);
  const unpricedAssets = assets.filter((asset) => asset.value === null);
  const estimatedValue = pricedAssets.reduce((sum, asset) => sum + (asset.value ?? 0), 0);
  const visibleAssets = hideSmall
    ? assets.filter((asset) => asset.value === null || asset.value >= 1)
    : assets;

  const chartData = useMemo(() => {
    if (pricedAssets.length === 0) return [];
    const pointCount = RANGE_POINTS[range];
    return Array.from({ length: pointCount }, (_, index) =>
      pricedAssets.reduce((total, asset) => {
        if (asset.symbol === "mUSDC" || asset.history.length === 0) {
          return total + asset.amount * (asset.price ?? 0);
        }
        const firstIndex = Math.max(0, asset.history.length - pointCount);
        const historyIndex = Math.min(asset.history.length - 1, firstIndex + index);
        return total + asset.amount * asset.history[historyIndex];
      }, 0),
    );
  }, [pricedAssets, range]);

  const identicon = useMemo(() => {
    const seed = visibleAddress || "dubu";
    return Array.from({ length: 16 }, (_, index) => {
      const code = seed.charCodeAt(index % seed.length) + index * 7;
      return code % 3 !== 0;
    });
  }, [visibleAddress]);

  function inspectAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = query.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
      setSearchStatus("Enter a valid 0x wallet address.");
      return;
    }
    setInspectedAddress(candidate);
    setSearchStatus("");
  }

  function resetToConnectedWallet() {
    setInspectedAddress("");
    setQuery("");
    setSearchStatus("");
  }

  return (
    <>
      <div className="wallet-portfolio-header">
        <AppPageHeader title="Portfolio" description="Track token balances and current market value." />
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
            <small>{portfolioLoading ? "Syncing balances" : visibleAddress ? "Onchain portfolio" : "Connect or search to begin"}</small>
          </div>
        </div>
        <div className="wallet-total-value">
          <small>Estimated portfolio value</small>
          <strong>{pricedAssets.length > 0 ? formatCurrency(estimatedValue) : "—"}</strong>
          <span>{portfolioLoading ? "Updating prices" : "Indexed market prices"}</span>
        </div>
        <div className="wallet-overview-actions">
          {inspectedAddress ? (
            <button type="button" onClick={resetToConnectedWallet}>Back to my wallet</button>
          ) : !connected ? (
            <button className="app-primary-button" type="button" onClick={openWallet}>Connect wallet</button>
          ) : (
            <span><i /> Updated onchain</span>
          )}
        </div>
      </Panel>
      {(searchStatus || portfolioError) && (
        <p className="portfolio-search-status" role="status">{searchStatus || portfolioError}</p>
      )}

      <Panel className="wallet-allocation-panel">
        <div className="wallet-allocation-head">
          <div>
            <span>Asset allocation</span>
            <strong>{assets.length > 0 ? `${assets.length} token${assets.length === 1 ? "" : "s"}` : "No assets loaded"}</strong>
          </div>
          <label>
            <span>Hide small balances</span>
            <button type="button" role="switch" aria-checked={hideSmall} className={hideSmall ? "active" : ""} onClick={() => setHideSmall((current) => !current)}><i /></button>
          </label>
        </div>
        <div className="wallet-allocation-bar"><span style={{ width: pricedAssets.length > 0 ? "100%" : "0%" }} /></div>
        <div className="wallet-allocation-legend">
          <span><i /> {pricedAssets.length} priced asset{pricedAssets.length === 1 ? "" : "s"}</span>
          <strong>{unpricedAssets.length > 0 ? `${unpricedAssets.length} awaiting price` : pricedAssets.length > 0 ? "Live valuation" : "—"}</strong>
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
              <div><small>Total value</small><strong>{pricedAssets.length > 0 ? formatCurrency(estimatedValue) : "—"}</strong></div>
              <div role="tablist" aria-label="Chart range">
                {Object.keys(RANGE_POINTS).map((item) => (
                  <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>
                ))}
              </div>
            </div>
            {chartData.length > 0 ? (
              <>
                <Sparkline data={chartData} height={220} grid label={`${range} portfolio value`} />
                <div className="portfolio-chart-axis"><span>{range === "24H" ? "24 hours ago" : `${range} ago`}</span><span>Midpoint</span><span>Now</span></div>
                <p className="portfolio-data-note">Current token balances valued against indexed hourly market prices.</p>
              </>
            ) : (
              <div className="portfolio-chart-empty">
                <span>⌁</span>
                <strong>{portfolioLoading ? "Loading portfolio" : "No priced assets"}</strong>
                <p>{portfolioLoading ? "Reading token balances and market prices." : "Connect a wallet or search an address with supported assets."}</p>
              </div>
            )}
          </Panel>

          <Panel className="wallet-assets-panel">
            <div className="wallet-assets-head">
              <div><h2>Tokens</h2><span>{assets.length} asset{assets.length === 1 ? "" : "s"}</span></div>
              <span>ERC-20 balances</span>
            </div>
            <div className="app-table-wrap">
              <table className="app-table wallet-assets-table">
                <thead><tr><th>Token</th><th>Type</th><th>Balance</th><th>Price</th><th>Value</th></tr></thead>
                {visibleAssets.length > 0 && (
                  <tbody>
                    {visibleAssets.map((asset) => (
                      <tr key={asset.symbol}>
                        <td>
                          <div className="wallet-token-cell">
                            <TokenIcon symbol={asset.symbol} />
                            <div><strong>{asset.name}</strong><small>{asset.symbol}</small></div>
                          </div>
                        </td>
                        <td><span className="wallet-native-badge">Token</span></td>
                        <td>{asset.balance} {asset.symbol}</td>
                        <td>{asset.price === null ? "—" : formatPrice(asset.price)}</td>
                        <td><strong>{asset.value === null ? "—" : formatCurrency(asset.value)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
              {!portfolioLoading && visibleAssets.length === 0 && (
                <div className="wallet-assets-empty">
                  <strong>No token balances</strong>
                  <p>{hideSmall && assets.length > 0 ? "Small balances are currently hidden." : "Supported token balances will appear here."}</p>
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
