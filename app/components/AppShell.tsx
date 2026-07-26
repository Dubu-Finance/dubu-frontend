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

type AppThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const AppThemeContext = createContext<AppThemeContextValue>({
  theme: "light",
  setTheme: () => undefined,
});

export function useAppTheme() {
  return useContext(AppThemeContext);
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

  useEffect(() => {
    const saved = window.localStorage.getItem("dubu-app-theme");
    if (saved === "dark") setThemeState("dark");
  }, []);

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
    window.localStorage.setItem("dubu-app-theme", nextTheme);
  }

  const contextValue = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <AppThemeContext.Provider value={contextValue}>
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

              <button className="app-control app-wallet-button" type="button">
                <span className="app-wallet-orb" />
                <span>0x4a7b...3F2c</span>
              </button>
            </div>
          </header>

          <main className="app-content">{children}</main>
        </div>
      </div>
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
