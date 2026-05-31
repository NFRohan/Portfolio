import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Bot, ClipboardList, LayoutDashboard, LogOut, RadioTower, Store } from "lucide-react";

const navItems = [
  { href: "/supervisor", label: "Overview", icon: LayoutDashboard },
  { href: "/supervisor/visits", label: "Visit Logs", icon: ClipboardList },
  { href: "/supervisor/outlets", label: "Outlet Verification", icon: Store },
  { href: "/supervisor/insights", label: "AI Insights", icon: Bot },
  { href: "/supervisor/ops", label: "Ops Control", icon: RadioTower },
];

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-surface min-h-screen text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[#d7ddeb] bg-[#edf2ff] p-4 lg:flex lg:flex-col">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
              R
            </div>
            <div>
              <p className="font-bold leading-none text-navy">RetailOS Lite</p>
              <p className="mt-1 text-xs text-muted-foreground">Field Execution</p>
            </div>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-navy/70 transition-colors hover:bg-[#d9f7ff] hover:text-navy"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-[#d7ddeb] bg-white/70 p-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal">Signed in</p>
            <p className="mt-1 text-sm font-semibold text-navy">Supervisor</p>
            <SupervisorLogoutButton className="mt-3 w-full justify-center text-navy/70 hover:text-navy" />
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-[#d7ddeb] bg-white/85 px-6 backdrop-blur">
            <div>
              <span className="font-bold text-navy lg:hidden">RetailOS Lite</span>
              <div className="hidden lg:block">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Supervisor Workspace</p>
                <p className="text-sm text-muted-foreground">Review field execution and AI compliance results</p>
              </div>
            </div>
            <SupervisorLogoutButton compact />
          </header>
          <main className="flex-1 p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function SupervisorLogoutButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <Button
        variant={compact ? "outline" : "ghost"}
        size={compact ? "sm" : "sm"}
        type="submit"
        className={compact ? "rounded-full bg-white text-navy hover:bg-[#eef2fb]" : className}
      >
        <LogOut className="h-4 w-4" />
        <span className={compact ? "hidden sm:inline" : ""}>Sign out</span>
      </Button>
    </form>
  );
}
