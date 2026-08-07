import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="hidden lg:block">
        <AppSidebar />
      </div>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
