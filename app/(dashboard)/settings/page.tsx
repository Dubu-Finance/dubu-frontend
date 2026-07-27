"use client";

import { useState } from "react";
import {
  AppPageHeader,
  Panel,
  SectionTitle,
  Toast,
  Toggle,
  TokenIcon,
  useAppTheme,
  useAppWallet,
} from "@/app/components/AppShell";

type ToggleKey = "autoSlippage" | "privateTx" | "multihop" | "hideSmall";

export default function SettingsPage() {
  const { theme, setTheme } = useAppTheme();
  const { connected, address, ethBalance, openWallet, disconnect } = useAppWallet();
  const [slippage, setSlippage] = useState("0.50");
  const [deadline, setDeadline] = useState("20");
  const [saved, setSaved] = useState(false);
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    autoSlippage: true,
    privateTx: false,
    multihop: true,
    hideSmall: false,
  });

  function updateToggle(key: ToggleKey, value: boolean) {
    setToggles((current) => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    window.localStorage.setItem("dubu-trade-settings", JSON.stringify({ slippage, deadline, toggles }));
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
                <div><dt>Network</dt><dd><TokenIcon symbol="ETH" /> Ethereum</dd></div>
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
            <SettingRow label="Automatic slippage" description="Adjust tolerance based on token liquidity and trade size.">
              <Toggle checked={toggles.autoSlippage} onChange={(value) => updateToggle("autoSlippage", value)} label="Automatic slippage" />
            </SettingRow>
            <SettingRow label="Max slippage" description="The transaction reverts if the price moves beyond this value.">
              <label className={`settings-input ${toggles.autoSlippage ? "disabled" : ""}`}>
                <input aria-label="Maximum slippage" value={slippage} disabled={toggles.autoSlippage} onChange={(event) => setSlippage(event.target.value.replace(/[^0-9.]/g, ""))} />
                <span>%</span>
              </label>
            </SettingRow>
            <SettingRow label="Transaction deadline" description="Pending swaps revert after this time.">
              <label className="settings-input">
                <input aria-label="Transaction deadline" value={deadline} onChange={(event) => setDeadline(event.target.value.replace(/\D/g, ""))} />
                <span>min</span>
              </label>
            </SettingRow>
          </Panel>

          <Panel className="settings-panel">
            <SectionTitle><span className="settings-title-icon">⌁</span> Execution</SectionTitle>
            <SettingRow label="Price protection" description="Reject the swap when execution moves outside your selected tolerance.">
              <Toggle checked={toggles.multihop} onChange={(value) => updateToggle("multihop", value)} label="Price protection" />
            </SettingRow>
            <SettingRow label="Private transactions" description="Submit supported swaps through a private RPC to reduce MEV exposure.">
              <Toggle checked={toggles.privateTx} onChange={(value) => updateToggle("privateTx", value)} label="Private transactions" />
            </SettingRow>
            <SettingRow label="Quote preference" description="Optimize quotes for received amount after network cost.">
              <button className="settings-select" type="button">Best net output <b>⌄</b></button>
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
            <SettingRow label="Fiat currency" description="Used for estimated token and network cost values.">
              <button className="settings-select short" type="button">USD <b>⌄</b></button>
            </SettingRow>
            <SettingRow label="Hide small balances" description="Hide token balances worth less than $1.">
              <Toggle checked={toggles.hideSmall} onChange={(value) => updateToggle("hideSmall", value)} label="Hide small balances" />
            </SettingRow>
          </Panel>

          <Panel className="settings-panel risk-settings-panel">
            <SectionTitle><span className="settings-title-icon">!</span> Token safety</SectionTitle>
            <p>Dubu shows warnings for unknown tokens, high price impact, and fee-on-transfer behavior. Token lists can still contain malicious assets.</p>
            <button className="settings-text-button" type="button">Manage token lists <span>›</span></button>
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
