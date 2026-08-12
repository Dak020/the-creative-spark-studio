/**
 * Deterministic video engine. No AI here — only trim, crop, resize, overlay,
 * encode. The renderer is behind an interface so a real FFmpeg worker can be
 * plugged in later without touching callers.
 */

export type RenderPlan = {
  jobId: string;
  sourceUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  overlayText: string;
  overlayPosition: "top" | "center" | "bottom";
  fontSize: number;
  backgroundColor: string;
  textColor: string;
};

export type RenderResult = {
  status: "completed" | "failed" | "deferred";
  outputUrl?: string | null;
  command: string;
  error?: string;
};

/** Wrap text so the overlay never leaves the horizontal safe area. */
export function wrapOverlayText(text: string, width: number, fontSize: number): string[] {
  const safeWidth = width * 0.86;
  const avgCharWidth = fontSize * 0.52;
  const maxChars = Math.max(12, Math.floor(safeWidth / avgCharWidth));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function escapeDrawText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
}

/**
 * Build the exact, reproducible FFmpeg invocation for a plan:
 * scale + center-crop to 1080x1920, trim to duration, boxed text overlay
 * inside the platform safe areas, H.264 + AAC MP4 output.
 */
export function buildFfmpegCommand(plan: RenderPlan, outputPath = "output.mp4"): string {
  const lines = wrapOverlayText(plan.overlayText, plan.width, plan.fontSize);
  const topSafe = Math.round(plan.height * 0.14);
  const bottomSafe = Math.round(plan.height * 0.78);
  const blockHeight = lines.length * Math.round(plan.fontSize * 1.35);

  const y =
    plan.overlayPosition === "top"
      ? topSafe
      : plan.overlayPosition === "center"
        ? Math.round((plan.height - blockHeight) / 2)
        : bottomSafe - blockHeight;

  const drawTexts = lines.map((line, i) => {
    const lineY = y + i * Math.round(plan.fontSize * 1.35);
    return [
      `drawtext=text='${escapeDrawText(line)}'`,
      `fontsize=${plan.fontSize}`,
      `fontcolor=${plan.textColor}`,
      `box=1`,
      `boxcolor=${plan.backgroundColor}@1.0`,
      `boxborderw=${Math.round(plan.fontSize * 0.32)}`,
      `x=(w-text_w)/2`,
      `y=${lineY}`,
      `line_spacing=8`,
    ].join(":");
  });

  const filters = [
    `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=increase`,
    `crop=${plan.width}:${plan.height}`,
    `fps=30`,
    ...drawTexts,
  ].join(",");

  return [
    "ffmpeg -y",
    `-t ${plan.durationSeconds}`,
    `-i "${plan.sourceUrl}"`,
    `-vf "${filters}"`,
    `-t ${plan.durationSeconds}`,
    "-c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p",
    "-c:a aac -b:a 128k -movflags +faststart",
    `"${outputPath}"`,
  ].join(" ");
}

export interface VideoRenderer {
  readonly id: string;
  isAvailable(): boolean;
  render(plan: RenderPlan): Promise<RenderResult>;
}

/**
 * Real FFmpeg CLI renderer. Requires a Node/container worker with an ffmpeg
 * binary; not available inside the edge runtime the app currently deploys to.
 */
export class FfmpegCliRenderer implements VideoRenderer {
  readonly id = "ffmpeg-cli";
  isAvailable() {
    return process.env["FFMPEG_WORKER_URL"] != null;
  }
  async render(plan: RenderPlan): Promise<RenderResult> {
    const endpoint = process.env["FFMPEG_WORKER_URL"];
    const command = buildFfmpegCommand(plan, `${plan.jobId}.mp4`);
    if (!endpoint) return { status: "failed", command, error: "No FFmpeg worker configured." };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, command }),
    });
    if (!res.ok) return { status: "failed", command, error: `Render worker error ${res.status}` };
    const json = (await res.json()) as { outputUrl?: string };
    return { status: "completed", outputUrl: json.outputUrl ?? null, command };
  }
}

/**
 * Fallback renderer for when no FFmpeg worker is configured.
 *
 * It validates the plan and emits the exact reproducible FFmpeg command, but it
 * cannot composite the hook overlay, so it NEVER reports success — a render
 * without a burned-in hook must not be recorded as completed. Actual output is
 * produced by the browser render pipeline (`src/lib/render/pipeline.ts`).
 */
export class PlanOnlyRenderer implements VideoRenderer {
  readonly id = "plan-only";
  isAvailable() {
    return true;
  }
  async render(plan: RenderPlan): Promise<RenderResult> {
    const command = buildFfmpegCommand(plan, `${plan.jobId}.mp4`);
    if (!plan.sourceUrl) return { status: "failed", command, error: "Media asset has no source file." };
    if (plan.durationSeconds <= 0) return { status: "failed", command, error: "Invalid duration." };
    return {
      status: "failed",
      command,
      error: "No overlay-capable render worker is configured — render this variant from the Studio.",
    };
  }
}


export function getRenderer(): VideoRenderer {
  const ffmpeg = new FfmpegCliRenderer();
  return ffmpeg.isAvailable() ? ffmpeg : new PreviewRenderer();
}
