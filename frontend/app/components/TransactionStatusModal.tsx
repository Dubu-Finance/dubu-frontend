"use client";

import { EXPLORER } from "@/app/lib/dubu";
import type { TransactionFlow } from "@/app/lib/swap-execution";

/**
 * The wallet -> submitted -> confirmed dialog for a market swap.
 *
 * Shared by /swap and /trade so the two pages cannot disagree about what a pending approval or a
 * delayed confirmation looks like. The class names are the ones already styled globally in
 * `app-shell.css`.
 */
export function TransactionStatusModal({
  transaction,
  onClose,
  backLabel = "Back to swap",
}: {
  transaction: TransactionFlow;
  onClose: () => void;
  backLabel?: string;
}) {
  return (
    <div className="app-modal-backdrop trade-status-backdrop" role="presentation">
      <div
        className={`app-modal trade-status-modal status-${transaction.state}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-status-title"
      >
        {!["wallet", "pending"].includes(transaction.state) && (
          <button
            className="app-modal-close"
            type="button"
            aria-label="Close transaction status"
            onClick={onClose}
          >
            ×
          </button>
        )}

        <div className="trade-status-visual" aria-hidden="true">
          <span className="trade-status-ring" />
          <span className="trade-status-ring ring-two" />
          <i>
            {transaction.state === "success"
              ? "✓"
              : transaction.state === "failed"
                ? "!"
                : transaction.state === "delayed"
                  ? "…"
                  : ""}
          </i>
          {transaction.state === "success" && (
            <span className="trade-status-burst">
              <b /><b /><b /><b /><b /><b />
            </span>
          )}
        </div>

        <span className="trade-status-eyebrow">
          {transaction.action === "swap" ? "Swap" : "Token approval"}
        </span>
        <h2 id="trade-status-title">
          {transaction.state === "wallet"
            ? "Confirm in your wallet"
            : transaction.state === "pending"
              ? "Transaction submitted"
              : transaction.state === "success"
                ? transaction.action === "swap" ? "Swap complete" : "Token approved"
                : transaction.state === "delayed"
                  ? "Still confirming"
                  : "Transaction failed"}
        </h2>
        <p>
          {transaction.state === "wallet"
            ? "Review the details and approve the request in your wallet."
            : transaction.state === "pending"
              ? "Your transaction is onchain and waiting for confirmation."
              : transaction.state === "success"
                ? transaction.action === "swap"
                  ? "Your assets have been exchanged and the new balances are being refreshed."
                  : "You can now continue with the swap."
                : transaction.state === "delayed"
                  ? "Confirmation is taking longer than usual. The transaction is still submitted."
                  : transaction.message ?? "The transaction could not be completed."}
        </p>

        <div className="trade-status-summary">
          <div>
            <span>{transaction.action === "swap" ? "You paid" : "Approved amount"}</span>
            <strong>{transaction.amountIn ?? "—"} {transaction.fromSymbol}</strong>
          </div>
          {transaction.action === "swap" && transaction.toSymbol && (
            <div>
              <span>{transaction.state === "success" ? "You received" : "Expected receive"}</span>
              <strong>{transaction.amountOut ?? "—"} {transaction.toSymbol}</strong>
            </div>
          )}
        </div>

        <ol className="trade-status-steps">
          <li className={transaction.state === "wallet" ? "active" : transaction.state === "failed" && !transaction.hash ? "failed" : "done"}>
            <i>{transaction.state === "wallet" ? "1" : transaction.state === "failed" && !transaction.hash ? "!" : "✓"}</i><span>Wallet request</span>
          </li>
          <li className={transaction.state === "wallet" ? "" : transaction.state === "failed" && transaction.hash ? "failed" : "done"}>
            <i>{transaction.state === "wallet" ? "2" : transaction.state === "failed" && transaction.hash ? "!" : "✓"}</i><span>Submitted</span>
          </li>
          <li className={transaction.state === "success" ? "done" : transaction.state === "pending" || transaction.state === "delayed" ? "active" : ""}>
            <i>{transaction.state === "success" ? "✓" : "3"}</i><span>Confirmed</span>
          </li>
        </ol>

        {transaction.hash && (
          <a
            className="trade-status-explorer"
            href={`${EXPLORER}/tx/${transaction.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction <span>↗</span>
          </a>
        )}

        {["success", "failed", "delayed"].includes(transaction.state) && (
          <button
            className="app-primary-button trade-status-done"
            type="button"
            onClick={onClose}
          >
            {transaction.state === "success" ? "Done" : backLabel}
          </button>
        )}
      </div>
    </div>
  );
}
