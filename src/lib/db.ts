import { supabase } from "@/integrations/supabase/client";

export type Tables = {
  projects: {
    id: string;
    user_id: string;
    name: string;
    platform: string;
    content_style: string;
    videos_to_generate: number;
    target_gender: string | null;
    target_age: string | null;
    target_location: string | null;
    target_interests: string[];
    status: string;
    created_at: string;
  };
};

export async function signedUrl(bucket: string, path: string | null | undefined, expires = 3600) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}

export function audienceSummary(p: {
  target_gender?: string | null;
  target_age?: string | null;
  target_location?: string | null;
  target_interests?: string[] | null;
}) {
  const parts = [
    p.target_gender && p.target_gender !== "all" ? p.target_gender : null,
    p.target_age ? `${p.target_age}` : null,
    p.target_location || null,
    p.target_interests?.length ? p.target_interests.join(", ") : null,
  ].filter(Boolean);
  return parts.join(" · ") || "No audience set";
}

export function fmtNumber(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}

export function fmtDuration(seconds: number | null | undefined) {
  const s = Math.round(Number(seconds ?? 0));
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatBytes(bytes: number | null | undefined) {
  const b = Number(bytes ?? 0);
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const value = b / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
