import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VIDEO_DEFAULTS } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Creative Factory" },
      { name: "description", content: "Account, render defaults and AI provider configuration." },
      { property: "og:title", content: "Settings — Creative Factory" },
      { property: "og:description", content: "Manage your Creative Factory workspace." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: counts } = useQuery({
    queryKey: ["settings-counts"],
    queryFn: async () => {
      const [projects, media, hooks, videos] = await Promise.all([
        supabase.from("projects").select("id"),
        supabase.from("media_assets").select("id"),
        supabase.from("hooks").select("id"),
        supabase.from("generated_videos").select("id"),
      ]);
      return {
        projects: projects.data?.length ?? 0,
        media: media.data?.length ?? 0,
        hooks: hooks.data?.length ?? 0,
        videos: videos.data?.length ?? 0,
      };
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Account and production defaults." />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel space-y-4 p-6">
          <h2 className="text-sm font-semibold">Account</h2>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Signed in as</Label>
            <p className="text-sm">{user?.email ?? "—"}</p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sign out
          </Button>
        </section>

        <section className="panel space-y-4 p-6">
          <h2 className="text-sm font-semibold">Workspace</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Projects", counts?.projects ?? 0],
              ["Media clips", counts?.media ?? 0],
              ["Hooks", counts?.hooks ?? 0],
              ["Videos", counts?.videos ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel space-y-3 p-6">
          <h2 className="text-sm font-semibold">Render defaults</h2>
          <dl className="space-y-2 text-sm">
            {[
              ["Duration", `${VIDEO_DEFAULTS.duration}s`],
              ["Aspect ratio", VIDEO_DEFAULTS.aspect],
              ["Resolution", `${VIDEO_DEFAULTS.width}×${VIDEO_DEFAULTS.height}`],
              ["Container", VIDEO_DEFAULTS.container.toUpperCase()],
              ["Overlay", "Black text on white box, top safe area"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel space-y-3 p-6">
          <h2 className="text-sm font-semibold">AI provider</h2>
          <p className="text-sm text-muted-foreground">
            Hook generation runs server-side through a provider abstraction, so OpenAI or Anthropic can be
            swapped in later without touching the app. No API keys are ever exposed to the browser.
          </p>
        </section>
      </div>
    </div>
  );
}
