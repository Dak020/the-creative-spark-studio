import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

export const Route = createFileRoute("/auth")({
  // The OAuth provider returns here with tokens in the URL; rendering this
  // screen on the server would hydrate against a different (pre-session) tree.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Creative Factory" },
      { name: "description", content: "Sign in to your Creative Factory production dashboard." },
      { property: "og:title", content: "Sign in — Creative Factory" },
      { property: "og:description", content: "Access your hooks, media library and render queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});
