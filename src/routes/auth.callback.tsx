import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

// Some OAuth configurations return to /auth/callback; render the same sign-in
// screen there so the session hydrates instead of hitting the 404 page.
export const Route = createFileRoute("/auth/callback")({
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
