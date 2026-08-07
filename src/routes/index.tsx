import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Clapperboard, Layers, Sparkles, Wand2, Gauge, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Creative Factory — Batch short-form video production" },
      {
        name: "description",
        content:
          "Generate hooks with AI, combine them with your clips, and batch-render vertical TikTok and Reels ads from one dashboard.",
      },
      { property: "og:title", content: "Creative Factory — Batch short-form video production" },
      {
        property: "og:description",
        content:
          "AI-assisted hook generation plus a deterministic video engine for 9:16 TikTok and Instagram Reels output.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Wand2,
    title: "AI hook engine",
    body: "Analyzes the structure of your winning hooks and writes original variants — never copies.",
  },
  {
    icon: Layers,
    title: "Batch combinations",
    body: "10 hooks × 3 clips = 30 recipes queued in one click, with per-job status and progress.",
  },
  {
    icon: Clapperboard,
    title: "Deterministic renders",
    body: "FFmpeg trim, crop to 1080×1920, safe-area text overlay and H.264 encode. No AI video models.",
  },
  {
    icon: Gauge,
    title: "Performance loop",
    body: "Log views, retention and conversions, then promote what works into your winner library.",
  },
];

function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="glow-top pointer-events-none absolute inset-x-0 top-0 h-[520px]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Clapperboard className="size-4 text-primary-foreground" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">Creative Factory</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Hook intelligence + deterministic video engine
        </div>
        <h1 className="mt-6 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          <span className="text-gradient">Ship thirty ad variants</span>
          <br />
          before your coffee cools.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          Creative Factory is a production line for TikTok and Instagram Reels. Build a hook library, let AI
          write structural variants, pair them with your footage, and batch-render 9:16 videos with clean
          text overlays.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              <FolderKanban className="size-4" />
              Open the dashboard
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Create an account</Link>
          </Button>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="panel p-5">
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-sm font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative border-t border-border py-8 text-center text-xs text-muted-foreground">
        Creative Factory — batch short-form video production
      </footer>
    </main>
  );
}
