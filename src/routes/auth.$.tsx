import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

// Any OAuth callback sub-path (/auth/callback, /auth/v1/callback, ...) renders
// the sign-in screen so mobile providers never land on a 404.
export const Route = createFileRoute("/auth/$")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing in — Creative Factory" },
      { name: "description", content: "Completing your Creative Factory sign-in." },
      { property: "og:title", content: "Signing in — Creative Factory" },
      { property: "og:description", content: "Completing your Creative Factory sign-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});
