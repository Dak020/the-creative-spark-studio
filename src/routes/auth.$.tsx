import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

// Catch-all under /auth (e.g. /auth/callback) so an OAuth provider redirecting
// to a sub-path completes sign-in instead of hitting the 404 page.
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
    ],
  }),
  component: AuthPage,
});
