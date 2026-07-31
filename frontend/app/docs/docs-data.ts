/**
 * Language-neutral docs content: the section ids, and every payload that must read the same
 * in English and in Korean.
 *
 * # Why this file exists
 *
 * A Korean section replaces a whole `<section>`, so if a translator wants to keep a code block
 * they have to render one. If the block were copy-pasted into `ko.tsx`, the addresses and ABI
 * signatures in the copy would drift the first time a contract is redeployed. Keeping the single
 * source here and having both languages import it makes that drift impossible rather than merely
 * discouraged.
 *
 * Nothing here imports from `docs-lang`, `docs-blocks`, `docs-i18n` or `ko`, which is what keeps
 * the module graph acyclic.
 */

import { AGGREGATOR, CONTRACTS, EXPLORER, GIWA_CHAIN_ID, TOKENS } from "@/app/lib/dubu";

/**
 * Every `<Section>` on the page, in document order. This is the entire bookkeeping surface of
 * the translation: a Korean entry is keyed by one of these, so a typo in `ko.tsx` is a compile
 * error and an entry for a section that does not exist cannot silently render nothing.
 */
export const SECTION_IDS = [
  "overview",
  "what-is-dubu",
  "architecture",
  "engine",
  "contracts",
  "pricing",
  "capacity",
  "guards",
  "quote-endpoint",
  "markets-endpoint",
  "errors",
  "markets",
  "integrating",
  "permit2",
  "next-steps",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export const EXPLORER_ADDRESS = `${EXPLORER}/address`;
export const PROP_ADAPTER = "0x16C5A0df5Ad0c8b0A450eDaa67c56593B02D19e2";
export const UNIV2_ADAPTER = "0xA7383784E39d2d3C717C61735A363654360DeF46";
export const PMM_ADAPTER = "0x92CC1139212d02c8CF198dE804161432feEa4eBD";
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/**
 * `as const` so `name` is a literal union rather than `string`. That is what makes a Korean
 * `what` column keyed by contract name a compile-time check instead of a silent fallback to
 * English when someone mistypes `PropPoool`.
 */
export const contracts = [
  {
    name: "PropPool",
    address: CONTRACTS.propPool,
    what: "Dubu PropAMM, the proprietary-inventory pool. Holds the reserves, stores minBid, maxBid, minAsk and maxAsk per pair in one word, and fills takers against those out of its own book.",
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
    what: "Dubu RFQ settlement. Verifies an EIP-712 order signed by the maker and moves both legs with transferFrom. It custodies nothing and supports partial fills.",
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
] as const;

export type ContractName = (typeof contracts)[number]["name"];

export const quoteRequest = `curl -s -X POST ${AGGREGATOR}/quote \\
  -H 'content-type: application/json' \\
  -d '{
    "tokenIn":     "${TOKENS.mUSDC.address}",
    "tokenOut":    "${TOKENS.mWETH.address}",
    "amountIn":    "1000000000",
    "receiver":    "0x5AD176eBb13CAbE62Ee7c07F52a67b4A48CbEf83",
    "slippageBps": 50
  }'`;

export const quoteResponse = `{
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

export const marketsRequest = `curl -s ${AGGREGATOR}/markets`;

export const marketsResponse = `{
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

export const errorNoVenue = `HTTP 404
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

export const errorRepricing = `HTTP 503
{
  "error": "the pair is temporarily re-pricing",
  "detail": "The prop pool has withdrawn its quotes for this side after a
             price move, and no other venue would fill that size. The
             withdrawal is a cool-off measured in tens of seconds, so the
             same request is worth retrying.",
  "retryable": true,
  "solo": { "prop": "0", "univ2": "0" }
}`;

export const errorNoMarket = `HTTP 400
{
  "error": "no market for that token pair",
  "markets": [
    "mWETH/mUSDC", "mWBTC/mUSDC", "mBNB/mUSDC",
    "mXRP/mUSDC",  "mSOL/mUSDC",  "mAAPL/mUSDC",
    "mTSLA/mUSDC", "mSKHY/mUSDC", "mSPCX/mUSDC"
  ]
}`;

export const approvePath = `import { BrowserProvider, Contract, MaxUint256 } from "ethers";

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

export const permit2Path = `import { BrowserProvider, Contract, Interface, MaxUint256 } from "ethers";

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

export const wordLayout = `quote word     [255:224]  updatedAt (uint32)    [223:168]  maxAsk (uint56)
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
