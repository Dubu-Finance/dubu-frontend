"use client";

import { useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  Toast,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";

const pools = [
  { a: "ETH", b: "USDC", model: "Volatile", fee: "0.30%", accent: "gold" },
  { a: "USDC", b: "USDT", model: "Stable", fee: "0.05%", accent: "green" },
  { a: "ETH", b: "USDT", model: "Volatile", fee: "0.30%", accent: "blue" },
  { a: "WBTC", b: "ETH", model: "Volatile", fee: "0.30%", accent: "orange" },
  { a: "ETH", b: "DAI", model: "Volatile", fee: "0.30%", accent: "violet" },
];

type Pool = (typeof pools)[number];

export default function PoolsPage() {
  const { connected, ethBalance, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const [activeTab, setActiveTab] = useState<"Explore" | "Positions">("Explore");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [composerPool, setComposerPool] = useState<Pool | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [feeTier, setFeeTier] = useState("0.30%");
  const [toast, setToast] = useState("");

  const filteredPools = useMemo(() => pools.filter((pool) => {
    const pair = `${pool.a}/${pool.b}`.toLowerCase();
    const matchesSearch = pair.includes(search.trim().toLowerCase());
    const matchesFilter = filter === "All" || pool.model === filter;
    return matchesSearch && matchesFilter;
  }), [filter, search]);

  function openComposer(pool = pools[0]) {
    setComposerPool(pool);
    setFeeTier(pool.fee);
    setAmountA("");
    setAmountB("");
  }

  function handlePositionAction() {
    if (!connected) {
      openWallet();
      return;
    }
    if (!onGiwa) {
      void switchToGiwa();
      return;
    }
    if (!amountA || !amountB) return;

    setComposerPool(null);
    setToast("Position prepared. Confirm the final amounts in your wallet.");
    window.setTimeout(() => setToast(""), 3000);
  }

  const positionActionLabel = !connected
    ? "Connect wallet"
    : !onGiwa
      ? "Switch to GIWA"
      : !amountA || !amountB
        ? "Enter both amounts"
        : "Review position";

  return (
    <>
      <div className="dex-pools-header">
        <AppPageHeader
          title="Liquidity"
          description="Explore Dubu pools and provide liquidity on GIWA Sepolia."
        />
        <div className="dex-pools-header-actions">
          <button className="pool-secondary-action" type="button" onClick={() => setActiveTab("Positions")}>
            Your positions
          </button>
          <button className="app-primary-button pool-create-button" type="button" onClick={() => openComposer()}>
            <span>＋</span> New position
          </button>
        </div>
      </div>

      <Panel className="pool-market-strip">
        <div className="pool-market-network">
          <span className="giwa-chain-mark">G</span>
          <div><small>Network</small><strong>GIWA Sepolia</strong></div>
          <b>Testnet</b>
        </div>
        <div><small>AMM model</small><strong>Dubu proprietary</strong></div>
        <div><small>Total liquidity</small><strong>—</strong><span>Indexer required</span></div>
        <div><small>24h volume</small><strong>—</strong><span>Indexer required</span></div>
        <div><small>24h fees</small><strong>—</strong><span>Indexer required</span></div>
      </Panel>

      <Panel className="dex-pool-browser">
        <div className="dex-pool-browser-head">
          <div className="pool-page-tabs" role="tablist" aria-label="Liquidity view">
            {(["Explore", "Positions"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "Explore" ? "Explore pools" : "My positions"}
              </button>
            ))}
          </div>
          {activeTab === "Explore" && (
            <div className="pool-browser-tools">
              <label className="app-search pool-search">
                <span>⌕</span>
                <input
                  aria-label="Search pools"
                  placeholder="Search token or pair"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="pool-filter-group" aria-label="Pool type filter">
                {["All", "Stable", "Volatile"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={filter === item ? "active" : ""}
                    onClick={() => setFilter(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {activeTab === "Explore" ? (
          <>
            <div className="pool-list-caption">
              <span>{filteredPools.length} available pools</span>
              <p>Live pool metrics appear after the Dubu indexer and contracts are connected.</p>
            </div>
            <div className="app-table-wrap pool-explorer-table-wrap">
              <table className="app-table pool-explorer-table">
                <thead>
                  <tr>
                    <th>Pool</th>
                    <th>Model</th>
                    <th>Fee tier</th>
                    <th>TVL</th>
                    <th>24h volume</th>
                    <th>APR</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredPools.map((pool) => (
                    <tr key={`${pool.a}-${pool.b}`}>
                      <td>
                        <div className="pool-pair pool-pair-rich">
                          <span className={`pool-token-stack pool-accent-${pool.accent}`}>
                            <TokenIcon symbol={pool.a} />
                            <TokenIcon symbol={pool.b} />
                          </span>
                          <div><strong>{pool.a} / {pool.b}</strong><small>GIWA Sepolia</small></div>
                        </div>
                      </td>
                      <td><span className={`pool-model-badge ${pool.model.toLowerCase()}`}>{pool.model}</span></td>
                      <td>{pool.fee}</td>
                      <td className="pool-data-pending">—</td>
                      <td className="pool-data-pending">—</td>
                      <td className="pool-data-pending">—</td>
                      <td>
                        <button
                          className="pool-row-action"
                          type="button"
                          onClick={() => setSelectedPool(pool)}
                          aria-label={`View ${pool.a} ${pool.b} pool`}
                        >
                          View <span>›</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredPools.length === 0 && (
                    <tr><td colSpan={7} className="empty-cell">No pools match this search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="pool-positions-state">
            <div className="pool-position-visual" aria-hidden="true">
              <span />
              <span />
              <i>◇</i>
            </div>
            <strong>{connected ? "No liquidity positions yet" : "Connect your wallet"}</strong>
            <p>
              {connected
                ? "Your active Dubu liquidity positions on GIWA Sepolia will appear here."
                : "Connect a wallet to view positions, fees earned, and pool share."}
            </p>
            <button
              className="app-primary-button pool-empty-action"
              type="button"
              onClick={connected ? () => openComposer() : openWallet}
            >
              {connected ? "Create a position" : "Connect wallet"}
            </button>
          </div>
        )}
      </Panel>

      <section className="pool-education-grid" aria-label="Liquidity provider information">
        <article>
          <span>01</span>
          <div><strong>Choose a pool</strong><p>Select a pair and fee tier that matches the market you want to support.</p></div>
        </article>
        <article>
          <span>02</span>
          <div><strong>Deposit both assets</strong><p>Your position receives pool tokens representing its share of liquidity.</p></div>
        </article>
        <article>
          <span>03</span>
          <div><strong>Earn swap fees</strong><p>Fees accrue to the pool and can be collected with your position.</p></div>
        </article>
      </section>

      {selectedPool && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal pool-detail-modal redesigned" role="dialog" aria-modal="true" aria-labelledby="pool-detail-title">
            <button className="app-modal-close" type="button" aria-label="Close pool details" onClick={() => setSelectedPool(null)}>×</button>
            <div className="pool-detail-pair">
              <span className={`pool-token-stack pool-accent-${selectedPool.accent}`}>
                <TokenIcon symbol={selectedPool.a} />
                <TokenIcon symbol={selectedPool.b} />
              </span>
              <div>
                <small>Dubu {selectedPool.model} pool</small>
                <h2 id="pool-detail-title">{selectedPool.a} / {selectedPool.b}</h2>
                <span>{selectedPool.fee} fee tier · GIWA Sepolia</span>
              </div>
            </div>
            <dl className="pool-detail-stats">
              <div><dt>Total liquidity</dt><dd>—<small>Indexer required</small></dd></div>
              <div><dt>24h volume</dt><dd>—<small>Indexer required</small></dd></div>
              <div><dt>Estimated APR</dt><dd>—<small>Indexer required</small></dd></div>
            </dl>
            <div className="pool-contract-note">
              <span>i</span>
              Pool identifiers and live pricing will be displayed when the Dubu AMM contracts are configured.
            </div>
            <button className="app-primary-button" type="button" onClick={() => {
              const pool = selectedPool;
              setSelectedPool(null);
              openComposer(pool);
            }}>
              Add liquidity
            </button>
          </div>
        </div>
      )}

      {composerPool && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal liquidity-composer-modal" role="dialog" aria-modal="true" aria-labelledby="position-title">
            <button className="app-modal-close" type="button" aria-label="Close new position" onClick={() => setComposerPool(null)}>×</button>
            <div className="composer-heading">
              <span>New position</span>
              <h2 id="position-title">Add liquidity</h2>
              <p>Choose deposit amounts and review the position before confirming in your wallet.</p>
            </div>

            <div className="composer-pair-card">
              <div className="composer-pair-title">
                <span className={`pool-token-stack pool-accent-${composerPool.accent}`}>
                  <TokenIcon symbol={composerPool.a} />
                  <TokenIcon symbol={composerPool.b} />
                </span>
                <div><strong>{composerPool.a} / {composerPool.b}</strong><small>{composerPool.model} pool</small></div>
                <button type="button" onClick={() => {
                  const index = pools.indexOf(composerPool);
                  openComposer(pools[(index + 1) % pools.length]);
                }}>Change</button>
              </div>
              <div className="composer-fee-row">
                <span>Fee tier</span>
                <div>
                  {["0.05%", "0.30%", "1.00%"].map((tier) => (
                    <button key={tier} type="button" className={feeTier === tier ? "active" : ""} onClick={() => setFeeTier(tier)}>
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="composer-deposit">
              <div className="composer-deposit-label"><strong>Deposit amounts</strong><span>Balance: {connected && ethBalance ? `${ethBalance} ETH` : "—"}</span></div>
              <label>
                <input aria-label={`${composerPool.a} amount`} inputMode="decimal" value={amountA} placeholder="0.0" onChange={(event) => setAmountA(event.target.value.replace(/[^0-9.]/g, ""))} />
                <span><TokenIcon symbol={composerPool.a} />{composerPool.a}</span>
              </label>
              <label>
                <input aria-label={`${composerPool.b} amount`} inputMode="decimal" value={amountB} placeholder="0.0" onChange={(event) => setAmountB(event.target.value.replace(/[^0-9.]/g, ""))} />
                <span><TokenIcon symbol={composerPool.b} />{composerPool.b}</span>
              </label>
            </div>

            <dl className="composer-summary">
              <div><dt>Network</dt><dd>GIWA Sepolia</dd></div>
              <div><dt>Fee tier</dt><dd>{feeTier}</dd></div>
              <div><dt>Price range</dt><dd>Full range</dd></div>
              <div><dt>Deposit ratio</dt><dd>50% / 50%</dd></div>
            </dl>
            <p className="composer-disclaimer">Final amounts and price are calculated from live pool state before wallet confirmation.</p>
            <button className="app-primary-button" type="button" disabled={connected && onGiwa && (!amountA || !amountB)} onClick={handlePositionAction}>
              {positionActionLabel}
            </button>
          </div>
        </div>
      )}

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
