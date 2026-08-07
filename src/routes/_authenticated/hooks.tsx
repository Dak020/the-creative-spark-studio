import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { HookLibraryPanel } from "@/components/HookLibraryPanel";

export const Route = createFileRoute("/_authenticated/hooks")({
  head: () => ({
    meta: [
      { title: "Hook Library — Creative Factory" },
      { name: "description", content: "Your proven opening hooks, winners and AI-generated variants." },
      { property: "og:title", content: "Hook Library — Creative Factory" },
      { property: "og:description", content: "Structure, emotional triggers and performance per hook." },
    ],
  }),
  component: HooksPage,
});

function HooksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Hook Library"
        description="Winners feed the AI. It learns their structure and writes original variants."
      />
      <HookLibraryPanel />
    </div>
  );
}
