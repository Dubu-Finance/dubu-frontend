import AppShell from "@/app/components/AppShell";
import "@/app/app-shell.css";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
