"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppPageHeader,
  Panel,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import {
  balanceOf,
  EXPLORER,
  fromBaseUnits,
  GIWA_RPC,
  TOKENS,
  type TokenSymbol,
} from "@/app/lib/dubu";

type FaucetSymbol = Exclude<TokenSymbol, "mSPCX">;
type ClaimState = {
  symbol: FaucetSymbol;
  stage: "submitting" | "confirming" | "confirmed";
  hash?: string;
} | null;

const FAUCET_ASSETS: Array<{
  symbol: FaucetSymbol;
  amount: string;
  group: "Crypto" | "Stocks";
}> = [
  { symbol: "mUSDC", amount: "10,000", group: "Crypto" },
  { symbol: "mWETH", amount: "2", group: "Crypto" },
  { symbol: "mWBTC", amount: "0.1", group: "Crypto" },
  { symbol: "mBNB", amount: "10", group: "Crypto" },
  { symbol: "mXRP", amount: "2,000", group: "Crypto" },
  { symbol: "mSOL", amount: "50", group: "Crypto" },
  { symbol: "mSKHY", amount: "100", group: "Stocks" },
  { symbol: "mAAPL", amount: "20", group: "Stocks" },
  { symbol: "mTSLA", amount: "20", group: "Stocks" },
];

function shortenAddress(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

async function waitForReceipt(hash: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const response = await fetch(GIWA_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [hash],
      }),
    });
    const body = await response.json() as {
      result?: { status?: string } | null;
    };

    if (body.result) {
      if (body.result.status === "0x0") throw new Error("Transaction reverted.");
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }
}

export default function FaucetPage() {
  const {
    connected,
    address,
    onGiwa,
    openWallet,
    switchToGiwa,
  } = useAppWallet();
  const [filter, setFilter] = useState<"All" | "Crypto" | "Stocks">("All");
  const [balances, setBalances] = useState<Partial<Record<FaucetSymbol, string>>>({});
  const [availability, setAvailability] = useState<Partial<Record<FaucetSymbol, boolean>>>({});
  const [faucetReady, setFaucetReady] = useState<boolean | null>(null);
  const [claim, setClaim] = useState<ClaimState>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const visibleAssets = useMemo(
    () => filter === "All"
      ? FAUCET_ASSETS
      : FAUCET_ASSETS.filter((asset) => asset.group === filter),
    [filter],
  );

  const refreshBalances = useCallback(async () => {
    if (!address) {
      setBalances({});
      return;
    }

    const entries = await Promise.all(
      FAUCET_ASSETS.map(async ({ symbol }) => {
        const token = TOKENS[symbol];
        if (!token.address) return [symbol, "—"] as const;
        try {
          const value = await balanceOf(token.address, address as `0x${string}`);
          return [symbol, fromBaseUnits(value, token.decimals, 6)] as const;
        } catch {
          return [symbol, "—"] as const;
        }
      }),
    );
    setBalances(Object.fromEntries(entries));
  }, [address]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    void fetch("/api/faucet", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Faucet status unavailable.");
        return response.json() as Promise<{
          configured: boolean;
          assets: Array<{ symbol: FaucetSymbol; available: boolean }>;
        }>;
      })
      .then((status) => {
        setFaucetReady(status.configured);
        setAvailability(Object.fromEntries(
          status.assets.map((asset) => [asset.symbol, asset.available]),
        ));
      })
      .catch(() => {
        setFaucetReady(false);
        setAvailability({});
      });
  }, []);

  async function requestAsset(symbol: FaucetSymbol) {
    if (!connected || !address) {
      openWallet();
      return;
    }

    setError("");
    setNotice("");
    setClaim({ symbol, stage: "submitting" });

    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, symbol }),
      });
      const body = await response.json() as {
        error?: string;
        amount?: string;
        transactionHash?: string;
      };

      if (!response.ok || !body.transactionHash) {
        throw new Error(body.error || "The faucet request failed.");
      }

      setClaim({ symbol, stage: "confirming", hash: body.transactionHash });
      await waitForReceipt(body.transactionHash);
      await refreshBalances();
      setClaim({ symbol, stage: "confirmed", hash: body.transactionHash });
      setNotice(`${body.amount} ${symbol} arrived in ${shortenAddress(address)}.`);
    } catch (claimError) {
      setClaim(null);
      setError(claimError instanceof Error ? claimError.message : "The faucet request failed.");
    }
  }

  return (
    <div className="faucet-page">
      <div className="faucet-heading-row">
        <AppPageHeader
          title="Faucet"
          description="Fund your wallet with mock assets and start trading."
        />
        <div className="faucet-wallet-chip">
          <span className={connected ? "connected" : ""} />
          {connected ? shortenAddress(address) : "Wallet not connected"}
        </div>
      </div>

      <Panel className="faucet-hero">
        <div className="faucet-hero-copy">
          <span className="faucet-eyebrow">Test assets</span>
          <h2>Everything you need for your first trade.</h2>
          <p>
            Claim mUSDC and a market asset. Funds are sent directly to your connected wallet.
          </p>
          <div className="faucet-steps" aria-label="Faucet steps">
            <span><b>1</b> Connect</span>
            <i />
            <span><b>2</b> Claim</span>
            <i />
            <span><b>3</b> Trade</span>
          </div>
        </div>
        <div className="faucet-hero-art" aria-hidden="true">
          <span className="faucet-drop">◇</span>
          <div>
            <TokenIcon symbol="mUSDC" />
            <TokenIcon symbol="mWETH" />
            <TokenIcon symbol="mWBTC" />
          </div>
        </div>
      </Panel>

      {!connected ? (
        <Panel className="faucet-connect-card">
          <div className="faucet-connect-icon">↗</div>
          <div>
            <h2>Connect your wallet</h2>
            <p>Your wallet address is used as the faucet recipient.</p>
          </div>
          <button className="app-primary-button" type="button" onClick={openWallet}>
            Connect wallet
          </button>
        </Panel>
      ) : !onGiwa ? (
        <Panel className="faucet-connect-card">
          <div className="faucet-connect-icon">G</div>
          <div>
            <h2>Switch your wallet network</h2>
            <p>Use the same network as Dubu before claiming assets.</p>
          </div>
          <button className="app-primary-button" type="button" onClick={() => void switchToGiwa()}>
            Switch network
          </button>
        </Panel>
      ) : null}

      <div className="faucet-toolbar">
        <div>
          {(["All", "Crypto", "Stocks"] as const).map((option) => (
            <button
              key={option}
              className={filter === option ? "active" : ""}
              type="button"
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void refreshBalances()} disabled={!connected}>
          ↻ Refresh balances
        </button>
      </div>

      {faucetReady === false && (
        <div className="faucet-notice error">
          <span>!</span>
          <p>The faucet is temporarily unavailable. Please check back shortly.</p>
        </div>
      )}

      {(notice || error) && (
        <div className={error ? "faucet-notice error" : "faucet-notice"}>
          <span>{error ? "!" : "✓"}</span>
          <p>{error || notice}</p>
          {claim?.hash && (
            <a href={`${EXPLORER}/tx/${claim.hash}`} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          )}
        </div>
      )}

      <div className="faucet-grid">
        {visibleAssets.map(({ symbol, amount, group }) => {
          const token = TOKENS[symbol];
          const activeClaim = claim?.symbol === symbol;
          const assetAvailable = availability[symbol] !== false;
          const buttonLabel = activeClaim
            ? claim.stage === "submitting"
              ? "Submitting…"
              : claim.stage === "confirming"
                ? "Confirming…"
                : "Claimed"
            : faucetReady !== null && !assetAvailable
              ? "Unavailable"
              : `Claim ${amount}`;

          return (
            <Panel className="faucet-asset-card" key={symbol}>
              <div className="faucet-asset-top">
                <TokenIcon symbol={symbol} />
                <span>{group}</span>
              </div>
              <div className="faucet-asset-name">
                <h3>{symbol}</h3>
                <p>{token.name}</p>
              </div>
              <div className="faucet-asset-balance">
                <small>Wallet balance</small>
                <strong>{connected ? balances[symbol] ?? "Loading…" : "—"}</strong>
              </div>
              <button
                type="button"
                disabled={!connected || !onGiwa || Boolean(claim) || faucetReady !== true || !assetAvailable}
                onClick={() => void requestAsset(symbol)}
              >
                {buttonLabel}
                {!activeClaim && <span>→</span>}
              </button>
            </Panel>
          );
        })}
      </div>

      <p className="faucet-footnote">
        Mock assets have no monetary value. Each wallet can request an asset again after using its current balance.
      </p>
    </div>
  );
}
