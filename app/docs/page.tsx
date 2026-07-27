"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
      ["Quotes & routing", "execution-details"],
      ["Price impact", "execution-details"],
      ["Slippage", "execution-details"],
      ["Limit orders", "execution-details"],
      ["TWAP orders", "execution-details"],
    ],
  },
  {
    title: "Liquidity",
    items: [
      ["Pool basics", "next-steps"],
      ["Add liquidity", "next-steps"],
      ["Manage positions", "next-steps"],
    ],
  },
  {
    title: "Developers",
    items: [
      ["API overview", "api"],
      ["Quote endpoint", "api"],
      ["Contract addresses", "api"],
    ],
  },
] as const;

const toc = [
  ["What is Dubu?", "what-is-dubu"],
  ["Core principles", "principles"],
  ["How a swap works", "how-swaps-work"],
  ["Execution details", "execution-details"],
  ["Next steps", "next-steps"],
] as const;

export default function DocsPage() {
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
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

  function copyExample() {
    void navigator.clipboard.writeText(`const quote = await dubu.quote({
  chainId: 1,
  sellToken: "ETH",
  buyToken: "USDC",
  sellAmount: "1000000000000000000"
});`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

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

      <div className="docs-announcement">
        <span>New</span>
        <p>Dubu documentation is in preview. Examples and endpoints may change before mainnet release.</p>
        <Link href="#api">View API overview <b>→</b></Link>
      </div>

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

          <div className="docs-sidebar-help">
            <img src="/assets/character.png" alt="" />
            <div><strong>Need help?</strong><span>Join the community</span></div>
            <b>↗</b>
          </div>
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
            <p>A calm, non-custodial interface for trading and managing liquidity across decentralized markets.</p>
            <div className="docs-meta">
              <span>Last updated Jul 27, 2026</span>
              <span>·</span>
              <span>6 min read</span>
            </div>
          </section>

          <section className="docs-section" id="what-is-dubu">
            <h2>What is Dubu?</h2>
            <p>
              Dubu is a decentralized exchange interface designed to make onchain execution easier to understand.
              It brings quotes, transaction settings, pool discovery, and portfolio views into a single product.
            </p>
            <p>
              Trades remain non-custodial. Your wallet signs every approval and transaction, while Dubu presents
              the expected output, network cost, price impact, and minimum received before confirmation.
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
                <h3>Useful defaults</h3>
                <p>Slippage and routing start in automatic mode but remain adjustable.</p>
              </article>
            </div>
          </section>

          <section className="docs-section" id="how-swaps-work">
            <h2>How a swap works</h2>
            <p>A standard swap moves through a short sequence before it reaches the wallet.</p>
            <ol className="docs-steps">
              <li><span>1</span><div><strong>Select tokens</strong><p>Choose the asset to pay and the asset to receive.</p></div></li>
              <li><span>2</span><div><strong>Request a quote</strong><p>Enter an amount. The interface calculates an estimated output and execution cost.</p></div></li>
              <li><span>3</span><div><strong>Review details</strong><p>Check price impact, slippage, minimum received, and execution source.</p></div></li>
              <li><span>4</span><div><strong>Confirm in wallet</strong><p>Approve the token when required, then sign the final transaction.</p></div></li>
            </ol>
          </section>

          <section className="docs-section" id="execution-details">
            <h2>Execution details</h2>
            <p>
              Quotes can change between preview and wallet confirmation. Dubu refreshes rates automatically and
              applies the selected slippage tolerance to calculate the minimum output.
            </p>
            <div className="docs-definition-list">
              <div><dt>Price impact</dt><dd>The effect your own trade size has on the market price.</dd></div>
              <div><dt>Max slippage</dt><dd>The maximum acceptable movement between quote and execution.</dd></div>
              <div><dt>Network cost</dt><dd>The estimated cost paid to validators for processing the transaction.</dd></div>
              <div><dt>Minimum received</dt><dd>The lowest output allowed before the transaction reverts.</dd></div>
            </div>
          </section>

          <section className="docs-section docs-api-preview" id="api">
            <div className="docs-section-heading">
              <div>
                <span>FOR DEVELOPERS</span>
                <h2>Request a quote</h2>
              </div>
              <Link href="#api">API reference →</Link>
            </div>
            <p>Use the quote client to preview output amounts and transaction parameters.</p>
            <div className="docs-code-block">
              <div className="docs-code-head">
                <span>TypeScript</span>
                <button type="button" onClick={copyExample}>{copied ? "Copied ✓" : "Copy"}</button>
              </div>
              <pre><code><span className="code-purple">const</span> quote = <span className="code-purple">await</span> dubu.quote({`{\n`}
  chainId: <span className="code-gold">1</span>,{`\n`}
  sellToken: <span className="code-green">&quot;ETH&quot;</span>,{`\n`}
  buyToken: <span className="code-green">&quot;USDC&quot;</span>,{`\n`}
  sellAmount: <span className="code-green">&quot;1000000000000000000&quot;</span>{`\n`}
{`}`});</code></pre>
            </div>
          </section>

          <section className="docs-section" id="next-steps">
            <h2>Next steps</h2>
            <div className="docs-next-grid">
              <Link href="/swap"><span>⇄</span><div><strong>Make a swap</strong><p>Open the trading interface.</p></div><b>→</b></Link>
              <Link href="/pools"><span>◇</span><div><strong>Explore pools</strong><p>Learn about liquidity positions.</p></div><b>→</b></Link>
            </div>
          </section>

          <footer className="docs-article-footer">
            <span>Was this page helpful?</span>
            <div><button type="button">Yes</button><button type="button">No</button></div>
          </footer>
        </article>

        <aside className="docs-toc">
          <strong>On this page</strong>
          <nav>
            {toc.map(([label, href]) => <a key={href} href={`#${href}`}>{label}</a>)}
          </nav>
          <div className="docs-toc-divider" />
          <a href="#">Edit this page ↗</a>
          <a href="#">Report an issue ↗</a>
        </aside>
      </div>
    </main>
  );
}
