"use client";

import { useMemo, useState } from "react";

const features = [
  {
    icon: "✦",
    title: "Best price, every time",
    body: "Dubu compares prices across leading DEXs and builds the most efficient route in seconds.",
  },
  {
    icon: "↘",
    title: "More stays in your wallet",
    body: "Lower slippage, smarter gas estimates, and fewer hidden costs on every trade.",
  },
  {
    icon: "◇",
    title: "One trade. Many pools.",
    body: "Access deep liquidity across chains without managing multiple tabs or interfaces.",
  },
  {
    icon: "⌁",
    title: "Always non-custodial",
    body: "You approve every transaction. Dubu never takes control of your assets.",
  },
];

const stats = [
  ["$2.41B+", "Total volume aggregated"],
  ["1.2M+", "Swaps executed"],
  ["12,542+", "Active traders"],
  ["6+", "DEXs integrated"],
];

const routes = [
  { name: "1inch", width: "72%", tone: "gold" },
  { name: "Curve", width: "54%", tone: "blue" },
  { name: "Uniswap", width: "39%", tone: "pink" },
];

export default function Home() {
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Swap");
  const [fromToken, setFromToken] = useState<"ETH" | "USDC">("ETH");
  const [amount, setAmount] = useState("");

  const output = useMemo(() => {
    const value = Number.parseFloat(amount || "0");
    if (!Number.isFinite(value) || value <= 0) return "0";
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
    setFromToken((current) => (current === "ETH" ? "USDC" : "ETH"));
    setAmount(output.replaceAll(",", ""));
  }

  return (
    <main className={isDark ? "site dark" : "site"}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="nav-wrap">
        <a className="brand" href="#top" aria-label="Dubu home">
          <img src="/assets/Logo.png" alt="Dubu" />
        </a>

        <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Main navigation">
          <a href="/swap" onClick={() => setMenuOpen(false)}>Swap</a>
          <a href="#why" onClick={() => setMenuOpen(false)}>Why Dubu</a>
          <a href="#routing" onClick={() => setMenuOpen(false)}>Routing</a>
          <a href="/docs" onClick={() => setMenuOpen(false)}>Docs</a>
        </nav>

        <div className="nav-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setIsDark((current) => !current)}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
          >
            {isDark ? "☀" : "◔"}
          </button>
          <a className="button button-small button-primary" href="/swap">
            Launch app <span>↗</span>
          </a>
          <button
            className="menu-button"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>✦</span> The smartest way to trade</div>
          <h1>
            One swap.<br />
            Best price.<br />
            <em>Every time.</em>
          </h1>
          <p className="hero-lede">
            Dubu finds the most efficient swap route across decentralized
            exchanges—so you keep more of every trade.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/swap">Launch app <span>↗</span></a>
            <a className="button button-secondary" href="/analytics">Explore analytics</a>
          </div>
          <div className="social-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>SK</span><span>JL</span><span>AR</span><span>MH</span>
            </div>
            <p>Loved by <strong>12,542+</strong> traders</p>
          </div>
        </div>

        <div className="hero-product" id="swap">
          <div className="hero-cube cube-one" />
          <div className="hero-cube cube-two" />
          <div className="leaf leaf-one"><i /><i /><i /></div>
          <div className="swap-card">
            <div className="swap-header">
              <div className="tabs" role="tablist" aria-label="Order type">
                {["Swap", "Limit", "TWAP"].map((tab) => (
                  <button
                    key={tab}
                    className={activeTab === tab ? "active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button className="settings" type="button" aria-label="Swap settings">⚙</button>
            </div>

            <div className="token-box">
              <div className="token-meta">
                <span>You pay</span><span>Balance: —</span>
              </div>
              <div className="token-main">
                <button className="token-select" type="button" onClick={reversePair}>
                  <img
                    src={fromToken === "ETH" ? "/assets/asset_04.png" : "/assets/asset_05.png"}
                    alt=""
                  />
                  {fromToken} <span>⌄</span>
                </button>
                <label className="amount-field">
                  <span className="sr-only">Amount to swap</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    placeholder="0"
                    onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                    aria-label="Amount to swap"
                  />
                  <small>
                    {fromToken === "ETH"
                      ? `$${((Number(amount) || 0) * 2568.7).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                      : `$${(Number(amount) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                  </small>
                </label>
              </div>
            </div>

            <button className="reverse-button" type="button" onClick={reversePair} aria-label="Reverse token pair">↓</button>

            <div className="token-box token-box-to">
              <div className="token-meta">
                <span>You receive</span><span>Balance: —</span>
              </div>
              <div className="token-main">
                <button className="token-select" type="button" onClick={reversePair}>
                  <img
                    src={toToken === "ETH" ? "/assets/asset_04.png" : "/assets/asset_05.png"}
                    alt=""
                  />
                  {toToken} <span>⌄</span>
                </button>
                <div className="amount-field output">
                  <strong>{output}</strong>
                  <small>
                    {toToken === "USDC"
                      ? `$${output}`
                      : `$${((Number.parseFloat(output.replaceAll(",", "")) || 0) * 2543.71).toLocaleString("en-US", { maximumFractionDigits: 2 })} `}
                  </small>
                </div>
              </div>
            </div>

            <div className="route-summary">
              {Number(amount) > 0 && (
                <>
                  <div className="route-detail"><span>Rate</span><span>1 ETH = 2,543.71 USDC</span></div>
                  <div className="route-detail"><span>Price impact</span><span>0.08%</span></div>
                  <div className="route-detail"><span>Minimum received</span><span>{(Number(output.replaceAll(",", "")) * 0.995).toLocaleString("en-US", { maximumFractionDigits: 2 })} {toToken}</span></div>
                  <div className="route-detail"><span>Network cost</span><span>$6.18</span></div>
                </>
              )}
              <a className={`swap-button ${Number(amount) > 0 ? "" : "disabled"}`} href="/swap">
                {Number(amount) > 0 ? `Review ${activeTab.toLowerCase()} in app` : "Enter an amount"}
              </a>
            </div>
            <div className="powered">Rates refresh automatically before confirmation.</div>
          </div>
        </div>
      </section>

      <section className="trust-band" aria-label="Integrated exchanges">
        <p>Trusted by traders. Built on decentralization.</p>
        <div className="wordmarks" aria-label="1inch, Uniswap, Curve, Balancer, Kyber and PancakeSwap">
          <span>◒ 1inch</span>
          <span>♞ UNISWAP</span>
          <span>◐ Curve</span>
          <span>≋ BALANCER</span>
          <span>◈ kyber</span>
          <span>♙ PancakeSwap</span>
        </div>
      </section>

      <section className="section features-section" id="why">
        <div className="section-heading">
          <div className="eyebrow"><span>02</span> Why Dubu</div>
          <h2>Smarter swaps.<br /><em>Powered by DeFi.</em></h2>
          <p>Dubu brings fragmented liquidity together in one calm, precise trading experience.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature, index) => (
            <article className="feature-card" key={feature.title}>
              <div className="feature-number">0{index + 1}</div>
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section routing-section" id="routing">
        <div className="routing-copy">
          <div className="eyebrow"><span>03</span> Intelligent routing</div>
          <h2>Liquidity, stitched<br />together <em>beautifully.</em></h2>
          <p>
            One order can travel through multiple pools. Dubu evaluates price,
            depth, slippage, and gas together—then selects the route with the
            strongest net outcome.
          </p>
          <ul>
            <li><span>✓</span> Quote and gas optimized together</li>
            <li><span>✓</span> Protected from inefficient routes</li>
            <li><span>✓</span> Transparent before you confirm</li>
          </ul>
        </div>

        <div className="routing-visual" aria-label="Example of a smart swap route">
          <div className="route-orbit orbit-one" />
          <div className="route-orbit orbit-two" />
          <div className="route-token route-origin">
            <img src="/assets/asset_04.png" alt="" />
            <span>1.00 ETH</span>
          </div>
          <div className="route-lines">
            {routes.map((route) => (
              <div className="route-line" key={route.name}>
                <span>{route.name}</span>
                <i style={{ width: route.width }} className={route.tone} />
              </div>
            ))}
          </div>
          <div className="route-token route-destination">
            <img src="/assets/asset_05.png" alt="" />
            <span>2,543.71 USDC</span>
          </div>
          <div className="route-saving"><span>Net improvement</span><strong>+$24.68</strong></div>
          <img className="route-mascot" src="/assets/character.png" alt="Dubu mascot" />
        </div>
      </section>

      <section className="stats-wrap" id="analytics">
        <div className="stats-heading">
          <span>Live network pulse</span>
          <p>Aggregated across every Dubu route</p>
        </div>
        <div className="stats-grid">
          {stats.map(([value, label]) => (
            <div className="stat" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="quote-section" id="about">
        <img src="/assets/character.png" alt="" />
        <blockquote>
          “A good swap should feel quiet. No hunting across tabs, no second-guessing
          the route—just the best available price, clearly explained.”
        </blockquote>
        <p>Built for traders who value every basis point.</p>
      </section>

      <section className="cta-section">
        <div className="cta-glow" />
        <div className="eyebrow"><span>✦</span> Your next trade, simplified</div>
        <h2>One swap is all<br />it <em>takes.</em></h2>
        <p>Trade across DeFi with better pricing, lower friction, and total control.</p>
        <div className="hero-actions">
          <a className="button button-primary" href="/swap">Launch app <span>↗</span></a>
          <a className="button button-secondary" href="#routing">See how routing works</a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top" aria-label="Dubu home">
          <img src="/assets/Logo.png" alt="Dubu" />
        </a>
        <p>One swap. Best price. Every time.</p>
        <div className="footer-links">
          <a href="/swap">App</a>
          <a href="/analytics">Analytics</a>
          <a href="/docs">Docs</a>
          <a href="#about">X / Twitter</a>
        </div>
        <small>© 2026 Dubu Labs. Non-custodial by design.</small>
      </footer>
    </main>
  );
}
