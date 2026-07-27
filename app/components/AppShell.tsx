"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark";

type EthereumProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type AppThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

type AppWalletContextValue = {
  connected: boolean;
  connecting: boolean;
  address: string;
  ethBalance: string | null;
  openWallet: () => void;
  disconnect: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue>({
  theme: "light",
  setTheme: () => undefined,
});

const AppWalletContext = createContext<AppWalletContextValue>({
  connected: false,
  connecting: false,
  address: "",
  ethBalance: null,
  openWallet: () => undefined,
  disconnect: () => undefined,
});

export function useAppTheme() {
  return useContext(AppThemeContext);
}

export function useAppWallet() {
  return useContext(AppWalletContext);
}

const navItems = [
  { href: "/swap", label: "Swap", icon: "⇄" },
  { href: "/pools", label: "Pools", icon: "◇" },
  { href: "/portfolio", label: "Portfolio", icon: "⬡" },
  { href: "/analytics", label: "Analytics", icon: "▥" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<Theme>("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [network, setNetwork] = useState("Ethereum");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [address, setAddress] = useState("");
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("dubu-app-theme");
    if (saved === "dark") setThemeState("dark");
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      if (!accounts?.[0]) {
        setAddress("");
        setEthBalance(null);
        return;
      }
      setAddress(accounts[0]);
      void readBalance(accounts[0], provider);
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", handleAccountsChanged);
  }, []);

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
    window.localStorage.setItem("dubu-app-theme", nextTheme);
  }

  async function readBalance(account: string, provider = window.ethereum) {
    if (!provider) return;
    try {
      const value = await provider.request({
        method: "eth_getBalance",
        params: [account, "latest"],
      });
      const wei = BigInt(String(value));
      setEthBalance((Number(wei) / 1e18).toFixed(4));
    } catch {
      setEthBalance(null);
    }
  }

  async function connectInjectedWallet() {
    const provider = window.ethereum;
    setWalletError("");

    if (!provider) {
      setWalletError("No browser wallet was detected. Install MetaMask or Rabby, then try again.");
      return;
    }

    setConnecting(true);
    try {
      const result = await provider.request({ method: "eth_requestAccounts" });
      const account = Array.isArray(result) ? String(result[0] ?? "") : "";
      if (!account) throw new Error("No account returned");
      setAddress(account);
      await readBalance(account, provider);
      setWalletOpen(false);
    } catch {
      setWalletError("The connection request was cancelled or could not be completed.");
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    setAddress("");
    setEthBalance(null);
    setWalletMenuOpen(false);
  }

  const contextValue = useMemo(() => ({ theme, setTheme }), [theme]);
  const walletContextValue = useMemo(
    () => ({
      connected: Boolean(address),
      connecting,
      address,
      ethBalance,
      openWallet: () => {
        setWalletError("");
        setWalletOpen(true);
      },
      disconnect,
    }),
    [address, connecting, ethBalance],
  );

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <AppThemeContext.Provider value={contextValue}>
      <AppWalletContext.Provider value={walletContextValue}>
        <div className={`app-shell ${theme === "dark" ? "app-dark" : ""}`}>
        <aside className={menuOpen ? "app-sidebar app-sidebar-open" : "app-sidebar"}>
          <div className="app-sidebar-head">
            <Link className="app-brand" href="/" aria-label="Back to Dubu landing page">
              <img src="/assets/Logo.png" alt="Dubu" />
            </Link>
            <button
              className="app-sidebar-close"
              type="button"
              aria-label="Close navigation"
              onClick={() => setMenuOpen(false)}
            >
              ×
            </button>
          </div>

          <nav className="app-nav" aria-label="Dubu app navigation">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  className={active ? "app-nav-link active" : "app-nav-link"}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="app-nav-icon" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="app-sidebar-mascot" aria-hidden="true">
            <span>✦</span>
            <img src="/assets/character.png" alt="" />
          </div>
        </aside>

        {menuOpen && (
          <button
            className="app-sidebar-scrim"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <div className="app-workspace">
          <header className="app-topbar">
            <button
              className="app-mobile-menu"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <span />
              <span />
            </button>

            <Link className="app-mobile-brand" href="/">
              <img src="/assets/Logo.png" alt="Dubu" />
            </Link>

            <div className="app-topbar-actions">
              <div className="app-network-wrap">
                <button
                  className="app-control app-network-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={networkOpen}
                  onClick={() => setNetworkOpen((current) => !current)}
                >
                  <TokenIcon symbol={network === "Ethereum" ? "ETH" : network === "Arbitrum" ? "ARB" : "OP"} />
                  <span>{network}</span>
                  <b>⌄</b>
                </button>
                {networkOpen && (
                  <div className="app-network-menu" role="listbox" aria-label="Select network">
                    {["Ethereum", "Arbitrum", "Optimism"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={option === network}
                        onClick={() => {
                          setNetwork(option);
                          setNetworkOpen(false);
                        }}
                      >
                        <TokenIcon symbol={option === "Ethereum" ? "ETH" : option === "Arbitrum" ? "ARB" : "OP"} />
                        <span>{option}</span>
                        {option === network && <b>✓</b>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="app-control app-theme-button"
                type="button"
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? "☼" : "☾"}
              </button>

              <div className="app-wallet-wrap">
                <button
                  className={`app-control app-wallet-button ${address ? "" : "disconnected"}`}
                  type="button"
                  onClick={() => address ? setWalletMenuOpen((current) => !current) : setWalletOpen(true)}
                >
                  {address ? <span className="app-wallet-orb" /> : <span className="wallet-button-dot" />}
                  <span>{address ? shortAddress : "Connect wallet"}</span>
                </button>
                {address && walletMenuOpen && (
                  <div className="wallet-account-menu">
                    <div>
                      <span className="app-wallet-orb" />
                      <p><strong>{shortAddress}</strong><small>{ethBalance ? `${ethBalance} ETH` : "Balance unavailable"}</small></p>
                    </div>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(address)}>Copy address</button>
                    <button type="button" onClick={disconnect}>Disconnect</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="app-content">{children}</main>
        </div>
        {walletOpen && (
          <div className="app-modal-backdrop" role="presentation">
            <div className="app-modal wallet-connect-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
              <button className="app-modal-close" type="button" aria-label="Close wallet dialog" onClick={() => setWalletOpen(false)}>×</button>
              <div className="wallet-modal-mark"><img src="/assets/character.png" alt="" /></div>
              <h2 id="wallet-title">Connect a wallet</h2>
              <p>Choose a browser wallet to continue. Dubu never takes custody of your assets.</p>
              <button className="wallet-provider-button" type="button" onClick={connectInjectedWallet} disabled={connecting}>
                <span className="wallet-provider-icon">◆</span>
                <span><strong>{connecting ? "Waiting for wallet…" : "Browser wallet"}</strong><small>MetaMask, Rabby, Coinbase Wallet</small></span>
                <b>›</b>
              </button>
              {walletError && <p className="wallet-error" role="alert">{walletError}</p>}
              <div className="wallet-terms">By connecting, you agree to Dubu&apos;s terms and acknowledge the risks of onchain trading.</div>
            </div>
          </div>
        )}
        </div>
      </AppWalletContext.Provider>
    </AppThemeContext.Provider>
  );
}

export function TokenIcon({ symbol }: { symbol: string }) {
  const imageMap: Record<string, string> = {
    ETH: "/assets/asset_04.png",
    USDC: "/assets/asset_05.png",
    ARB: "/assets/asset_06.png",
  };

  if (imageMap[symbol]) {
    return <img className="token-icon" src={imageMap[symbol]} alt="" />;
  }

  const compact = symbol.slice(0, 2).toUpperCase();
  return (
    <span className={`token-icon token-icon-css token-${symbol.toLowerCase()}`} aria-hidden="true">
      {compact}
    </span>
  );
}

export function ProtocolIcon({ name }: { name: string }) {
  const compact = name === "Uniswap V3" ? "U" : name.slice(0, 1);
  return (
    <span className={`protocol-icon protocol-${name.toLowerCase().replaceAll(" ", "-")}`} aria-hidden="true">
      {compact}
    </span>
  );
}

export function AppPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="app-page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`app-panel ${className}`}>{children}</section>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="app-section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={checked ? "app-toggle checked" : "app-toggle"}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-toast" role="status">
      <span>✓</span>
      {children}
    </div>
  );
}
