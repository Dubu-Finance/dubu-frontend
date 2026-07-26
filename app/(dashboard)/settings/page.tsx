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
} from "@/app/components/AppShell";

type ToggleKey =
  | "autoConnect"
  | "hideSmall"
  | "transactions"
  | "priceAlerts"
  | "productUpdates"
  | "twoFactor";

export default function SettingsPage() {
  const { theme, setTheme } = useAppTheme();
  const [accent, setAccent] = useState("gold");
  const [saved, setSaved] = useState(false);
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    autoConnect: true,
    hideSmall: false,
    transactions: true,
    priceAlerts: true,
    productUpdates: false,
    twoFactor: false,
  });

  function updateToggle(key: ToggleKey, value: boolean) {
    setToggles((current) => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  }

  return (
    <>
      <div className="settings-header-row">
        <AppPageHeader title="Settings" description="Configure your Dubu experience." />
        <Panel className="wallet-summary">
          <span className="app-wallet-orb large" />
          <div><strong>0x4a7b...3F2c</strong><span>Connected</span></div>
          <dl>
            <div><dt>Balance</dt><dd>2.5687 ETH <small>$6,623.18</small></dd></div>
            <div><dt>Network</dt><dd><TokenIcon symbol="ETH" /> Ethereum</dd></div>
          </dl>
        </Panel>
      </div>

      <div className="settings-grid">
        <div className="settings-column">
          <Panel className="settings-panel">
            <SectionTitle><span className="settings-title-icon">☷</span> Trading Settings</SectionTitle>
            <SettingRow icon="◌" label="Slippage Tolerance" description="Set the maximum slippage for swaps.">
              <label className="settings-input"><input aria-label="Slippage tolerance" defaultValue="0.50" /><span>%</span><b>⌄</b></label>
            </SettingRow>
            <SettingRow icon="◷" label="Transaction Deadline" description="Your transaction will revert after this time.">
              <label className="settings-input"><input aria-label="Transaction deadline" defaultValue="20" /><span>min</span><b>⌄</b></label>
            </SettingRow>
            <SettingRow icon="⌖" label="Default Network" description="Choose your preferred network for trading.">
              <button className="settings-select" type="button"><TokenIcon symbol="ETH" /> Ethereum <b>⌄</b></button>
            </SettingRow>
          </Panel>

          <Panel className="settings-panel">
            <SectionTitle><span className="settings-title-icon">▣</span> Wallet Preferences</SectionTitle>
            <SettingRow icon="⇄" label="Auto-connect Wallet" description="Automatically connect your wallet on app load.">
              <Toggle checked={toggles.autoConnect} onChange={(value) => updateToggle("autoConnect", value)} label="Auto-connect wallet" />
            </SettingRow>
            <SettingRow icon="$" label="Fiat Display" description="Show fiat values for balances and prices.">
              <button className="settings-select short" type="button">USD <b>⌄</b></button>
            </SettingRow>
            <SettingRow icon="◩" label="Hide Small Balances" description="Hide tokens with a low fiat value.">
              <Toggle checked={toggles.hideSmall} onChange={(value) => updateToggle("hideSmall", value)} label="Hide small balances" />
            </SettingRow>
          </Panel>
        </div>

        <div className="settings-column">
          <Panel className="settings-panel appearance-panel">
            <SectionTitle><span className="settings-title-icon">◉</span> Appearance</SectionTitle>
            <div className="appearance-row">
              <strong>Theme</strong>
              <div className="theme-options">
                <button className={theme === "light" ? "active" : ""} type="button" onClick={() => setTheme("light")}>☼ Light</button>
                <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => setTheme("dark")}>☾ Dark</button>
                <button type="button" onClick={() => setTheme("light")}>▣ System</button>
              </div>
            </div>
            <div className="appearance-row">
              <strong>Accent Color</strong>
              <div className="accent-options">
                {["gold", "mint", "blue", "purple", "pink", "orange"].map((color) => (
                  <button key={color} className={`${color} ${accent === color ? "active" : ""}`} type="button" aria-label={`Use ${color} accent`} onClick={() => setAccent(color)}>{accent === color ? "✓" : ""}</button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="settings-panel compact-settings">
            <SectionTitle><span className="settings-title-icon">♧</span> Notifications</SectionTitle>
            <SettingRow label="Transaction Updates" description="Get notified about transaction status.">
              <Toggle checked={toggles.transactions} onChange={(value) => updateToggle("transactions", value)} label="Transaction updates" />
            </SettingRow>
            <SettingRow label="Price Alerts" description="Receive alerts for price movements.">
              <Toggle checked={toggles.priceAlerts} onChange={(value) => updateToggle("priceAlerts", value)} label="Price alerts" />
            </SettingRow>
            <SettingRow label="Product Updates" description="News and updates about Dubu.">
              <Toggle checked={toggles.productUpdates} onChange={(value) => updateToggle("productUpdates", value)} label="Product updates" />
            </SettingRow>
          </Panel>

          <Panel className="settings-panel compact-settings">
            <SectionTitle><span className="settings-title-icon">♢</span> Security</SectionTitle>
            <SettingRow label="Two-Factor Authentication" description="Add an extra layer of security to your account.">
              <Toggle checked={toggles.twoFactor} onChange={(value) => updateToggle("twoFactor", value)} label="Two-factor authentication" />
            </SettingRow>
            <SettingRow label="Session Timeout" description="Automatically disconnect after inactivity.">
              <button className="settings-select short" type="button">30 min <b>⌄</b></button>
            </SettingRow>
          </Panel>

          <button className="app-primary-button settings-save" type="button" onClick={saveSettings}>Save Changes</button>
        </div>
      </div>

      {saved && <Toast>Settings saved for this device.</Toast>}
    </>
  );
}

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon?: string;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      {icon && <span className="setting-row-icon" aria-hidden="true">{icon}</span>}
      <div><strong>{label}</strong><p>{description}</p></div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}
