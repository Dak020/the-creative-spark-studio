/**
 * Browser-side deterministic renderer.
 *
 * Draws the source clip into a 1080x1920 canvas (cover crop), burns the hook
 * text into white boxes with heavy black type inside the TikTok/Reels safe
 * area, and records exactly `durationSeconds` of output via MediaRecorder.
 *
 * The overlay is composited into every recorded frame, so the hook is
 * physically present in the exported file — not drawn by the UI player.
 */

export type BrowserRenderOptions = {
  sourceUrl: string;
  startSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  text: string;
  fontSize?: number;
  onProgress?: (pct: number) => void;
};

export type BrowserRenderResult = {
  blob: Blob;
  extension: string;
  mimeType: string;
  thumbnail: Blob | null;
};

function pickMimeType(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

function fontFor(size: number) {
  return `800 ${size}px "Inter", system-ui, -apple-system, "Segoe UI", Helvetica, sans-serif`;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Shrink the type until the wrapped hook fits both the horizontal safe width
 * and the vertical overlay band. Long hooks stay fully visible and never get
 * cropped or silently truncated.
 */
function layoutOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  requestedSize: number,
) {
  const maxTextWidth = Math.round(width * 0.78);
  const maxBandHeight = Math.round(height * 0.46);
  const minSize = 26;
  let size = Math.max(minSize, Math.min(requestedSize, Math.round(width * 0.09)));
  let lines: string[] = [];

  for (;;) {
    ctx.font = fontFor(size);
    lines = wrapLines(ctx, text, maxTextWidth);
    const boxH = size + Math.round(size * 0.3) * 2;
    const total = lines.length * boxH + (lines.length - 1) * Math.round(size * 0.14);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if ((total <= maxBandHeight && widest <= maxTextWidth) || size <= minSize) break;
    size -= 2;
  }

  const boxPadX = Math.round(size * 0.34);
  const boxPadY = Math.round(size * 0.3);
  const lineGap = Math.round(size * 0.14);
  const boxH = size + boxPadY * 2;
  const blockH = lines.length * boxH + (lines.length - 1) * lineGap;
  // Keep the whole block between the top UI safe area and the caption area.
  const topSafe = Math.round(height * 0.14);
  const bottomSafe = Math.round(height * 0.72);
  const blockTop = Math.min(Math.round(height * 0.17), Math.max(topSafe, bottomSafe - blockH));

  return { size, lines, boxPadX, boxH, lineGap, blockTop, radius: Math.round(size * 0.1) };
}

function waitFor(el: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(`Video failed to ${event}.`));
    };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener("error", fail);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}

export async function renderVariant(opts: BrowserRenderOptions): Promise<BrowserRenderResult> {
  const { sourceUrl, durationSeconds, width, height, text } = opts;

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;

  await waitFor(video, "loadedmetadata");

  const sourceDuration = Number.isFinite(video.duration) ? video.duration : durationSeconds;
  const maxStart = Math.max(0, sourceDuration - durationSeconds);
  const start = Math.min(Math.max(0, opts.startSeconds), maxStart);

  video.currentTime = start;
  await waitFor(video, "seeked");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  const overlay = layoutOverlay(ctx, text.trim() || "…", width, height, opts.fontSize ?? 64);
  const font = fontFor(overlay.size);

  const mimeType = pickMimeType();
  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx!.beginPath();
    ctx!.moveTo(x + r, y);
    ctx!.arcTo(x + w, y, x + w, y + h, r);
    ctx!.arcTo(x + w, y + h, x, y + h, r);
    ctx!.arcTo(x, y + h, x, y, r);
    ctx!.arcTo(x, y, x + w, y, r);
    ctx!.closePath();
    ctx!.fill();
  }

  function drawFrame() {
    ctx!.fillStyle = "#000000";
    ctx!.fillRect(0, 0, width, height);

    const vw = video.videoWidth || width;
    const vh = video.videoHeight || height;
    const scale = Math.max(width / vw, height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx!.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);

    // Burn the hook in on every single frame.
    ctx!.font = font;
    ctx!.textBaseline = "middle";
    ctx!.textAlign = "center";
    overlay.lines.forEach((line, i) => {
      const metrics = ctx!.measureText(line);
      const boxW = Math.min(
        Math.round(metrics.width + overlay.boxPadX * 2),
        Math.round(width * 0.92),
      );
      const y = overlay.blockTop + i * (overlay.boxH + overlay.lineGap);
      ctx!.fillStyle = "#FFFFFF";
      roundRect(Math.round((width - boxW) / 2), y, boxW, overlay.boxH, overlay.radius);
      ctx!.fillStyle = "#000000";
      ctx!.fillText(line, width / 2, y + overlay.boxH / 2 + 1);
    });
  }

  drawFrame();
  recorder.start(200);
  await video.play();

  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      // When the source runs out we keep drawing its final frame so the export
      // is always exactly `durationSeconds` long.
      if (video.ended || video.currentTime >= start + durationSeconds - 0.03) {
        if (!video.paused) video.pause();
      }
      drawFrame();
      const elapsed = (performance.now() - startedAt) / 1000;
      opts.onProgress?.(Math.min(99, Math.round((elapsed / durationSeconds) * 100)));
      if (elapsed >= durationSeconds) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Poster frame (with the overlay already composited) for the result card.
  const thumbnail = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8);
    } catch {
      resolve(null);
    }
  });

  video.pause();
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  video.src = "";

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) throw new Error("Recorder produced an empty file.");
  return { blob, extension, mimeType, thumbnail };
}

/** Evenly spread N start offsets across a source clip, skipping the first beat. */
export function planStartOffsets(sourceDuration: number, count: number, clipLength: number) {
  const usable = Math.max(0, (sourceDuration || clipLength) - clipLength);
  if (usable <= 0.1) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, i) => Number(((usable * i) / Math.max(1, count - 1)).toFixed(2)));
}
