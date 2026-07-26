"use client";

import { useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  ProtocolIcon,
  SectionTitle,
  Toast,
  TokenIcon,
} from "@/app/components/AppShell";
import Sparkline from "@/app/components/Sparkline";

const marketData = [
  45, 49, 41, 36, 43, 39, 44, 41, 47, 53, 65, 58, 61, 56, 62, 57, 68, 65,
  54, 49, 41, 39, 52, 58, 67, 71, 66, 56, 54, 48, 47, 43, 44, 51, 59, 55,
];

const routes = [
  {
    name: "1inch → Curve → Uniswap V3",
    protocols: ["1inch", "Curve", "Uniswap V3"],
    receive: "2,543.71",
    impact: "0.50%",
    fee: "$2.11",
    gas: "0.0032 ETH",
    gasFiat: "$8.21",
  },
  {
    name: "Uniswap V3 → Curve",
    protocols: ["Uniswap V3", "Curve"],
    receive: "2,533.88",
    impact: "0.81%",
    fee: "$2.45",
    gas: "0.0021 ETH",
    gasFiat: "$5.61",
  },
  {
    name: "0x → Uniswap V3 → Curve",
    protocols: ["0x", "Uniswap V3", "Curve"],
    receive: "2,529.21",
    impact: "1.28%",
    fee: "$2.34",
    gas: "0.0031 ETH",
    gasFiat: "$7.95",
  },
];

export default function SwapPage() {
  const [fromToken, setFromToken] = useState<"ETH" | "USDC">("ETH");
  const [amount, setAmount] = useState("1.00");
  const [period, setPeriod] = useState("24H");
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState(false);

  const receive = useMemo(() => {
    const value = Number.parseFloat(amount || "0");
    if (!Number.isFinite(value)) return "0.00";
    return fromToken === "ETH"
      ? (value * 2543.71).toLocaleString("en-US", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        })
      : (value / 2543.71).toLocaleString("en-US", {
          maximumFractionDigits: 5,
        });
  }, [amount, fromToken]);

  const toToken = fromToken === "ETH" ? "USDC" : "ETH";

  function reversePair() {
    setFromToken((token) => (token === "ETH" ? "USDC" : "ETH"));
    setAmount(receive.replaceAll(",", ""));
  }

  function confirmSwap() {
    setReviewOpen(false);
    setToast(true);
    window.setTimeout(() => setToast(false), 2600);
  }

  return (
    <>
      <AppPageHeader title="Swap" description="Find the best route across leading DEXs." />

      <div className="swap-top-grid">
        <Panel className="swap-builder">
          <div className="swap-token-card">
            <div className="swap-token-meta">
              <strong>From</strong>
              <span>Balance: 2.5687 {fromToken}</span>
            </div>
            <div className="swap-token-row">
              <button className="token-picker" type="button" onClick={reversePair}>
                <TokenIcon symbol={fromToken} />
                <strong>{fromToken}</strong>
                <span>⌄</span>
              </button>
              <label>
                <span className="sr-only">Amount to swap</span>
                <input
                  value={amount}
                  inputMode="decimal"
                  aria-label="Amount to swap"
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                />
                <small>
                  {fromToken === "ETH"
                    ? `$${((Number(amount) || 0) * 2568.7).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                    : `$${(Number(amount) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                </small>
              </label>
            </div>
          </div>

          <button className="swap-reverse" type="button" onClick={reversePair} aria-label="Reverse token pair">⇅</button>

          <div className="swap-token-card">
            <div className="swap-token-meta">
              <strong>To (estimated)</strong>
              <span>Balance: 1,234.56 {toToken}</span>
            </div>
            <div className="swap-token-row">
              <button className="token-picker" type="button" onClick={reversePair}>
                <TokenIcon symbol={toToken} />
                <strong>{toToken}</strong>
                <span>⌄</span>
              </button>
              <div className="swap-output">
                <strong>{receive}</strong>
                <small>
                  ${receive} <b>(+0.97%)</b>
                </small>
              </div>
            </div>
          </div>

          <button className="app-primary-button" type="button" onClick={() => setReviewOpen(true)}>
            Review Swap
          </button>
        </Panel>

        <div className="swap-insights">
          <Panel className="market-panel">
            <SectionTitle
              action={
                <div className="segmented-control">
                  {["24H", "7D", "30D"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={period === item ? "active" : ""}
                      onClick={() => setPeriod(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              }
            >
              Market overview
            </SectionTitle>
            <div className="market-price-label">ETH / USDC</div>
            <div className="market-price">
              <strong>2,543.71</strong>
              <span>+0.97%</span>
            </div>
            <Sparkline data={marketData} height={92} label={`${period} ETH to USDC price chart`} />
            <div className="market-metrics">
              <div><span>Low ({period.toLowerCase()})</span><strong>2,475.21</strong></div>
              <div><span>High ({period.toLowerCase()})</span><strong>2,602.34</strong></div>
              <div><span>Vol ({period.toLowerCase()})</span><strong>$1.24B</strong></div>
            </div>
          </Panel>

          <Panel className="best-route-panel">
            <div className="best-route-head">
              <span>✦ Best route</span>
              <strong>{routes[selectedRoute].name}</strong>
            </div>
            <div className="best-route-body">
              <div>
                <span>You receive (est.)</span>
                <strong>{receive} <small>{toToken}</small></strong>
                <b>+0.97% <em>vs. market</em></b>
              </div>
              <dl>
                <div><dt>Price impact</dt><dd>{routes[selectedRoute].impact}</dd></div>
                <div><dt>Network fee</dt><dd>{routes[selectedRoute].fee}</dd></div>
                <div><dt>Est. gas</dt><dd>{routes[selectedRoute].gas} ({routes[selectedRoute].gasFiat})</dd></div>
              </dl>
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="route-table-panel">
        <SectionTitle action={<button className="text-action" type="button">ⓘ Learn more</button>}>
          Route comparison
        </SectionTitle>
        <div className="app-table-wrap">
          <table className="app-table route-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Route</th>
                <th>DEXes</th>
                <th>You receive ({toToken})</th>
                <th>Price impact</th>
                <th>Network fee</th>
                <th>Est. gas</th>
                <th aria-label="Select route" />
              </tr>
            </thead>
            <tbody>
              {routes.map((route, index) => (
                <tr key={route.name} className={selectedRoute === index ? "selected-row" : ""}>
                  <td>{index + 1}</td>
                  <td>
                    <div className="route-name-cell">
                      {index === 0 && <span className="best-pill">Best</span>}
                      <span>{route.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="protocol-stack">
                      {route.protocols.map((protocol) => <ProtocolIcon key={protocol} name={protocol} />)}
                    </div>
                  </td>
                  <td><strong>{route.receive}</strong><small>${route.receive}</small></td>
                  <td className="positive">{route.impact}</td>
                  <td>{route.fee}</td>
                  <td><strong>{route.gas}</strong><small>({route.gasFiat})</small></td>
                  <td>
                    <button
                      className={selectedRoute === index ? "route-radio checked" : "route-radio"}
                      type="button"
                      aria-label={`Select ${route.name}`}
                      aria-pressed={selectedRoute === index}
                      onClick={() => setSelectedRoute(index)}
                    >
                      <span />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="table-more" type="button">Show more routes <span>⌄</span></button>
      </Panel>

      {reviewOpen && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <button className="app-modal-close" type="button" aria-label="Close review" onClick={() => setReviewOpen(false)}>×</button>
            <div className="modal-mascot"><img src="/assets/character.png" alt="" /></div>
            <h2 id="review-title">Review your swap</h2>
            <p>Dubu found the strongest net route for this trade.</p>
            <div className="review-pair">
              <div><TokenIcon symbol={fromToken} /><span>You pay</span><strong>{amount || "0"} {fromToken}</strong></div>
              <span>↓</span>
              <div><TokenIcon symbol={toToken} /><span>You receive</span><strong>{receive} {toToken}</strong></div>
            </div>
            <dl className="review-details">
              <div><dt>Route</dt><dd>{routes[selectedRoute].name}</dd></div>
              <div><dt>Network fee</dt><dd>{routes[selectedRoute].fee}</dd></div>
              <div><dt>Minimum received</dt><dd>{(Number(receive.replaceAll(",", "")) * 0.995).toLocaleString("en-US", { maximumFractionDigits: 2 })} {toToken}</dd></div>
            </dl>
            <button className="app-primary-button" type="button" onClick={confirmSwap}>Confirm Swap</button>
            <button className="app-quiet-button" type="button" onClick={() => setReviewOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {toast && <Toast>Swap preview confirmed. No transaction was submitted.</Toast>}
    </>
  );
}
