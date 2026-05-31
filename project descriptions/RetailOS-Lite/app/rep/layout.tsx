import Link from "next/link";
import { signOut } from "@/lib/auth";
import { OfflineSyncStatus } from "@/components/offline-sync-status";
import { OfflineVisitSyncProvider } from "@/components/offline-visit-sync-provider";
import { Button } from "@/components/ui/button";
import { ClipboardList, LogOut, Plus } from "lucide-react";

export default function RepLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-rep-bg">
      <OfflineVisitSyncProvider />
      <header className="sticky top-0 z-40 border-b border-[#d6ddea] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-4">
          <Link href="/rep/visits" className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight text-navy">RetailOS Rep</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-teal">Field Mode</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button size="sm" className="rounded-full" asChild>
              <Link href="/rep/visits/new">
                <Plus className="h-4 w-4" />
                New visit
              </Link>
            </Button>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button size="icon" variant="ghost" type="submit">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-6">
        <OfflineSyncStatus />
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d6ddea] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(2,43,58,0.08)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-3 items-center gap-3">
          <Link
            href="/rep/visits"
            className="flex flex-col items-center rounded-2xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-[#eef2fb] hover:text-navy"
          >
            <ClipboardList className="mb-1 h-5 w-5" />
            Visits
          </Link>
          <Link
            href="/rep/visits/new"
            className="flex flex-col items-center rounded-2xl bg-teal px-3 py-2 text-xs font-semibold text-white shadow-sm"
          >
            <Plus className="mb-1 h-5 w-5" />
            New
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="flex w-full flex-col items-center rounded-2xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-[#eef2fb] hover:text-navy"
            >
              <LogOut className="mb-1 h-5 w-5" />
              Logout
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}
