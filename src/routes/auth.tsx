import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  // Auth screens depend on browser-only session state; skip SSR for the whole
  // subtree so server and client markup can never disagree.
  ssr: false,
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
