import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Clapperboard,
  LayoutDashboard,
  FolderKanban,
  Film,
  Quote,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Studio", url: "/studio", icon: Clapperboard },
  { title: "Projects", url: "/projects", icon: FolderKanban },

  { title: "Media Library", url: "/media", icon: Film },
  { title: "Hook Library", url: "/hooks", icon: Quote },
  { title: "Performance", url: "/performance", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    // Drop every cached row before the session goes away so the next account
    // never sees the previous user's projects, media, hooks or renders.
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }


  return (
    <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <Clapperboard className="size-4 text-primary-foreground" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold">Creative Factory</p>
          <p className="text-[11px] text-muted-foreground">Short-form production</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              }`}
            >
              <item.icon className={active ? "size-4 text-primary" : "size-4"} />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-xs font-semibold uppercase">
            {user?.email?.[0] ?? "?"}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{user?.email ?? "—"}</p>
          <Button variant="ghost" size="icon" className="size-8" onClick={signOut} aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
