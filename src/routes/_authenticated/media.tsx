import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";

export const Route = createFileRoute("/_authenticated/media")({
  head: () => ({
    meta: [
      { title: "Media Library — Creative Factory" },
      { name: "description", content: "Upload, tag and organize the source clips behind your videos." },
      { property: "og:title", content: "Media Library — Creative Factory" },
      { property: "og:description", content: "MP4 and MOV source footage with categories and tags." },
    ],
  }),
  component: MediaPage,
});

function MediaPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Media Library"
        description="Source clips for your renders. MP4 and MOV, tagged and categorized."
      />
      <MediaLibraryPanel />
    </div>
  );
}
