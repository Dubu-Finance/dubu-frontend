"use client";

import { useEffect, useState } from "react";
import {
  AppPageHeader,
  Panel,
  SectionTitle,
  Toast,
  useAppTheme,
  useAppWallet,
} from "@/app/components/AppShell";

export default function SettingsPage() {
  const { theme, setTheme } = useAppTheme();
  const { connected, address, ethBalance, openWallet, disconnect } = useAppWallet();
  const [slippage, setSlippage] = useState("0.50");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("dubu-trade-settings") ?? "{}") as {
        slippage?: string;
      };
      if (stored.slippage) setSlippage(stored.slippage);
    } catch {
      // Keep the default when stored preferences are invalid.
    }
  }, []);

  function saveSettings() {
    window.localStorage.setItem("dubu-trade-settings", JSON.stringify({ slippage }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  }

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
    <>
      <div className="settings-header-row">
        <AppPageHeader title="Settings" description="Trade execution and interface preferences." />
        <Panel className={`wallet-summary ${connected ? "" : "disconnected"}`}>
          {connected ? (
            <>
              <span className="app-wallet-orb large" />
              <div><strong>{shortAddress}</strong><span>Connected</span></div>
              <dl>
                <div><dt>Balance</dt><dd>{ethBalance ?? "—"} ETH</dd></div>
                <div><dt>Network</dt><dd><span className="giwa-chain-mark small">G</span> GIWA Sepolia</dd></div>
              </dl>
              <button className="wallet-disconnect-button" type="button" onClick={disconnect}>Disconnect</button>
            </>
          ) : (
            <>
              <div className="wallet-summary-empty"><span>◇</span><div><strong>No wallet connected</strong><small>Connect to manage account-specific settings.</small></div></div>
              <button className="wallet-summary-connect" type="button" onClick={openWallet}>Connect wallet</button>
            </>
          )}
        </Panel>
      </div>

      <div className="settings-grid">
        <div className="settings-column">
          <Panel className="settings-panel">
            <SectionTitle><span className="settings-title-icon">⇄</span> Transaction settings</SectionTitle>
            <SettingRow label="Max slippage" description="The transaction reverts if the price moves beyond this value.">
              <label className="settings-input">
                <input aria-label="Maximum slippage" value={slippage} onChange={(event) => setSlippage(event.target.value.replace(/[^0-9.]/g, ""))} />
                <span>%</span>
              </label>
            </SettingRow>
          </Panel>

          <Panel className="settings-panel">
            <SectionTitle><span className="settings-title-icon">G</span> Network</SectionTitle>
            <SettingRow label="Network" description="Dubu swaps are available on GIWA Sepolia.">
              <span className="settings-static-value">GIWA Sepolia</span>
            </SettingRow>
            <SettingRow label="Chain ID" description="Use this value when adding the network to a wallet.">
              <span className="settings-static-value">91342</span>
            </SettingRow>
            <SettingRow label="Gas token" description="Network fees are paid in ETH.">
              <span className="settings-static-value">ETH</span>
            </SettingRow>
          </Panel>
        </div>

        <div className="settings-column">
          <Panel className="settings-panel appearance-panel">
            <SectionTitle><span className="settings-title-icon">◉</span> Interface</SectionTitle>
            <div className="appearance-row">
              <strong>Theme</strong>
              <div className="theme-options">
                <button className={theme === "light" ? "active" : ""} type="button" onClick={() => setTheme("light")}>☼ Light</button>
                <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => setTheme("dark")}>☾ Dark</button>
              </div>
            </div>
          </Panel>

          <button className="app-primary-button settings-save" type="button" onClick={saveSettings}>Save preferences</button>
        </div>
      </div>

      {saved && <Toast>Preferences saved on this device.</Toast>}
    </>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row setting-row-simple">
      <div><strong>{label}</strong><p>{description}</p></div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}
