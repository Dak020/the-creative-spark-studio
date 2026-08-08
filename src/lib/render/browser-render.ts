/**
 * Browser-side deterministic renderer.
 *
 * Draws the source clip into a 1080x1920 canvas (cover crop), burns the hook
 * text into a white box with black type inside the TikTok/Reels safe area, and
 * records exactly `durationSeconds` of output via MediaRecorder.
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

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 4) {
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
  return lines.slice(0, maxLines);
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
  const fontSize = opts.fontSize ?? 64;

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

  const font = `700 ${fontSize}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const boxPadX = Math.round(fontSize * 0.42);
  const boxPadY = Math.round(fontSize * 0.26);
  const lineHeight = Math.round(fontSize * 1.32);
  ctx.font = font;
  const lines = wrapLines(ctx, text, width * 0.82);
  const blockTop = Math.round(height * 0.14);

  function drawFrame() {
    ctx!.fillStyle = "#000000";
    ctx!.fillRect(0, 0, width, height);

    const vw = video.videoWidth || width;
    const vh = video.videoHeight || height;
    const scale = Math.max(width / vw, height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx!.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);

    ctx!.font = font;
    ctx!.textBaseline = "middle";
    ctx!.textAlign = "center";
    lines.forEach((line, i) => {
      const metrics = ctx!.measureText(line);
      const boxW = metrics.width + boxPadX * 2;
      const boxH = lineHeight + boxPadY;
      const y = blockTop + i * (boxH + 8);
      ctx!.fillStyle = "#FFFFFF";
      ctx!.fillRect((width - boxW) / 2, y, boxW, boxH);
      ctx!.fillStyle = "#000000";
      ctx!.fillText(line, width / 2, y + boxH / 2);
    });
  }

  drawFrame();
  recorder.start(200);
  await video.play();

  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      drawFrame();
      const elapsed = (performance.now() - startedAt) / 1000;
      opts.onProgress?.(Math.min(99, Math.round((elapsed / durationSeconds) * 100)));
      const reachedEnd = video.ended || video.currentTime >= start + durationSeconds - 0.03;
      if (elapsed >= durationSeconds || reachedEnd) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  video.pause();
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  video.src = "";

  return { blob: new Blob(chunks, { type: mimeType }), extension, mimeType };
}

/** Evenly spread N start offsets across a source clip, skipping the first beat. */
export function planStartOffsets(sourceDuration: number, count: number, clipLength: number) {
  const usable = Math.max(0, (sourceDuration || clipLength) - clipLength);
  if (usable <= 0.1) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, i) => Number(((usable * i) / Math.max(1, count - 1)).toFixed(2)));
}
