"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGGREGATOR, CONTRACTS, EXPLORER, GIWA_CHAIN_ID, MARKETS, TOKENS } from "@/app/lib/dubu";
import "./docs.css";

const EXPLORER_ADDRESS = `${EXPLORER}/address`;
const PROP_ADAPTER = "0x16C5A0df5Ad0c8b0A450eDaa67c56593B02D19e2";
const UNIV2_ADAPTER = "0xA7383784E39d2d3C717C61735A363654360DeF46";
const PMM_ADAPTER = "0x92CC1139212d02c8CF198dE804161432feEa4eBD";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

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
    title: "Aggregator API",
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
  ["What DuBu is", "overview"],
  ["Architecture", "architecture"],
  ["The engine", "engine"],
  ["Contracts", "contracts"],
  ["Pricing model", "pricing"],
  ["Capacity and epochs", "capacity"],
  ["Guards and roles", "guards"],
  ["Aggregator API", "quote-endpoint"],
  ["Errors", "errors"],
  ["Markets", "markets"],
  ["Integrating", "integrating"],
] as const;

const contracts = [
  {
    name: "PropPool",
    address: CONTRACTS.propPool,
    what: "The proprietary-inventory AMM. Holds the reserves, stores one four-point ladder per pair, and fills takers against it out of its own book.",
    entries: [
      "updateQuote(uint256[])",
      "refreshCapacity(uint16,uint96,uint96)",
      "refreshCapacityBatch(uint256[])",
      "swap(address,address,int256,uint256,address,uint256,uint256)",
      "swapWithContractBalance(address,address,uint256,address,uint256,uint256)",
      "getAmountOut / getAmountIn",
      "quoteByPair(uint16,bool,uint256)",
      "snapshot(uint16)",
      "effectiveCapacity(uint16)",
    ],
  },
  {
    name: "Router",
    address: CONTRACTS.router,
    what: "A pure executor. Pulls tokenIn, divides it by weight across adapters, enforces one route-wide minimum, and forwards tokenOut. It never picks a venue.",
    entries: [
      "swapExactIn(RouteParams,uint256)",
      "swapExactOut(RouteParams,uint256,uint256)",
      "swapExactInWithPermit2(RouteParams,uint256,PermitTransferFrom,bytes)",
      "swapExactOutWithPermit2(RouteParams,uint256,uint256,PermitTransferFrom,bytes)",
    ],
  },
  {
    name: "PmmSettle",
    address: CONTRACTS.pmmSettle,
    what: "RFQ settlement. Verifies an EIP-712 order signed by the maker and moves both legs with transferFrom. It custodies nothing and supports partial fills.",
    entries: [
      "fillOrder(Order,bytes,uint256,uint32,address)",
      "hashOrder(Order)",
      "previewFill(Order,uint256,uint256)",
      "remainingTaker(Order)",
      "cancelNonce(uint64)",
      "DOMAIN_SEPARATOR()",
    ],
  },
  {
    name: "PropPoolAdapter",
    address: PROP_ADAPTER,
    what: "Router-side shim for PropPool. Decodes a 160-byte (base, quote, limitAmount, partnerId, deadline) payload and calls swapWithContractBalance.",
    entries: [
      "sellBase(address,address,bytes)",
      "sellQuote(address,address,bytes)",
      "encodePayload(address,address,uint256,uint256,uint256)",
    ],
  },
  {
    name: "UniV2Adapter",
    address: UNIV2_ADAPTER,
    what: "Router-side shim for a UniswapV2 pair. Sizes the swap from the pair's own balance delta and applies the 0.30 percent constant-product formula.",
    entries: [
      "sellBase(address,address,bytes)",
      "sellQuote(address,address,bytes)",
      "getAmountOut(uint256,uint256,uint256)",
    ],
  },
  {
    name: "PmmAdapter",
    address: PMM_ADAPTER,
    what: "Router-side shim for PmmSettle. Fills the lesser of what it was funded and what the order has left, then returns any remainder.",
    entries: [
      "sellBase(address,address,bytes)",
      "sellQuote(address,address,bytes)",
      "encodePayload(Order,bytes,uint32)",
    ],
  },
];

const quoteRequest = `curl -s -X POST ${AGGREGATOR}/quote \\
  -H 'content-type: application/json' \\
  -d '{
    "tokenIn":     "${TOKENS.mUSDC.address}",
    "tokenOut":    "${TOKENS.mWETH.address}",
    "amountIn":    "1000000000",
    "receiver":    "0x5AD176eBb13CAbE62Ee7c07F52a67b4A48CbEf83",
    "slippageBps": 50
  }'`;

const quoteResponse = `{
  "market": "mWETH/mUSDC",
  "tokenIn": "0xd28596C6750D87C53EA146134AfAB53de86C5155",
  "tokenOut": "0x81e46C6379498beBEB5DCcD47ab2DdFaf967d445",
  "amountIn": "1000000000",
  "amountOut": "524438489691532502",
  "minAmountOut": "521816297243074839",
  "slippageBps": 50,
  "deadline": "1785478101",
  "route": {
    "to": "0x2B10D0b50ca3A7c0C7CCaBc969615b4Db3fb9471",
    "data": "0x2037eb8e00000000000000000000000000000000000000000000000000000000
             00000040000000000000000000000000000000000000000000000000073ddd28
             5b2ee117 ... 900 bytes total",
    "value": "0x0",
    "venues": ["prop"]
  },
  "detail": {
    "prop": "524438489691532502",
    "univ2": "522021457973787776",
    "rfq": "524156054896774516",
    "rfqRejected": null,
    "rfqMakerReason": null,
    "rfqMakerCanDeliver": "463486574883963348339",
    "split": false,
    "legs": [
      {
        "venue": "prop",
        "weightBps": 10000,
        "amountIn": "1000000000",
        "amountOut": "524438489691532502"
      }
    ]
  },
  "approve": {
    "token": "0xd28596C6750D87C53EA146134AfAB53de86C5155",
    "spender": "0x2B10D0b50ca3A7c0C7CCaBc969615b4Db3fb9471",
    "amountIn": "1000000000"
  }
}`;

const marketsRequest = `curl -s ${AGGREGATOR}/markets`;

const marketsResponse = `{
  "chainId": 91342,
  "rfq": true,
  "markets": [
    {
      "pairId": 1,
      "symbol": "mWETH/mUSDC",
      "base": "0x81e46C6379498beBEB5DCcD47ab2DdFaf967d445",
      "quote": "0xd28596C6750D87C53EA146134AfAB53de86C5155",
      "baseDecimals": 18,
      "quoteDecimals": 6
    },
    {
      "pairId": 2,
      "symbol": "mWBTC/mUSDC",
      "base": "0x3548991B5EF2D7805EFa95bEa6CeDeAee3869875",
      "quote": "0xd28596C6750D87C53EA146134AfAB53de86C5155",
      "baseDecimals": 8,
      "quoteDecimals": 6
    },
    ... seven more, through pairId 9
  ]
}`;

const errorNoVenue = `HTTP 404
{
  "error": "no venue would fill that size",
  "detail": "Every venue returned zero. On the prop side that is spent epoch
             capacity, which refills on the next epoch, or a stale quote, a
             paused pair, or an engine that could not be reached. A pause can
             be a latched killswitch, so none of those last three is known to
             clear without an operator. A side withdrawn to re-price answers
             503 rather than this.",
  "solo": { "prop": "0", "univ2": "0" }
}`;

const errorRepricing = `HTTP 503
{
  "error": "the pair is temporarily re-pricing",
  "detail": "The prop pool has withdrawn its quotes for this side after a
             price move, and no other venue would fill that size. The
             withdrawal is a cool-off measured in tens of seconds, so the
             same request is worth retrying.",
  "retryable": true,
  "solo": { "prop": "0", "univ2": "0" }
}`;

const errorNoMarket = `HTTP 400
{
  "error": "no market for that token pair",
  "markets": [
    "mWETH/mUSDC", "mWBTC/mUSDC", "mBNB/mUSDC",
    "mXRP/mUSDC",  "mSOL/mUSDC",  "mAAPL/mUSDC",
    "mTSLA/mUSDC", "mSKHY/mUSDC", "mSPCX/mUSDC"
  ]
}`;

const approvePath = `import { BrowserProvider, Contract, MaxUint256 } from "ethers";

const AGGREGATOR = "${AGGREGATOR}";

const ERC20 = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

export async function swap(tokenIn, tokenOut, amountIn) {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const receiver = await signer.getAddress();

  const res = await fetch(\`\${AGGREGATOR}/quote\`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      receiver,
      slippageBps: 50,
    }),
  });
  const quote = await res.json();
  if (quote.error) throw new Error(quote.error);

  // The Router is the spender on every route, RFQ included.
  const erc20 = new Contract(quote.approve.token, ERC20, signer);
  const allowed = await erc20.allowance(receiver, quote.approve.spender);
  if (allowed < amountIn) {
    await (await erc20.approve(quote.approve.spender, MaxUint256)).wait();
  }

  // Send it unmodified: minAmountOut, receiver and deadline are all inside.
  const tx = await signer.sendTransaction({
    to: quote.route.to,
    data: quote.route.data,
    value: quote.route.value,
  });
  return tx.wait();
}`;

const permit2Path = `import { BrowserProvider, Contract, Interface, MaxUint256 } from "ethers";

const ROUTER = "${CONTRACTS.router}";
const PERMIT2 = "${PERMIT2}";

const ROUTE_PARAMS =
  "tuple(address tokenIn,address tokenOut,address receiver,uint256 amountIn," +
  "uint256 quotedAmountOut,uint256 deadline," +
  "tuple(uint16 weightBps,tuple(address tokenIn," +
  "tuple(address adapter,uint256 rawData,bytes payload)[] steps)[] hops)[] batches)";

const router = new Interface([
  \`function swapExactIn(\${ROUTE_PARAMS} p, uint256 minAmountOut)\` +
    " returns (uint256)",
  \`function swapExactInWithPermit2(\${ROUTE_PARAMS} p, uint256 minAmountOut,\` +
    " tuple(tuple(address token,uint256 amount) permitted," +
    "uint256 nonce,uint256 deadline) permit, bytes signature)" +
    " returns (uint256)",
]);

// Takes the quote body from the call above.
export async function swapWithPermit2(quote) {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();

  // One standing approval, to Permit2 rather than to the Router.
  const erc20 = new Contract(
    quote.approve.token,
    ["function allowance(address,address) view returns (uint256)",
     "function approve(address,uint256) returns (bool)"],
    signer,
  );
  if ((await erc20.allowance(owner, PERMIT2)) === 0n) {
    await (await erc20.approve(PERMIT2, MaxUint256)).wait();
  }

  // The aggregator encodes swapExactIn. Lift the plan out and re-target it.
  const [routeParams, minAmountOut] = router.decodeFunctionData(
    "swapExactIn",
    quote.route.data,
  );

  const permit = {
    permitted: { token: quote.approve.token, amount: quote.amountIn },
    nonce: BigInt(Date.now()),
    deadline: BigInt(quote.deadline),
  };

  const signature = await signer.signTypedData(
    { name: "Permit2", chainId: ${GIWA_CHAIN_ID}, verifyingContract: PERMIT2 },
    {
      PermitTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
      TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
    { ...permit, spender: ROUTER },
  );

  const tx = await signer.sendTransaction({
    to: ROUTER,
    data: router.encodeFunctionData("swapExactInWithPermit2", [
      routeParams,
      minAmountOut,
      permit,
      signature,
    ]),
  });
  return tx.wait();
}`;

const wordLayout = `quote word     [255:224]  updatedAt (uint32)    [223:168]  maxAsk (uint56)
               [167:112]  minAsk (uint56)       [111:56]   maxBid (uint56)
               [55:0]     minBid (uint56)

capacity word  [255:240]  decaySecs (uint16)    [239:224]  flags (bit 224 = paused)
               [223:192]  capGen (uint32)       [191:96]   askCapacity (uint96)
               [95:0]     bidCapacity (uint96)

used word      [223:192]  usedGen (uint32)      [191:96]   askUsed (uint96)
               [95:0]     bidUsed (uint96)

updateQuote takes the quote word before the stamp is applied:
               [239:224]  pairId (uint16)       [223:0]    the four prices
               [255:240]  read by nothing; masked off with the rest of [255:224]`;

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="docs-code-block">
      <div className="docs-code-head">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_400);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <figure className="docs-figure">
      <svg
        viewBox="0 0 860 430"
        role="img"
        aria-label="The engine pushes a ladder to PropPool and prices the prop leg for the aggregator; the aggregator returns calldata; the wallet signs it to the Router, which executes against PropPool, the UniswapV2 pair and PmmSettle."
      >
        <defs>
          <marker id="docs-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0 0 L6 3 L0 6 z" className="docs-svg-arrowhead" />
          </marker>
        </defs>

        <g className="docs-svg-line" strokeDasharray="4 5">
          <path d="M10 150 H 850" />
        </g>
        <text className="docs-svg-tag" x="762" y="144">OFF CHAIN</text>
        <text className="docs-svg-tag" x="774" y="166">ON CHAIN</text>

        <g className="docs-svg-line" markerEnd="url(#docs-arrow)">
          <path d="M200 70 H 314" />
          <path d="M520 70 H 644" />
          <path d="M745 106 V 164" />
          <path d="M70 106 V 314" />
          <path d="M700 234 V 274 H 150 V 314" />
          <path d="M700 274 H 400 V 314" />
          <path d="M700 274 H 630 V 314" />
        </g>

        <g>
          <rect className="docs-svg-panel" x="20" y="34" width="180" height="72" rx="12" />
          <text className="docs-svg-label" x="36" y="62">Engine</text>
          <text className="docs-svg-sub" x="36" y="80">Rust market maker</text>
          <text className="docs-svg-sub" x="36" y="95">feed to ladder, 200 ms</text>
        </g>

        <g>
          <rect className="docs-svg-panel" x="320" y="34" width="200" height="72" rx="12" />
          <text className="docs-svg-label" x="336" y="62">Aggregator</text>
          <text className="docs-svg-sub" x="336" y="80">Cloudflare Worker</text>
          <text className="docs-svg-sub" x="336" y="95">11-point split search</text>
        </g>

        <g>
          <rect className="docs-svg-panel" x="644" y="34" width="192" height="72" rx="12" />
          <text className="docs-svg-label" x="660" y="62">Wallet</text>
          <text className="docs-svg-sub" x="660" y="80">signs to + data</text>
          <text className="docs-svg-sub" x="660" y="95">no custody anywhere</text>
        </g>

        <g>
          <rect className="docs-svg-panel" x="644" y="164" width="192" height="70" rx="12" />
          <text className="docs-svg-label" x="660" y="192">Router</text>
          <text className="docs-svg-sub" x="660" y="210">divides by weightBps</text>
          <text className="docs-svg-sub" x="660" y="225">enforces minAmountOut</text>
        </g>

        <g>
          <rect className="docs-svg-panel" x="20" y="314" width="200" height="72" rx="12" />
          <text className="docs-svg-label" x="36" y="342">PropPool</text>
          <text className="docs-svg-sub" x="36" y="360">own inventory</text>
          <text className="docs-svg-sub" x="36" y="375">four-point ladder</text>
        </g>

        <g>
          <rect className="docs-svg-panel" x="300" y="314" width="200" height="72" rx="12" />
          <text className="docs-svg-label" x="316" y="342">UniswapV2 pair</text>
          <text className="docs-svg-sub" x="316" y="360">constant product</text>
          <text className="docs-svg-sub" x="316" y="375">two pairs of the nine</text>
        </g>

        <g>
          <rect className="docs-svg-panel" x="560" y="314" width="200" height="72" rx="12" />
          <text className="docs-svg-label" x="576" y="342">PmmSettle</text>
          <text className="docs-svg-sub" x="576" y="360">signed RFQ order</text>
          <text className="docs-svg-sub" x="576" y="375">maker inventory</text>
        </g>

        <text className="docs-svg-sub" x="206" y="60">prop prices</text>
        <text className="docs-svg-sub" x="526" y="60">to + data</text>
        <text className="docs-svg-sub" x="752" y="142">signed tx</text>
        <text className="docs-svg-sub" x="80" y="200">updateQuote</text>
        <text className="docs-svg-sub" x="80" y="216">refreshCapacity</text>
        <text className="docs-svg-sub" x="404" y="268">sellBase / sellQuote</text>
      </svg>
      <figcaption>
        The engine is the only writer of prices, the aggregator is the only component that compares
        venues, and the Router is the only one that moves funds. The aggregator reads the UniswapV2
        pair on chain through Multicall3 and takes the prop price from the engine over HTTP, for the
        reason given below.
      </figcaption>
    </figure>
  );
}

function LadderDiagram() {
  return (
    <figure className="docs-figure">
      <svg
        viewBox="0 0 860 230"
        role="img"
        aria-label="The four-point ladder. Bids walk down from maxBid to minBid as bid capacity is consumed; asks walk up from minAsk to maxAsk."
      >
        <line className="docs-svg-line" x1="60" y1="152" x2="810" y2="152" />

        <g className="docs-svg-accent">
          <path d="M120 98 L 396 130" />
          <path d="M474 130 L 750 98" />
        </g>

        <g className="docs-svg-line" strokeDasharray="3 3">
          <path d="M120 98 V 152" />
          <path d="M396 130 V 152" />
          <path d="M474 130 V 152" />
          <path d="M750 98 V 152" />
        </g>

        <g className="docs-svg-label">
          <text x="86" y="88">maxBid</text>
          <text x="364" y="120">minBid</text>
          <text x="446" y="120">minAsk</text>
          <text x="712" y="88">maxAsk</text>
        </g>

        <g className="docs-svg-sub">
          <text x="86" y="172">bidUsed = 0</text>
          <text x="330" y="172">bidUsed = bidCapacity</text>
          <text x="446" y="172">askUsed = 0</text>
          <text x="676" y="172">askUsed = askCapacity</text>
          <text x="60" y="42">The pool sells base on the ask side. What it charges walks up as the epoch is consumed.</text>
          <text x="60" y="206">The pool buys base on the bid side. What it pays walks down as the epoch is consumed.</text>
        </g>

        <text className="docs-svg-tag" x="196" y="66">BID SIDE</text>
        <text className="docs-svg-tag" x="566" y="66">ASK SIDE</text>
      </svg>
      <figcaption>
        Four <code>uint56</code> prices in one storage word. <code>validateLadder</code> requires
        <code>minBid &le; maxBid &le; minAsk &le; maxAsk</code> and <code>maxAsk &gt; minBid</code>,
        so the two sides may touch but never cross.
      </figcaption>
    </figure>
  );
}

export default function DocsPage() {
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState("overview");
  const sidebarRef = useRef<HTMLElement>(null);

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
                    className={href === activeId ? "active" : ""}
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
        {docsMenuOpen && (
          <button
            className="docs-sidebar-scrim"
            type="button"
            aria-label="Close documentation navigation"
            onClick={() => setDocsMenuOpen(false)}
          />
        )}

        <article className="docs-article">
          <button className="docs-mobile-index" type="button" onClick={() => setDocsMenuOpen((current) => !current)}>
            <span>☷</span> Browse documentation
          </button>

          <div className="docs-breadcrumb"><Link href="/docs">Docs</Link><span>›</span><b>Protocol</b></div>

          <section className="docs-hero" id="overview">
            <div className="docs-eyebrow">TECHNICAL DOCUMENTATION</div>
            <h1>DuBu protocol.</h1>
            <p>
              A proprietary-inventory AMM on GIWA, and an aggregator that routes across it.
            </p>
            <div className="docs-meta">
              <span>Chain {GIWA_CHAIN_ID} · GIWA Sepolia</span>
            </div>
          </section>

          <section className="docs-section" id="what-is-dubu">
            <h2>What DuBu is</h2>
            <p>
              DuBu is a proprietary-inventory AMM on GIWA, chain {GIWA_CHAIN_ID}. An off-chain engine
              publishes a four-point price ladder for each of nine pairs, and <code>PropPool</code>{" "}
              fills takers against that ladder out of reserves it owns, with no constant-product
              curve anywhere in the pricing. In front of it sits an aggregator that prices every
              request across three venues, the prop pool, a UniswapV2 pool and an RFQ maker, and
              hands back calldata ready for the <code>Router</code>.
            </p>
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
                  <strong>The engine publishes a ladder</strong>
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
                  <strong>The aggregator prices the whole grid</strong>
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
                  <strong>It asks the RFQ maker to beat that</strong>
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
                  Reading the pool on chain needs pending state to see a ladder published inside the
                  current block, and GIWA serves pending state and pending timestamp
                  inconsistently. A <code>block.timestamp</code> ahead of the state whose{" "}
                  <code>updatedAt</code> it is compared against makes <code>PropPool</code> return{" "}
                  <code>STATUS_STALE</code> and pay zero on every pair. The engine prices the same
                  curve instead, from an exact integer port of <code>PropCurve.sol</code>. There is
                  deliberately no on-chain fallback: an unreachable engine shows up as the prop venue
                  being absent, not as a second and differently wrong price.
                </p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="engine">
            <h2>The engine</h2>
            <p>
              The market maker is a Rust service. Its cycle runs feed, fair value, spread, skew,
              ladder, policy, transaction, every 200 ms and again on every new head, for all nine
              pairs at once.
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
                <dt>Ladder</dt>
                <dd>
                  The skewed mid gives a bid target and an ask target. Each side is solved for the
                  width that makes the <em>average</em> executed price over a full epoch land on its
                  target, so the four points are chosen by the size the pool intends to trade rather
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
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Address</th>
                    <th>What it does</th>
                    <th>Key entry points</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract.name}>
                      <td data-label="Contract">{contract.name}</td>
                      <td data-label="Address">
                        <a href={`${EXPLORER_ADDRESS}/${contract.address}`} target="_blank" rel="noreferrer">
                          {contract.address}
                        </a>
                      </td>
                      <td data-label="What it does">{contract.what}</td>
                      <td data-label="Key entry points">
                        <div className="docs-entrypoints">
                          {contract.entries.map((entry) => <span key={entry}>{entry}</span>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              A pair costs three hot storage words. One carries the ladder and the timestamp it was
              written at, one carries capacity and the epoch it belongs to, one carries how much of
              that epoch has been consumed. Everything a quote needs is in those three reads.
            </p>

            <CodeBlock label="PropPool, hot storage layout" code={wordLayout} />

            <LadderDiagram />

            <h3>Prices are integers</h3>
            <p>
              Each of the four points is a <code>uint56</code> scaled by{" "}
              <code>10^priceScaleExp</code>, a per-pair constant that absorbs the decimal difference
              between base and quote. On the bid side the pool pays{" "}
              <code>amountIn · p / 10^priceScaleExp</code> quote units for base; on the ask side it
              charges the same product, rounded the other way. Both sides denominate capacity and
              usage in the <em>base</em> token.
            </p>

            <h3>The price walks as an epoch is consumed</h3>
            <p>
              The ladder is not two fixed prices, it is two linear ramps. The marginal bid starts at{" "}
              <code>maxBid</code> when nothing has been sold to the pool and falls linearly to{" "}
              <code>minBid</code> as <code>bidUsed</code> reaches <code>bidCapacity</code>. The
              marginal ask starts at <code>minAsk</code> and rises to <code>maxAsk</code>. A trade is
              charged the integral over the stretch of ramp it consumes, which is the average of the
              marginal price at its start and at its end.
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
              A larger trade therefore prices worse than a smaller one on the same ladder, and a
              trade arriving after the epoch is half consumed prices worse than the same trade
              arriving first. That is the whole of DuBu&apos;s price impact. There is no reserve ratio in
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
              Capacity is how much base the pool will trade on one side before the ladder is
              exhausted, and it is also the denominator of the walk. It is refreshed by the engine,
              not replenished by trading.
            </p>
            <p>
              An epoch is a generation counter. <code>refreshCapacity</code> writes new bid and ask
              capacities and increments a 32-bit <code>capGen</code>. The used word carries its own{" "}
              <code>usedGen</code>, and when the two disagree <code>bidUsed</code> and{" "}
              <code>askUsed</code> read as zero. A refresh therefore resets the walk to the top of
              the ladder in a single write, without touching the used word at all.
            </p>
            <p>
              Capacity also decays with quote age. If a pair has a non-zero <code>decaySecs</code>,
              the size the pool will fill is <code>capacity · (decaySecs − age) / decaySecs</code>,
              reaching zero at <code>age ≥ decaySecs</code>, where <code>age</code> is measured from
              the ladder&apos;s own <code>updatedAt</code>. This is a dead-man switch: an engine that
              stops publishing walks its own book down to nothing with nobody intervening.
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
                  ladder against it and reverts <code>BidCeilingExceeded</code> if{" "}
                  <code>maxBid</code> sits more than <code>maxDeviationBps</code> above the
                  reference, or <code>AskFloorBreached</code> if <code>minAsk</code> sits that far
                  below it. A feed that is unavailable, stale or non-positive reverts{" "}
                  <code>ReferenceUnavailable</code> rather than passing. This is the only check that
                  can catch a fair value that is coherently wrong, because it comes from a source the
                  engine does not price from.
                </dd>
              </div>
              <div>
                <dt>Ladder validity</dt>
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
                <span>AGGREGATOR API</span>
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
                <span>AGGREGATOR API</span>
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
                  Every venue returned zero: spent epoch capacity, a stale ladder, a paused pair, or
                  an engine that could not be reached. A pause can be a latched killswitch, so this
                  is not known to clear without an operator.
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
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>pairId</th>
                    <th>Symbol</th>
                    <th>Base address</th>
                    <th>Decimals</th>
                    <th>Tracks</th>
                  </tr>
                </thead>
                <tbody>
                  {MARKETS.map((market) => {
                    const token = TOKENS[market.base];
                    return (
                      <tr key={market.base}>
                        <td data-label="pairId">{market.pairId}</td>
                        <td data-label="Symbol">{market.base}/{market.quote}</td>
                        <td data-label="Base address">
                          {token.address && (
                            <a href={`${EXPLORER_ADDRESS}/${token.address}`} target="_blank" rel="noreferrer">
                              {token.address}
                            </a>
                          )}
                        </td>
                        <td data-label="Decimals">{token.decimals}</td>
                        <td data-label="Tracks">{token.tracks}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
                  The pool re-quotes several times a second and RFQ orders are signed with a short
                  expiry, so a quote a few seconds old can revert rather than merely mis-price. Fetch
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
          <strong>On this page</strong>
          <nav>
            {toc.map(([label, href]) => <a key={href} href={`#${href}`}>{label}</a>)}
          </nav>
        </aside>
      </div>
    </main>
  );
}
