"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGGREGATOR, GIWA_CHAIN_ID, TOKENS } from "@/app/lib/dubu";
import {
  ArchitectureDiagram,
  CodeBlock,
  ContractsTable,
  MarketsTable,
  QuoteWordDiagram,
} from "./docs-blocks";
import {
  PERMIT2,
  approvePath,
  errorNoMarket,
  errorNoVenue,
  errorRepricing,
  marketsRequest,
  marketsResponse,
  permit2Path,
  quoteRequest,
  quoteResponse,
  wordLayout,
} from "./docs-data";
import { UI } from "./docs-lang";
import "./docs.css";

const docGroups = [
  {
    title: "Protocol",
    items: [
      ["Overview", "overview"],
      ["Architecture", "architecture"],
      ["The engine", "engine"],
    ],
  },
  {
    title: "Contracts",
    items: [
      ["Deployed addresses", "contracts"],
      ["Pricing model", "pricing"],
      ["Capacity and epochs", "capacity"],
      ["Guards and roles", "guards"],
    ],
  },
  {
    title: "Dubu Aggregator",
    items: [
      ["POST /quote", "quote-endpoint"],
      ["GET /markets", "markets-endpoint"],
      ["Errors", "errors"],
    ],
  },
  {
    title: "Reference",
    items: [
      ["Markets", "markets"],
      ["Integrating", "integrating"],
      ["Permit2", "permit2"],
    ],
  },
] as const;

const toc = [
  ["What Dubu is", "overview"],
  ["Architecture", "architecture"],
  ["The engine", "engine"],
  ["Contracts", "contracts"],
  ["Pricing model", "pricing"],
  ["Capacity and epochs", "capacity"],
  ["Guards and roles", "guards"],
  ["Dubu Aggregator API", "quote-endpoint"],
  ["Errors", "errors"],
  ["Markets", "markets"],
  ["Integrating", "integrating"],
] as const;

export default function DocsPage() {
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState("overview");
  const sidebarRef = useRef<HTMLElement>(null);
  const t = UI;


  useEffect(() => {
    if (docsMenuOpen) sidebarRef.current?.scrollTo({ top: 0 });
  }, [docsMenuOpen]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("section[id]"));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

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
        <Link className="docs-brand" href="/" aria-label={t.brandHome}>
          <img src="/assets/Logo.png" alt="Dubu" />
        </Link>

        <nav className={menuOpen ? "docs-top-nav open" : "docs-top-nav"} aria-label={t.primaryNav}>
          <Link href="/swap" onClick={() => setMenuOpen(false)}>{t.navSwap}</Link>
          <Link href="/#why" onClick={() => setMenuOpen(false)}>{t.navWhy}</Link>
          <Link href="/#routing" onClick={() => setMenuOpen(false)}>{t.navRouting}</Link>
          <Link className="active" href="/docs" onClick={() => setMenuOpen(false)}>{t.navDocs}</Link>
        </nav>

        <div className="docs-header-actions">
          <button
            className="docs-theme-button"
            type="button"
            aria-label={isDark ? t.themeLight : t.themeDark}
            onClick={() => setIsDark((current) => !current)}
          >
            {isDark ? "☀" : "◔"}
          </button>
          <Link className="docs-launch-button" href="/swap">{t.launchApp} <span>↗</span></Link>
          <button
            className="docs-menu-button"
            type="button"
            aria-label={t.toggleNav}
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
              aria-label={t.searchAria}
              placeholder={t.searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>

          <nav aria-label={t.docsNav}>
            {filteredGroups.map((group) => (
              <div className="docs-nav-group" key={group.title}>
                <strong>{group.title}</strong>
                {group.items.map(([label, href]) => (
                  <a
                    key={label}
                    className={href === activeId ? "active" : ""}
                    href={`#${href}`}
                    onClick={() => setDocsMenuOpen(false)}
                  >
                    {label}
                  </a>
                ))}
              </div>
            ))}
            {filteredGroups.length === 0 && <p className="docs-search-empty">{t.noMatches}</p>}
          </nav>
        </aside>
        {docsMenuOpen && (
          <button
            className="docs-sidebar-scrim"
            type="button"
            aria-label={t.closeDocsNav}
            onClick={() => setDocsMenuOpen(false)}
          />
        )}

        <article className="docs-article">
          <button className="docs-mobile-index" type="button" onClick={() => setDocsMenuOpen((current) => !current)}>
            <span>☷</span> {t.browse}
          </button>

          <div className="docs-breadcrumb">
            <Link href="/docs">{t.breadcrumbDocs}</Link>
            <span>›</span>
            <b>{"Protocol"}</b>
          </div>

          <section className="docs-hero" id="overview">
            <div className="docs-eyebrow">TECHNICAL DOCUMENTATION</div>
            <h1>Dubu protocol.</h1>
            <p>
              Liquidity bootstrapping on GIWA, in three products: Dubu PropAMM, Dubu Aggregator
              and Dubu RFQ.
            </p>
            <div className="docs-meta">
              <span>Chain {GIWA_CHAIN_ID} · GIWA Sepolia</span>
            </div>
          </section>

          <section className="docs-section" id="what-is-dubu">
            <h2>What Dubu is</h2>
            <p>
              Dubu bootstraps liquidity on GIWA, chain {GIWA_CHAIN_ID}, through three products of
              its own: Dubu PropAMM, Dubu Aggregator and Dubu RFQ. On a chain this young there is
              usually nothing to route into. Seven of the nine listed pairs have no other on-chain
              venue at all, so Dubu supplies that depth itself.
            </p>
            <div className="docs-definition-list">
              <div>
                <dt>Dubu PropAMM</dt>
                <dd>
                  The proprietary-inventory pool, deployed as <code>PropPool</code>. An off-chain
                  engine publishes four prices per pair, <code>minBid</code>, <code>maxBid</code>,{" "}
                  <code>minAsk</code> and <code>maxAsk</code>, and the pool fills takers against
                  them out of reserves it owns, with no constant-product curve anywhere in the
                  pricing.
                </dd>
              </div>
              <div>
                <dt>Dubu Aggregator</dt>
                <dd>
                  Prices every request across the prop pool, a UniswapV2 pool and the RFQ maker,
                  then returns the calldata that executes the winner, ready for the{" "}
                  <code>Router</code>. It runs as a Cloudflare Worker.
                </dd>
              </div>
              <div>
                <dt>Dubu RFQ</dt>
                <dd>
                  The quote-and-settle path. The maker signs an EIP-712 order off chain and{" "}
                  <code>PmmSettle</code> verifies it and moves both legs with{" "}
                  <code>transferFrom</code>, custodying nothing.
                </dd>
              </div>
            </div>
            <p>
              Nothing in the path takes custody. The aggregator returns <code>to</code> and{" "}
              <code>data</code> and holds no key, the minimum output is baked into that calldata, and
              the wallet signs every transfer. A compromised aggregator can quote badly. It cannot
              move funds.
            </p>

            <div className="docs-callout">
              <span>◇</span>
              <div>
                <strong>Testnet deployment</strong>
                <p>
                  Every address on this page is live on GIWA Sepolia and verified on Blockscout. The
                  tokens are mocks.
                </p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="architecture">
            <h2>Architecture</h2>
            <p>
              A quote becomes a trade in four movements. The engine is the only writer of prices, the
              aggregator is the only component that compares venues, and the Router is a pure
              executor that never chooses one.
            </p>

            <ArchitectureDiagram />

            <ol className="docs-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>The engine publishes four prices</strong>
                  <p>
                    It derives a fair value from external venues, widens it into a spread, skews it
                    against current inventory, and packs the four resulting prices and the pair id
                    into one 256-bit word. That word goes on chain through{" "}
                    <code>PropPool.updateQuote(uint256[])</code>, signed by the <code>updater</code>{" "}
                    key. Size is pushed separately, with <code>refreshCapacity</code>, so a price
                    change and a depth change are two different transactions.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Dubu Aggregator prices the whole grid</strong>
                  <p>
                    It evaluates eleven split points, 0 through 100 percent of the input in steps of
                    10, sending the UniV2 side as one Multicall3 batch of{" "}
                    <code>getAmountsOut</code> and the prop side as one POST to the engine carrying
                    all eleven amounts. Those two requests leave together. The split is searched
                    against the venues&apos; own answers rather than derived from curves reimplemented in
                    the worker, because a second implementation of a curve disagrees with the first
                    and the disagreements get found by users.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>It asks Dubu RFQ to beat that</strong>
                  <p>
                    The best AMM split is sent on to the maker, which answers with a signed EIP-712
                    order or declines. The aggregator separately reads the maker&apos;s balance and its
                    allowance to <code>PmmSettle</code>, and takes the lesser as what the maker could
                    actually deliver. RFQ is compared at whole size only: an order is signed for one{" "}
                    <code>takerAmount</code>, so splitting into it would cost a second round trip to
                    the maker for a gain the on-chain grid has mostly captured already.
                  </p>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>The Router executes the winner</strong>
                  <p>
                    The chosen plan becomes weighted steps inside one hop, encoded as{" "}
                    <code>Router.swapExactIn</code> with <code>minAmountOut</code> derived from{" "}
                    <code>slippageBps</code>. The Router pulls <code>amountIn</code>, divides it by{" "}
                    <code>weightBps</code>, funds each leg (the pool for an AMM step, the adapter for
                    the RFQ step) and calls <code>sellBase</code> or <code>sellQuote</code>. It then
                    measures its own <code>tokenOut</code> balance delta, reverts{" "}
                    <code>InsufficientOutput</code> if that is below the minimum, refunds unspent
                    input to the sender, and forwards the rest to <code>receiver</code>.
                  </p>
                </div>
              </li>
            </ol>

            <div className="docs-callout">
              <span>◈</span>
              <div>
                <strong>The prop leg is priced over HTTP, not by eth_call</strong>
                <p>
                  Reading the pool on chain needs pending state to see a quote word published inside
                  the current block, and GIWA serves pending state and pending timestamp
                  inconsistently. A <code>block.timestamp</code> ahead of the state whose{" "}
                  <code>updatedAt</code> it is compared against makes <code>PropPool</code> return{" "}
                  <code>STATUS_STALE</code> and pay zero on every pair. The engine prices the same
                  curve instead, from an exact integer port of <code>PropCurve.sol</code>. There is
                  deliberately no on-chain fallback: an unreachable engine shows up as the prop venue
                  being absent, not as a second and differently wrong price.
                </p>
              </div>
            </div>

            <h3>We run our own GIWA node</h3>
            <p>
              Every quote reads chain state, and the engine pushes about fourteen price updates a
              second across nine pairs. That is more traffic than a public endpoint&apos;s per-IP
              limit allows. The aggregator makes it worse: it runs on Cloudflare, whose egress
              addresses are shared, so the limit gets spent by other people&apos;s traffic. Against a
              public endpoint 17 percent of its requests failed.
            </p>
            <p>
              So we run a full op-reth node and read our own. There is no quota. It is a node, not
              the sequencer.
            </p>
          </section>

          <section className="docs-section" id="engine">
            <h2>The engine</h2>
            <p>
              The market maker is a Rust service. Its cycle runs feed, fair value, spread, skew,
              quote word, policy, transaction, every 200 ms and again on every new head, for all
              nine pairs at once.
            </p>
            <div className="docs-definition-list">
              <div>
                <dt>Feed</dt>
                <dd>
                  Websocket order books, plus HTTP polling for Pyth. The five crypto pairs read
                  Binance, OKX and Bybit; the four equity pairs read Hyperliquid, and mAAPL and mTSLA
                  carry a Pyth feed as a second source. Connectors for Coinbase and the rest are in
                  the crate whether or not a pair is configured to use them.
                </dd>
              </div>
              <div>
                <dt>Fair value</dt>
                <dd>
                  Each venue contributes a micro price, <code>(bid·askQty + ask·bidQty) /
                  (bidQty + askQty)</code>. Note the crossed weighting: size carries the
                  short-horizon signal the mid ignores, and weighting each price by its own size gets
                  the sign backwards. The cross-section is then reduced by median absolute deviation,
                  and the survivors averaged. Too few venues, or too much disagreement between them,
                  produces no reference at all rather than a confident wrong one.
                </dd>
              </div>
              <div>
                <dt>Spread</dt>
                <dd>
                  A base half-spread widened by realised volatility and capped, with extra widening
                  while the chain view is degraded.
                </dd>
              </div>
              <div>
                <dt>Skew</dt>
                <dd>
                  A signed shift of the whole book, proportional to variance and to how far inventory
                  sits from balanced, clamped so it can never push a bid under the pair&apos;s minimum
                  price.
                </dd>
              </div>
              <div>
                <dt>Quote word</dt>
                <dd>
                  The skewed mid gives a bid target and an ask target. Each side is solved for the
                  width that makes the <em>average</em> executed price over a full epoch land on its
                  target, so the four prices are chosen by the size the pool intends to trade rather
                  than set at fixed offsets.
                </dd>
              </div>
              <div>
                <dt>Policy</dt>
                <dd>
                  The last gate. It aborts on a halt, a dead chain view, an unlive feed, a stale
                  chain view, a paused pair or a push already in flight, and otherwise sends only on
                  a trigger: adverse drift, a heartbeat before the pool&apos;s own staleness window
                  expires, plain cadence, or favourable drift last. Drift is measured against the{" "}
                  <em>executable top</em> at current usage, not against <code>maxBid</code>, which is
                  only the price at zero usage.
                </dd>
              </div>
              <div>
                <dt>Transaction</dt>
                <dd>
                  One EIP-1559 envelope per intent: <code>updateQuote</code> with a single packed
                  word, or <code>refreshCapacity</code> for one pair. Both from the{" "}
                  <code>updater</code> key.
                </dd>
              </div>
            </div>

            <h3>Withdrawal is a first-class outcome</h3>
            <p>
              A separate fast lane scans for price jumps every 200 ms, outside the policy gates
              entirely. A jump cannot be priced through: by the time a move is confirmed it has
              usually already exceeded the half-spread, so the response is to withdraw rather than to
              re-price. It sends <code>refreshCapacity(pairId, 0, 0)</code>, which makes every quote
              path in <code>PropPool</code> return zero, and holds the side down for a cool-off. That
              is the state the aggregator reports as 503, temporarily re-pricing.
            </p>
            <p>
              The cool-off is not a plain timer. It clears only once enough time has passed since the{" "}
              <em>most recent</em> trip and the trailing window&apos;s peak-to-trough range has settled
              inside the current threshold, so a second leg restarts it instead of resuming into it.
            </p>
            <p>
              Above that sits a latching killswitch measured on a NAV decomposition that separates
              revaluation from trade P&amp;L exactly, with no event decoding: inventory only moves on
              a trade, so with no trades the trade term is exactly zero rather than approximately. It
              carries a rolling drawdown limit and a gross cumulative loss budget. Both latch, are
              written atomically and are read at startup, so a halted book stays down across the
              restart an operator reaches for first. It can also run in shadow, computing and
              reporting the verdict it would have enforced without enforcing it.
            </p>

            <h3>One curve, two languages</h3>
            <p>
              The pricing core is shared rather than reimplemented. The Rust curve is an exact
              integer port of <code>PropCurve.sol</code>, same function names and same rounding, and
              the two are pinned together by generated vectors replayed in a differential Solidity
              test. That is what lets the aggregator treat an HTTP price from the engine as the
              venue&apos;s own arithmetic.
            </p>
          </section>

          <section className="docs-section" id="contracts">
            <h2>Contracts</h2>
            <p>
              Six contracts, all deployed on GIWA Sepolia and verified on Blockscout. The three
              adapters hold no state and no funds. They exist so the Router can speak to a venue
              without knowing what it is, which is why replacing the pool cost a config change and no
              redeploy of the Router.
            </p>
            <ContractsTable />
            <p>
              A route step names its venue in the low 160 bits of a <code>uint256</code>, its weight
              in bits [175:160], and carries two flags in the top two bits: one reverses the
              direction, one funds the adapter instead of the pool. The Router validates that the
              reserved bits between them are clear before it acts on any of it.
            </p>
          </section>

          <section className="docs-section" id="pricing">
            <h2>The pricing model</h2>
            <p>
              A pair costs three hot storage words. One carries the four prices and the timestamp
              they were written at, one carries capacity and the epoch it belongs to, one carries
              how much of that epoch has been consumed. Everything a quote needs is in those three
              reads.
            </p>

            <CodeBlock label="PropPool, hot storage layout" code={wordLayout} />

            <QuoteWordDiagram />

            <h3>Prices are integers</h3>
            <p>
              Each of the four prices is a <code>uint56</code> scaled by{" "}
              <code>10^priceScaleExp</code>, a per-pair constant that absorbs the decimal difference
              between base and quote. On the bid side the pool pays{" "}
              <code>amountIn · p / 10^priceScaleExp</code> quote units for base; on the ask side it
              charges the same product, rounded the other way. Both sides denominate capacity and
              usage in the <em>base</em> token.
            </p>

            <h3>The price walks as an epoch is consumed</h3>
            <p>
              The four prices are the ends of two linear ramps, not two fixed quotes. The marginal
              bid starts at <code>maxBid</code> when nothing has been sold to the pool and falls
              linearly to <code>minBid</code> as <code>bidUsed</code> reaches{" "}
              <code>bidCapacity</code>. The marginal ask starts at <code>minAsk</code> and rises to{" "}
              <code>maxAsk</code>. A trade is charged the integral over the stretch of ramp it
              consumes, which is the average of the marginal price at its start and at its end.
            </p>
            <div className="docs-definition-list">
              <div>
                <dt>Bid, exact in</dt>
                <dd>
                  <code>out = q · (2·maxBid·C − span·(2u + q)) / (2·C·10^exp)</code>, floored, with{" "}
                  <code>span = maxBid − minBid</code>.
                </dd>
              </div>
              <div>
                <dt>Ask, exact out</dt>
                <dd>
                  <code>in = ⌈ q · (2·minAsk·C + span·(2u + q)) / (2·C·10^exp) ⌉</code>, with{" "}
                  <code>span = maxAsk − minAsk</code>.
                </dd>
              </div>
              <div>
                <dt>The other two directions</dt>
                <dd>
                  Inverted by binary search over the same closed form, bracketed first by the two
                  endpoint prices and then refined three times, so they agree with it exactly rather
                  than approximately.
                </dd>
              </div>
              <div>
                <dt>Rounding</dt>
                <dd>
                  Outputs floor, inputs ceil. Every rounding decision goes against the taker and in
                  the pool&apos;s favour, by one unit.
                </dd>
              </div>
            </div>
            <p>
              A larger trade therefore prices worse than a smaller one against the same four
              prices, and a trade arriving after the epoch is half consumed prices worse than the
              same trade arriving first. That is the whole of Dubu PropAMM&apos;s price impact. There
              is no reserve ratio in
              it, so impact is set by the depth the maker chose to publish rather than by how much
              inventory happens to be sitting in the contract.
            </p>
            <p>
              <code>executableTopBid</code> and <code>executableTopAsk</code> report the marginal
              price at current usage, which is what a taker arriving now would get on the first unit.
              The engine measures drift against those, not against the stored endpoints.
            </p>
          </section>

          <section className="docs-section" id="capacity">
            <h2>Capacity and capacity epochs</h2>
            <p>
              Capacity is how much base the pool will trade on one side before that side&apos;s ramp
              is exhausted, and it is also the denominator of the walk. It is refreshed by the
              engine, not replenished by trading.
            </p>
            <p>
              An epoch is a generation counter. <code>refreshCapacity</code> writes new bid and ask
              capacities and increments a 32-bit <code>capGen</code>. The used word carries its own{" "}
              <code>usedGen</code>, and when the two disagree <code>bidUsed</code> and{" "}
              <code>askUsed</code> read as zero. A refresh therefore resets the bid to{" "}
              <code>maxBid</code> and the ask to <code>minAsk</code> in a single write, without
              touching the used word at all.
            </p>
            <p>
              Capacity also decays with quote age. If a pair has a non-zero <code>decaySecs</code>,
              the size the pool will fill is <code>capacity · (decaySecs − age) / decaySecs</code>,
              reaching zero at <code>age ≥ decaySecs</code>, where <code>age</code> is measured from
              the quote word&apos;s own <code>updatedAt</code>. This is a dead-man switch: an
              engine that stops publishing walks its own book down to nothing with nobody
              intervening.
            </p>
            <p>
              Decay caps size, not price. The curve is still evaluated against the full stored{" "}
              <code>capacity</code>, so a decaying pair quotes the same price for a smaller maximum
              clip rather than a worse price for the same clip. Staleness is the separate and harder
              stop: once <code>age &gt; maxStaleSecs</code> every view returns 0 and{" "}
              <code>swap</code> reverts <code>StaleQuote</code>, whatever the capacity says.
            </p>
            <p>
              <code>snapshot(pairId)</code> returns all of it, the four prices,{" "}
              <code>updatedAt</code>, both capacities, both used counters, both generations, flags,{" "}
              <code>priceScaleExp</code> and <code>maxStaleSecs</code>. Two of those flags are
              synthesised for the caller rather than stored: bit 15 means the pair has a Pyth feed
              configured, bit 14 means it has a non-zero decay.{" "}
              <code>effectiveCapacity(pairId)</code> returns the post-decay numbers, which is what
              the pool will actually fill right now.
            </p>
          </section>

          <section className="docs-section" id="guards">
            <h2>Guards and roles</h2>
            <p>
              A pushed price is a trusted price, so the pool bounds what it will accept and splits
              who may write it.
            </p>
            <div className="docs-definition-list">
              <div>
                <dt>Reference bound</dt>
                <dd>
                  When a pair has a Pyth feed configured, <code>updateQuote</code> checks the new
                  prices against it and reverts <code>BidCeilingExceeded</code> if{" "}
                  <code>maxBid</code> sits more than <code>maxDeviationBps</code> above the
                  reference, or <code>AskFloorBreached</code> if <code>minAsk</code> sits that far
                  below it. A feed that is unavailable, stale or non-positive reverts{" "}
                  <code>ReferenceUnavailable</code> rather than passing. This is the only check that
                  can catch a fair value that is coherently wrong, because it comes from a source the
                  engine does not price from.
                </dd>
              </div>
              <div>
                <dt>Quote word validity</dt>
                <dd>
                  <code>minBid &lt; minPrice</code> reverts <code>BidBelowMinPrice</code>. Anything
                  that breaks <code>minBid ≤ maxBid ≤ minAsk ≤ maxAsk</code>, or that lets{" "}
                  <code>maxAsk</code> fall to <code>minBid</code>, reverts <code>CrossedBook</code>.
                </dd>
              </div>
              <div>
                <dt>Reserve floors</dt>
                <dd>
                  A fill that would take the outgoing token below <code>minBaseReserve</code> or{" "}
                  <code>minQuoteReserve</code> quotes zero from the views and reverts{" "}
                  <code>ReserveFloorBreached</code> from <code>swap</code>.
                </dd>
              </div>
              <div>
                <dt>owner</dt>
                <dd>
                  <code>addPair</code>, <code>withdraw</code>, <code>setPyth</code>, and rotation of
                  the other three roles. Ownership transfer is two-step.
                </dd>
              </div>
              <div>
                <dt>manager</dt>
                <dd>
                  <code>setPairConfig</code>, <code>setPairDecay</code>, <code>setPairOracle</code>,{" "}
                  <code>deposit</code>, <code>sync</code>.
                </dd>
              </div>
              <div>
                <dt>updater</dt>
                <dd>
                  <code>updateQuote</code>, <code>refreshCapacity</code>,{" "}
                  <code>refreshCapacityBatch</code>. This is the engine&apos;s key. It is hot, and the
                  bounds above are what limit the damage when it leaks.
                </dd>
              </div>
              <div>
                <dt>guardian</dt>
                <dd>
                  <code>pause</code> and <code>unpause</code> per pair, <code>pauseAll</code> and{" "}
                  <code>unpauseAll</code> for the book. A paused pair quotes zero and cannot be
                  swapped.
                </dd>
              </div>
            </div>
            <p>
              The split only means something when the keys live in different places. On this testnet
              deployment all four roles are the deployer, which is the one thing here that would be
              wrong on mainnet.
            </p>
          </section>

          <section className="docs-section" id="quote-endpoint">
            <div className="docs-section-heading">
              <div>
                <span>DUBU AGGREGATOR</span>
                <h2>POST /quote</h2>
              </div>
            </div>
            <div className="docs-http">
              <span>POST</span>
              <code>{AGGREGATOR}/quote</code>
            </div>
            <p>
              Prices a trade across every venue and returns the calldata that executes the winner.
              The service is read-only, open to any origin, and never cached, because a quote is
              worth about as long as a block.
            </p>

            <div className="docs-definition-list">
              <div>
                <dt>tokenIn, tokenOut</dt>
                <dd>
                  Addresses. Must be the two sides of a listed market. Their order decides the
                  direction.
                </dd>
              </div>
              <div>
                <dt>amountIn</dt>
                <dd>An integer string in the input token&apos;s own base units. Must be positive.</dd>
              </div>
              <div>
                <dt>receiver</dt>
                <dd>
                  Address that receives <code>tokenOut</code>. Required, because it is written into
                  the calldata.
                </dd>
              </div>
              <div>
                <dt>slippageBps</dt>
                <dd>
                  Optional integer, 0 to 1000. Defaults to 50. Sets <code>minAmountOut</code>.
                </dd>
              </div>
              <div>
                <dt>deadlineSecs</dt>
                <dd>Optional. Seconds from now until the route expires. Defaults to 120.</dd>
              </div>
            </div>

            <CodeBlock label="Request" code={quoteRequest} />
            <CodeBlock label="200, calldata elided" code={quoteResponse} />

            <p>
              <code>route.to</code> and <code>route.data</code> are the transaction. Send them
              unmodified: the minimum, the receiver and the deadline are all inside.{" "}
              <code>approve.spender</code> is the Router on every route, RFQ included, because{" "}
              <code>PmmSettle</code> pulls the taker leg from <code>msg.sender</code>, which is the
              adapter the Router funds. Approving <code>PmmSettle</code> instead is a revert at fill
              time with nothing useful in the trace.
            </p>
            <p>
              <code>detail</code> shows the work. In the response above the prop pool paid 46.3 bps
              more than UniV2 would have alone and 5.4 bps more than the maker&apos;s signed order, so it
              took the whole trade and <code>venues</code> is a single entry.{" "}
              <code>rfqMakerCanDeliver</code> is the lesser of the maker&apos;s balance and its allowance
              to <code>PmmSettle</code>; <code>null</code> there means the solvency read failed and
              the quote was taken unverified on that axis, which is a different claim from verified
              and fine.
            </p>
          </section>

          <section className="docs-section" id="markets-endpoint">
            <div className="docs-section-heading">
              <div>
                <span>DUBU AGGREGATOR</span>
                <h2>GET /markets</h2>
              </div>
            </div>
            <div className="docs-http">
              <span>GET</span>
              <code>{AGGREGATOR}/markets</code>
            </div>
            <p>
              The market table the service will quote, compiled into the worker rather than
              discovered at runtime. An aggregator that learns its own markets from a network
              response is one injection away from routing into a contract an attacker named, so
              adding a market is a deploy. <code>rfq</code> reports whether the RFQ leg is
              configured. <code>GET /health</code> returns <code>{"{ ok, chainId }"}</code>.
            </p>
            <CodeBlock label="Request" code={marketsRequest} />
            <CodeBlock label="200, abridged" code={marketsResponse} />
          </section>

          <section className="docs-section" id="errors">
            <h2>Error responses</h2>
            <p>
              Two failures look identical to a user and are not the same fact, so they answer with
              different statuses. A side withdrawn to re-price comes back on its own in tens of
              seconds and answers 503. Everything else answers 404, because it is not worth retrying
              on a schedule this service can name. Collapsing the two would show a frontend the same
              message for a pair that does not exist, and the taker stops asking.
            </p>
            <CodeBlock label="No venue would fill, not retryable" code={errorNoVenue} />
            <CodeBlock label="Temporarily re-pricing, retryable" code={errorRepricing} />
            <CodeBlock label="Unlisted pair" code={errorNoMarket} />
            <div className="docs-definition-list">
              <div>
                <dt>400</dt>
                <dd>
                  Malformed body, a bad address, a non-positive <code>amountIn</code>,{" "}
                  <code>slippageBps</code> out of range, or a token pair with no market.
                </dd>
              </div>
              <div>
                <dt>404</dt>
                <dd>
                  Every venue returned zero: spent epoch capacity, a stale quote word, a paused
                  pair, or an engine that could not be reached. A pause can be a latched killswitch,
                  so this is not known to clear without an operator.
                </dd>
              </div>
              <div>
                <dt>500</dt>
                <dd>
                  <code>could not build the route</code>. A plan was chosen and could not be encoded.
                </dd>
              </div>
              <div>
                <dt>502</dt>
                <dd>
                  <code>could not read the chain</code>. Every RPC endpoint failed.
                </dd>
              </div>
              <div>
                <dt>503</dt>
                <dd>
                  The prop pool has withdrawn this side while it re-prices, and no other venue would
                  fill that size. Carries <code>retryable: true</code>.
                </dd>
              </div>
            </div>
          </section>

          <section className="docs-section" id="markets">
            <h2>Markets</h2>
            <p>
              Nine pairs, every one quoted against mUSDC (6 decimals,{" "}
              <code>{TOKENS.mUSDC.address}</code>). <code>pairId</code> is the pool&apos;s own index.
              Base decimals are not uniform, and a wrong one misprices by orders of magnitude without
              failing anything.
            </p>
            <MarketsTable />
            <p>
              Two of the nine also have a UniswapV2 pool, mWETH/mUSDC and mWBTC/mUSDC, and those are
              the only pairs where a split route is possible. On the other seven a UniV2 leg prices
              at zero, every grid point routing anything to it is disqualified for paying nothing,
              and the all-prop point wins on its own. That is the same path a UniV2 outage takes on a
              pair that does have a pool.
            </p>
          </section>

          <section className="docs-section" id="integrating">
            <h2>Integrating</h2>
            <p>
              Two calls and one signature. Quote, make sure the Router can move the input, then send
              back exactly what the aggregator handed you.
            </p>
            <CodeBlock label="Quote and execute, approval path" code={approvePath} />
            <div className="docs-callout">
              <span>◇</span>
              <div>
                <strong>Re-quote before signing</strong>
                <p>
                  The pool re-prices on the 200 ms cycle described above and RFQ orders are signed
                  with a short expiry, so a quote a few seconds old can revert rather than merely
                  mis-price. Fetch
                  a fresh one at click time and refuse it if it comes back worse than the minimum you
                  already showed.
                </p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="permit2">
            <h2>Permit2</h2>
            <p>
              The Router accepts both entry points. <code>swapExactIn</code> needs a standing ERC-20
              allowance to the Router. <code>swapExactInWithPermit2</code> takes a signed{" "}
              <code>PermitTransferFrom</code> instead and pulls through Permit2 at{" "}
              <code>{PERMIT2}</code>, so the only standing approval is the one-time approval of
              Permit2 itself. The Router checks that the permitted token matches{" "}
              <code>tokenIn</code> and that the permitted amount covers <code>amountIn</code> before
              it pulls, and reverts <code>PermitTransferredNothing</code> if the balance did not
              move.
            </p>
            <p>
              The aggregator encodes <code>swapExactIn</code>, so this path decodes the route
              parameters back out of the returned calldata and re-encodes them against the Permit2
              entry point. The plan itself is untouched, which matters: <code>minAmountOut</code> is
              carried across as decoded rather than recomputed.
            </p>
            <CodeBlock label="Quote and execute, Permit2 path" code={permit2Path} />
          </section>

          <section className="docs-section" id="next-steps">
            <h2>Next steps</h2>
            <div className="docs-next-grid">
              <Link href="/swap"><span>⇄</span><div><strong>Make a swap</strong><p>Open the trading interface.</p></div><b>→</b></Link>
              <Link href="/trade"><span>⌁</span><div><strong>Open advanced trade</strong><p>Charts, limit orders and live pool state.</p></div><b>→</b></Link>
            </div>
          </section>
        </article>

        <aside className="docs-toc">
          <strong>{t.onThisPage}</strong>
          <nav>
            {toc.map(([label, href]) => (
              <a key={href} href={`#${href}`}>{label}</a>
            ))}
          </nav>
        </aside>
      </div>
    </main>
  );
}
