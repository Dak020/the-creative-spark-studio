export const HOOK_CATEGORIES = [
  "POV",
  "Curiosity",
  "Story",
  "Problem/Solution",
  "Social Proof",
  "Confession",
  "Discovery",
  "Comparison",
] as const;
export type HookCategory = (typeof HOOK_CATEGORIES)[number];

export const MEDIA_CATEGORIES = [
  "Product",
  "UGC",
  "Lifestyle",
  "Close-up",
  "Unboxing",
  "Reaction",
  "Other",
] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const CONTENT_STYLES = [
  { value: "ugc", label: "UGC" },
  { value: "pov", label: "POV" },
  { value: "product", label: "Product-focused" },
  { value: "storytelling", label: "Storytelling" },
  { value: "problem_solution", label: "Problem / Solution" },
  { value: "testimonial", label: "Testimonial" },
] as const;

export const PLATFORMS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram Reels" },
  { value: "both", label: "Both" },
] as const;

export const GENDERS = [
  { value: "all", label: "All" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
] as const;

export const AGE_RANGES = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"] as const;

export const RENDER_STATUSES = ["queued", "processing", "completed", "failed"] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];

/** Deterministic video defaults. The video engine never uses AI. */
export const VIDEO_DEFAULTS = {
  duration: 8,
  width: 1080,
  height: 1920,
  aspect: "9:16",
  container: "mp4",
  overlayPosition: "top" as const,
  fontSize: 64,
  backgroundColor: "#FFFFFF",
  textColor: "#000000",
};

export const OVERLAY_POSITIONS = [
  { value: "top", label: "Top (safe area)" },
  { value: "center", label: "Center" },
  { value: "bottom", label: "Bottom (safe area)" },
] as const;

/** Where the hook is burned into a clip. Set per clip in the Media Library. */
export const HOOK_PLACEMENTS = [
  { value: "top", label: "Top", hint: "Below the platform top bar" },
  { value: "middle", label: "Middle", hint: "Centered, clear of the icon rail" },
  { value: "bottom", label: "Bottom", hint: "Above the caption area" },
] as const;
export type HookPlacementValue = (typeof HOOK_PLACEMENTS)[number]["value"];

export function hookPlacementLabel(value: string | null | undefined) {
  return HOOK_PLACEMENTS.find((p) => p.value === value)?.label ?? "Top";
}


export function styleLabel(value: string) {
  return CONTENT_STYLES.find((s) => s.value === value)?.label ?? value;
}
export function platformLabel(value: string) {
  return PLATFORMS.find((s) => s.value === value)?.label ?? value;
}
