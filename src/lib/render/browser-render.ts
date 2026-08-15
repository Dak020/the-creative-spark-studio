/**
 * Browser-side deterministic renderer.
 *
 * Draws the source clip into a 1080x1920 canvas (cover crop), burns the hook
 * text in as heavy white type with a strong black outline — TikTok caption
 * style, no background box — inside the placement zone chosen for the clip,
 * and records exactly `durationSeconds` of output via MediaRecorder.
 *
 * The overlay is composited into every recorded frame, so the hook is
 * physically present in the exported file — not drawn by the UI player.
 */

export type HookPlacement = "top" | "middle" | "bottom";

export type BrowserRenderOptions = {
  sourceUrl: string;
  startSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  text: string;
  placement?: HookPlacement;
  fontSize?: number;
  onProgress?: (pct: number) => void;
};

export type BrowserRenderResult = {
  blob: Blob;
  extension: string;
  mimeType: string;
  thumbnail: Blob | null;
};

/**
 * Normalized 9:16 safe zones, measured against the platform UI:
 * the top bar / following-for-you tabs, the right-hand interaction rail and
 * the bottom caption + progress bar area.
 */
export const SAFE_ZONES: Record<HookPlacement, { top: number; bottom: number; width: number }> = {
  top: { top: 0.12, bottom: 0.32, width: 0.8 },
  middle: { top: 0.38, bottom: 0.62, width: 0.8 },
  bottom: { top: 0.6, bottom: 0.78, width: 0.72 },
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
  return `900 ${size}px "Inter", "Helvetica Neue", system-ui, -apple-system, "Segoe UI", sans-serif`;
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
 * Lay the hook out as ONE cohesive centered text block at natural TikTok
 * caption scale, shrinking until it fits entirely inside its safe zone.
 */
function layoutOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  placement: HookPlacement,
) {
  const zone = SAFE_ZONES[placement];
  const maxTextWidth = Math.round(width * zone.width);
  const zoneTop = Math.round(height * zone.top);
  const zoneBottom = Math.round(height * zone.bottom);
  const maxBlockHeight = zoneBottom - zoneTop;
  const minSize = 26;

  // Natural caption scale: modest to begin with, smaller as the hook grows.
  const chars = text.trim().length;
  const startRatio = chars <= 40 ? 0.056 : chars <= 90 ? 0.05 : 0.045;
  let size = Math.max(minSize, Math.round(width * startRatio));
  let lines: string[] = [];
  let lineHeight = Math.round(size * 1.16);

  for (;;) {
    ctx.font = fontFor(size);
    lines = wrapLines(ctx, text, maxTextWidth);
    lineHeight = Math.round(size * 1.16);
    const total = lines.length * lineHeight;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if ((total <= maxBlockHeight && widest <= maxTextWidth) || size <= minSize) break;
    size -= 2;
  }

  const blockHeight = lines.length * lineHeight;
  // Center the block vertically inside its own zone; never overflow it.
  const blockTop = Math.max(zoneTop, zoneTop + Math.round((maxBlockHeight - blockHeight) / 2));

  return { size, lines, lineHeight, blockTop, strokeWidth: Math.max(6, Math.round(size * 0.18)) };
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

  // layoutOverlay measures text to decide wrapping and font size, and
  // drawFrame paints with the same font string — but if the "Inter" webfont
  // hasn't actually finished loading yet, the canvas silently measures with
  // a narrower fallback font while still painting with the real (wider,
  // heavier) one once it loads. That mismatch lets a word fit during
  // wrapping that no longer fits once actually drawn, so the last line can
  // end up wider than intended and push off-center toward the right edge.
  // Loading the exact weight/family string used for rendering first, and
  // waiting on `document.fonts.ready`, guarantees measurement and drawing
  // both use the real metrics.
  try {
    if (typeof document !== "undefined" && "fonts" in document) {
      await document.fonts.load(fontFor(64));
      await document.fonts.ready;
    }
  } catch {
    // If font loading APIs aren't available/throw, fall back to whatever
    // font is already resolved rather than blocking the render.
  }

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

  const overlay = layoutOverlay(ctx, text.trim() || "…", width, height, opts.placement ?? "top");
  const font = fontFor(overlay.size);

  const mimeType = pickMimeType();
  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";

  // Manual-frame capture: the canvas emits a frame only when we ask for one,
  // and every emitted frame is timestamped at real wall-clock time. With the
  // old fixed-rate captureStream(30) a slow 1080x1920 draw loop produced far
  // fewer than 30 fps while the muxer still assumed 30 fps, so the whole clip
  // was packed into a short, sped-up file (a 7s source came out ~2s).
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const manualFrames = typeof track?.requestFrame === "function";
  const captureStreamToUse = manualFrames ? stream : canvas.captureStream(30);
  const recorder = new MediaRecorder(captureStreamToUse, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  function drawFrame() {
    ctx!.fillStyle = "#000000";
    ctx!.fillRect(0, 0, width, height);

    const vw = video.videoWidth || width;
    const vh = video.videoHeight || height;
    const scale = Math.max(width / vw, height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx!.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);

    // Burn the hook in on every single frame: heavy white type, hard black
    // outline, one cohesive centered block — no background box.
    ctx!.font = font;
    ctx!.textBaseline = "middle";
    ctx!.textAlign = "center";
    ctx!.lineJoin = "round";
    ctx!.miterLimit = 2;
    ctx!.lineWidth = overlay.strokeWidth;
    ctx!.strokeStyle = "#000000";
    ctx!.fillStyle = "#FFFFFF";
    overlay.lines.forEach((line, i) => {
      const y = overlay.blockTop + i * overlay.lineHeight + overlay.lineHeight / 2;
      ctx!.strokeText(line, width / 2, y);
      ctx!.fillText(line, width / 2, y);
    });
    if (manualFrames) track!.requestFrame();
  }


  // Start actual playback first and confirm at least one real video frame has
  // decoded before we open the recorder. Otherwise the first ~200ms chunk can
  // land on a blank/pre-play frame — the export would open on empty video
  // with only the hook text visible for a beat.
  await video.play();
  await new Promise<void>((resolve) => {
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => resolve());
    } else {
      // Fallback for browsers without requestVideoFrameCallback: one rAF
      // after play() is enough for the decoder to have produced a frame.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }
  });

  // Freeze the source while the recorder opens so the footage consumed during
  // the decode wait isn't lost: recording then starts on the exact frame we
  // stopped on, with no blank beat and no missing head of the clip.
  video.pause();
  drawFrame();
  recorder.start(200);
  const startedAt = performance.now();
  await video.play();

  console.log("[render-debug] loop-start", { start, durationSeconds, videoDuration: video.duration });
  let fallbackFireCount = 0;
  await new Promise<void>((resolve) => {
    let done = false;
    let lastRafAt = performance.now();
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      console.log("[render-debug] loop-end", {
        fallbackFireCount,
        finalCurrentTime: video.currentTime,
        videoEnded: video.ended,
        elapsedMs: performance.now() - startedAt,
      });
      resolve();
    };
    const tick = () => {
      if (done) return;
      // When the source runs out we keep drawing its final frame so the export
      // is always exactly `durationSeconds` long.
      if (video.ended || video.currentTime >= start + durationSeconds - 0.03) {
        if (!video.paused) video.pause();
      }
      drawFrame();
      const elapsed = (performance.now() - startedAt) / 1000;
      opts.onProgress?.(Math.min(99, Math.round((elapsed / durationSeconds) * 100)));
      if (elapsed >= durationSeconds) finish();
    };
    // requestAnimationFrame is the primary driver — it's tied to real paint
    // timing, so frames come out evenly spaced. The interval is a fallback
    // ONLY: it steps in solely if rAF has gone quiet (a backgrounded tab
    // throttles rAF), so the two never draw/capture the same moment twice.
    const FALLBACK_GAP_MS = 120;
    const timer = setInterval(() => {
      if (done) return;
      if (performance.now() - lastRafAt >= FALLBACK_GAP_MS) {
        fallbackFireCount++;
        tick();
      }
    }, 1000 / 30);
    const raf = () => {
      if (done) return;
      lastRafAt = performance.now();
      tick();
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
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
  captureStreamToUse.getTracks().forEach((t) => t.stop());
  if (captureStreamToUse !== stream) stream.getTracks().forEach((t) => t.stop());

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
