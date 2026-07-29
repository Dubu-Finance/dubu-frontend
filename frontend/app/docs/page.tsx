"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CONTRACTS, MARKETS, TOKENS } from "@/app/lib/dubu";
import "./docs.css";

const docGroups = [
  {
    title: "Getting started",
    items: [
      ["Overview", "overview"],
      ["Connect a wallet", "how-swaps-work"],
      ["Your first swap", "how-swaps-work"],
    ],
  },
  {
    title: "Trading",
    items: [
      ["Quotes & pricing", "execution-details"],
      ["Routes", "execution-details"],
      ["Slippage", "execution-details"],
      ["Limit orders", "execution-details"],
    ],
  },
  {
    title: "Portfolio",
    items: [
      ["Wallet overview", "next-steps"],
      ["Asset balances", "next-steps"],
      ["Activity history", "next-steps"],
    ],
  },
  {
    title: "Network",
    items: [
      ["Network details", "network"],
      ["Supported assets", "network"],
      ["Contract addresses", "network"],
    ],
  },
] as const;

const toc = [
  ["What is Dubu?", "what-is-dubu"],
  ["Core principles", "principles"],
  ["How a swap works", "how-swaps-work"],
  ["Execution details", "execution-details"],
  ["Network", "network"],
  ["Next steps", "next-steps"],
] as const;

export default function DocsPage() {
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (docsMenuOpen) sidebarRef.current?.scrollTo({ top: 0 });
  }, [docsMenuOpen]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return docGroups;
    return docGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(([label]) => label.toLowerCase().includes(term)),
      }))
      .filter((group) => group.items.length > 0);
  }, [search]);

  return (
    <main className={isDark ? "docs-site docs-dark" : "docs-site"}>
      <header className="docs-header">
        <Link className="docs-brand" href="/" aria-label="Dubu home">
          <img src="/assets/Logo.png" alt="Dubu" />
        </Link>

        <nav className={menuOpen ? "docs-top-nav open" : "docs-top-nav"} aria-label="Primary navigation">
          <Link href="/swap" onClick={() => setMenuOpen(false)}>Swap</Link>
          <Link href="/#why" onClick={() => setMenuOpen(false)}>Why Dubu</Link>
          <Link href="/#routing" onClick={() => setMenuOpen(false)}>Routing</Link>
          <Link className="active" href="/docs" onClick={() => setMenuOpen(false)}>Docs</Link>
        </nav>

        <div className="docs-header-actions">
          <button
            className="docs-theme-button"
            type="button"
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
            onClick={() => setIsDark((current) => !current)}
          >
            {isDark ? "☀" : "◔"}
          </button>
          <Link className="docs-launch-button" href="/swap">Launch app <span>↗</span></Link>
          <button
            className="docs-menu-button"
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

      <div className="docs-layout">
        <aside ref={sidebarRef} className={docsMenuOpen ? "docs-sidebar open" : "docs-sidebar"}>
          <div className="docs-search">
            <span>⌕</span>
            <input
              value={search}
              aria-label="Search documentation"
              placeholder="Search docs"
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>

          <nav aria-label="Documentation navigation">
            {filteredGroups.map((group) => (
              <div className="docs-nav-group" key={group.title}>
                <strong>{group.title}</strong>
                {group.items.map(([label, href]) => (
                  <a
                    key={label}
                    className={href === "overview" ? "active" : ""}
                    href={`#${href}`}
                    onClick={() => setDocsMenuOpen(false)}
                  >
                    {label}
                  </a>
                ))}
              </div>
            ))}
            {filteredGroups.length === 0 && <p className="docs-search-empty">No matching pages.</p>}
          </nav>

        </aside>
        {docsMenuOpen && <button className="docs-sidebar-scrim" type="button" aria-label="Close documentation navigation" onClick={() => setDocsMenuOpen(false)} />}

        <article className="docs-article">
          <button className="docs-mobile-index" type="button" onClick={() => setDocsMenuOpen((current) => !current)}>
            <span>☷</span> Browse documentation
          </button>

          <div className="docs-breadcrumb"><Link href="/docs">Docs</Link><span>›</span><b>Overview</b></div>

          <section className="docs-hero" id="overview">
            <div className="docs-eyebrow">GETTING STARTED</div>
            <h1>Meet Dubu.</h1>
            <p>A calm, non-custodial interface for aggregated trading and wallet portfolio tracking.</p>
            <div className="docs-meta">
              <span>Last updated Jul 28, 2026</span>
            </div>
          </section>

          <section className="docs-section" id="what-is-dubu">
            <h2>What is Dubu?</h2>
            <p>
              Dubu is a decentralized exchange aggregator interface designed to make onchain execution easier to understand.
              It brings quotes, advanced orders, market charts, and portfolio views into a single product.
            </p>
            <p>
              Trades remain non-custodial. Your wallet signs every approval and transaction, while Dubu presents
              the expected output, rate, route, and minimum received before confirmation.
            </p>

            <div className="docs-callout">
              <span>◇</span>
              <div>
                <strong>Non-custodial by default</strong>
                <p>Dubu cannot move funds without a transaction signed by the connected wallet.</p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="principles">
            <h2>Core principles</h2>
            <p>The interface is built around three product principles.</p>
            <div className="docs-principle-grid">
              <article>
                <span>01</span>
                <h3>Clear execution</h3>
                <p>Every quote shows the values that materially affect the final outcome.</p>
              </article>
              <article>
                <span>02</span>
                <h3>Wallet control</h3>
                <p>Approvals and trades are always confirmed from the user&apos;s wallet.</p>
              </article>
              <article>
                <span>03</span>
                <h3>Price protection</h3>
                <p>The selected slippage tolerance sets the minimum amount received.</p>
              </article>
            </div>
          </section>

          <section className="docs-section" id="how-swaps-work">
            <h2>How a swap works</h2>
            <p>A standard swap moves through a short sequence before it reaches the wallet.</p>
            <ol className="docs-steps">
              <li><span>1</span><div><strong>Select tokens</strong><p>Choose the asset to pay and the asset to receive.</p></div></li>
              <li><span>2</span><div><strong>Request a quote</strong><p>Enter an amount to see the current expected output.</p></div></li>
              <li><span>3</span><div><strong>Review details</strong><p>Check the rate, route, slippage, and minimum received.</p></div></li>
              <li><span>4</span><div><strong>Confirm in wallet</strong><p>Approve the token when required, then sign the final transaction.</p></div></li>
            </ol>
          </section>

          <section className="docs-section" id="execution-details">
            <h2>Execution details</h2>
            <p>
              Quotes can change before wallet confirmation. Dubu refreshes rates automatically and
              applies the selected slippage tolerance to calculate the minimum output.
            </p>
            <div className="docs-definition-list">
              <div><dt>Rate</dt><dd>The current exchange rate for the selected pair and amount.</dd></div>
              <div><dt>Route</dt><dd>The liquidity source used for execution.</dd></div>
              <div><dt>Max slippage</dt><dd>The maximum acceptable movement between quote and execution.</dd></div>
              <div><dt>Minimum received</dt><dd>The lowest output allowed before the transaction reverts.</dd></div>
            </div>
          </section>

          <section className="docs-section docs-network-card" id="network">
            <div className="docs-section-heading">
              <div>
                <span>NETWORK</span>
                <h2>Network</h2>
              </div>
            </div>
            <p>Dubu uses an EVM-compatible trading network. ETH is used for network fees.</p>
            <div className="docs-definition-list">
              <div><dt>Chain ID</dt><dd>91342</dd></div>
              <div><dt>Markets</dt><dd>{MARKETS.map((market) => `${market.base} / ${market.quote}`).join(" · ")}</dd></div>
              <div><dt>mUSDC</dt><dd><code>{TOKENS.mUSDC.address ?? "Placeholder"}</code></dd></div>
              <div><dt>mWETH</dt><dd><code>{TOKENS.mWETH.address}</code></dd></div>
              <div><dt>mWBTC</dt><dd><code>{TOKENS.mWBTC.address}</code></dd></div>
              <div><dt>mBNB</dt><dd><code>{TOKENS.mBNB.address}</code></dd></div>
              <div><dt>mXRP</dt><dd><code>{TOKENS.mXRP.address}</code></dd></div>
              <div><dt>mSOL</dt><dd><code>{TOKENS.mSOL.address}</code></dd></div>
              <div><dt>Router</dt><dd><code>{CONTRACTS.router}</code></dd></div>
            </div>
          </section>

          <section className="docs-section" id="next-steps">
            <h2>Next steps</h2>
            <div className="docs-next-grid">
              <Link href="/swap"><span>⇄</span><div><strong>Make a swap</strong><p>Open the trading interface.</p></div><b>→</b></Link>
              <Link href="/trade"><span>⌁</span><div><strong>Open advanced trade</strong><p>Use charts and advanced order controls.</p></div><b>→</b></Link>
            </div>
          </section>

        </article>

        <aside className="docs-toc">
          <strong>On this page</strong>
          <nav>
            {toc.map(([label, href]) => <a key={href} href={`#${href}`}>{label}</a>)}
          </nav>
        </aside>
      </div>
    </main>
  );
}
