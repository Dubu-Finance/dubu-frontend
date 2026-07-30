"use client";

/**
 * The token candidate list behind the pickers on /swap and /trade.
 *
 * No row is ever disabled for "no market". Both pages move the opposite side of the pair to a token
 * that trades against the pick, so the only rows a user cannot choose are the token already sitting
 * on the other side and a token that has no deployment yet.
 */

import { TokenIcon } from "@/app/components/AppShell";
import { fromBaseUnits, type TokenInfo, type TokenSymbol } from "@/app/lib/dubu";

export type TokenPickerProps = {
  /** Rows to show, in list order. */
  tokens: TokenInfo[];
  selected: TokenSymbol;
  /** The token on the opposite side of the pair, which cannot also be picked here. */
  otherSide?: TokenSymbol;
  balances: Partial<Record<TokenSymbol, bigint>>;
  connected: boolean;
  /** Accessible name for the listbox. */
  label: string;
  onSelect: (symbol: TokenSymbol) => void;
};

export function TokenPicker({
  tokens,
  selected,
  otherSide,
  balances,
  connected,
  label,
  onSelect,
}: TokenPickerProps) {
  return (
    <div className="dubu-token-dropdown" role="listbox" aria-label={label}>
      <div className="dubu-token-dropdown-head">
        <strong>Select token</strong>
        <span>Available assets</span>
      </div>
      {tokens.map((token) => {
        const isSelected = token.symbol === selected;
        const balance = balances[token.symbol];
        return (
          <button
            key={token.symbol}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={token.symbol === otherSide || !token.address}
            onClick={() => onSelect(token.symbol)}
          >
            <TokenIcon symbol={token.symbol} />
            <span className="dubu-token-copy">
              <strong>{token.symbol}</strong>
              <small>{token.name}</small>
            </span>
            <b>
              {!token.address
                ? "Placeholder"
                // A missing entry is a balance that has not been read yet, which is not the same
                // as zero -- /trade only fetches them while the ticket is in Market mode.
                : connected && balance !== undefined
                  ? fromBaseUnits(balance, token.decimals, 4)
                  : isSelected
                    ? "Selected"
                    : ""}
            </b>
          </button>
        );
      })}
    </div>
  );
}
