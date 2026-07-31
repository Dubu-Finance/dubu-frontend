/**
 * The page's code blocks, tables and diagrams.
 *
 * They live here rather than inline so an address or a signature appears once. Imports
 * `docs-data.ts`, which holds the payloads themselves.
 */
"use client";


import type { ReactNode } from "react";
import { useState } from "react";
import { EXPLORER_ADDRESS, contracts, type ContractName } from "./docs-data";
import { MARKETS, TOKENS } from "@/app/lib/dubu";
import { UI } from "./docs-lang";

/**
 * Inline code, marked as an English island.
 *
 * Korean prose writes `<C>updateQuote</C>` where English prose writes `<code>updateQuote</code>`.
 * The `lang` is what gets an identifier read in an English voice inside a Korean paragraph, and
 * `translate="no"` is what stops a browser's own auto-translate from rewriting it.
 */
export function C({ children }: { children: ReactNode }) {
  return (
    <code lang="en" translate="no">
      {children}
    </code>
  );
}

export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const t = UI;

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
          {copied ? t.copied : t.copy}
        </button>
      </div>
      {/* The payload stays English whatever the page language is. */}
      <pre lang="en" translate="no">
        {code}
      </pre>
    </div>
  );
}

/**
 * Both tables take their column headings as a prop, and both feed the same string to the `<th>`
 * and to the `data-label` the mobile stylesheet echoes with `content: attr(data-label)`. They
 * cannot disagree, which is the failure the responsive layout would otherwise hide until someone
 * opened the page on a phone.
 *
 * `lang="en" translate="no"` moved off the `<table>` and onto the cells that are literals, so the
 * headings and the "what it does" column can be Korean while an address, an ABI signature or a
 * market symbol stays an English island in either language.
 */
const CONTRACT_HEADERS = ["Contract", "Address", "What it does", "Key entry points"] as const;

export function ContractsTable({
  headers = CONTRACT_HEADERS,
  what,
}: {
  headers?: readonly [string, string, string, string];
  what?: Partial<Record<ContractName, string>>;
}) {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead>
          <tr>
            {headers.map((heading) => <th key={heading}>{heading}</th>)}
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => (
            <tr key={contract.name}>
              <td data-label={headers[0]} lang="en" translate="no">{contract.name}</td>
              <td data-label={headers[1]} lang="en" translate="no">
                <a href={`${EXPLORER_ADDRESS}/${contract.address}`} target="_blank" rel="noreferrer">
                  {contract.address}
                </a>
              </td>
              <td data-label={headers[2]}>{what?.[contract.name] ?? contract.what}</td>
              <td data-label={headers[3]} lang="en" translate="no">
                <div className="docs-entrypoints">
                  {contract.entries.map((entry) => <span key={entry}>{entry}</span>)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MARKET_HEADERS = ["pairId", "Symbol", "Base address", "Decimals", "Tracks"] as const;

export function MarketsTable({
  headers = MARKET_HEADERS,
}: {
  headers?: readonly [string, string, string, string, string];
}) {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead>
          <tr>
            {headers.map((heading) => <th key={heading}>{heading}</th>)}
          </tr>
        </thead>
        {/* Every cell is a number, a symbol, an address or a ticker. None of it translates. */}
        <tbody lang="en" translate="no">
          {MARKETS.map((market) => {
            const token = TOKENS[market.base];
            return (
              <tr key={market.base}>
                <td data-label={headers[0]}>{market.pairId}</td>
                <td data-label={headers[1]}>{market.base}/{market.quote}</td>
                <td data-label={headers[2]}>
                  {token.address && (
                    <a href={`${EXPLORER_ADDRESS}/${token.address}`} target="_blank" rel="noreferrer">
                      {token.address}
                    </a>
                  )}
                </td>
                <td data-label={headers[3]}>{token.decimals}</td>
                <td data-label={headers[4]}>{token.tracks}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The SVG labels stay English in both modes. They are mostly identifiers already, and the ones
 * that are not sit inside a diagram whose geometry was laid out for their measured width. If a
 * translated diagram is ever wanted, give this component an optional `labels` prop.
 *
 * The caption is a separate paragraph, so a Korean section can render `<ArchitectureDiagram />`
 * and put its own `<figcaption>` next to it if it wants one.
 */
export function ArchitectureDiagram({ caption }: { caption?: ReactNode }) {
  return (
    <figure className="docs-figure">
      <svg
        viewBox="0 0 860 430"
        role="img"
        lang="en"
        aria-label="The engine pushes the four prices to PropPool and prices the prop leg for the aggregator; the aggregator returns calldata; the wallet signs it to the Router, which executes against PropPool, the UniswapV2 pair and PmmSettle."
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
          <text className="docs-svg-sub" x="36" y="95">feed to four prices, 200 ms</text>
        </g>

        <g>
          <rect className="docs-svg-panel" x="320" y="34" width="200" height="72" rx="12" />
          <text className="docs-svg-label" x="336" y="62">Dubu Aggregator</text>
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
          <text className="docs-svg-sub" x="36" y="375">four prices per pair</text>
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
        {caption ?? (
          <>
            The engine is the only writer of prices, the aggregator is the only component that
            compares venues, and the Router is the only one that moves funds. The aggregator reads
            the UniswapV2 pair on chain through Multicall3 and takes the prop price from the engine
            over HTTP, for the reason given below.
          </>
        )}
      </figcaption>
    </figure>
  );
}

export function QuoteWordDiagram({ caption }: { caption?: ReactNode }) {
  return (
    <figure className="docs-figure">
      <svg
        viewBox="0 0 860 230"
        role="img"
        lang="en"
        aria-label="The four prices in the quote word. Bids walk down from maxBid to minBid as bid capacity is consumed; asks walk up from minAsk to maxAsk."
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
        {caption ?? (
          <>
            Four <code>uint56</code> prices in one storage word. <code>validateLadder</code> requires
            <code>minBid &le; maxBid &le; minAsk &le; maxAsk</code> and <code>maxAsk &gt; minBid</code>,
            so the two sides may touch but never cross.
          </>
        )}
      </figcaption>
    </figure>
  );
}
