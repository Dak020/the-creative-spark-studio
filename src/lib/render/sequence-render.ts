/**
 * Clip DNA sequence renderer.
 *
 * Plays an ordered list of segments (each a cut of a different source clip, at
 * that clip's chosen speed) back-to-back into ONE canvas + ONE MediaRecorder,
 * producing a single continuous export.
 *
 * Hook rule for DNA renders: the hook is burned in ONLY over the FIRST segment,
 * using the placement frozen on the recipe. Later segments carry no overlay.
 * The standalone single-clip path (renderVariant) is untouched.
 */

import {
  attachAudioTrack,
  fontFor,
  layoutOverlay,
  pickMimeType,
  waitFor,
  type BrowserRenderResult,
  type HookPlacement,
} from "./browser-render";

export type SequenceSegment = {
  /** Playable URL for this segment's source clip. */
  url: string;
  /** Cut boundaries in the ORIGINAL clip timeline (seconds). */
  sourceIn: number;
  sourceOut: number;
  /** Playback speed; output_duration = (sourceOut - sourceIn) / speed. */
  speed: number;
  /** Wall-clock length of this segment in the export. */
  outputDuration: number;
};

export type SequenceRenderOptions = {
  segments: SequenceSegment[];
  width: number;
  height: number;
  /** Hook text — drawn over the first segment only. */
  text: string;
  placement?: HookPlacement;
  withAudio?: boolean;
  onProgress?: (pct: number) => void;
};

async function prepareVideo(seg: SequenceSegment, withAudio: boolean) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = !withAudio;
  video.volume = 1;
  video.playsInline = true;
  video.preload = "auto";
  video.src = seg.url;
  await waitFor(video, "loadedmetadata");
  const realDuration = Number.isFinite(video.duration) ? video.duration : seg.sourceOut;
  // Hard rule: never read past what the clip actually has.
  const start = Math.max(0, Math.min(seg.sourceIn, Math.max(0, realDuration - 0.05)));
  video.currentTime = start;
  await waitFor(video, "seeked");
  video.playbackRate = Math.max(0.25, Math.min(4, seg.speed || 1));
  return { video, start };
}

export async function renderSequence(opts: SequenceRenderOptions): Promise<BrowserRenderResult> {
  const { segments, width, height, text, withAudio } = opts;
  if (segments.length === 0) throw new Error("No segments to render.");

  try {
    if (typeof document !== "undefined" && "fonts" in document) {
      await document.fonts.load(fontFor(64));
      await document.fonts.ready;
    }
  } catch {
    /* fall back to resolved fonts */
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  // ---- Hook layout (first segment only) -----------------------------------
  const overlay = layoutOverlay(ctx, text.trim() || "…", width, height, opts.placement ?? "top");
  const centerX = Math.round(width / 2);
  const hardMaxWidth = width - 40;
  let drawSize = overlay.size;
  let font = fontFor(drawSize);
  ctx.font = font;
  while (Math.max(...overlay.lines.map((l) => ctx.measureText(l).width), 0) > hardMaxWidth && drawSize > 20) {
    drawSize -= 2;
    font = fontFor(drawSize);
    ctx.font = font;
  }
  const drawLineHeight = Math.round(drawSize * 1.16);
  const drawLines = overlay.lines.map((line) => {
    const m = ctx.measureText(line);
    const inkLeft = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : m.width / 2;
    const inkRight = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width / 2;
    return { text: line, x: centerX - (inkRight - inkLeft) / 2 };
  });

  // ---- Recorder ------------------------------------------------------------
  const mimeType = pickMimeType();
  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const manualFrames = typeof track?.requestFrame === "function";
  const captureStream = manualFrames ? stream : canvas.captureStream(30);

  const totalDuration = segments.reduce((s, seg) => s + seg.outputDuration, 0);

  // Load every segment up front so cuts are instant (no black gap between them)
  // and so all audio sources can be wired before recording starts — tracks
  // added to a stream after MediaRecorder.start() are not captured.
  const prepared: { video: HTMLVideoElement; start: number; seg: SequenceSegment }[] = [];
  for (const seg of segments) {
    const p = await prepareVideo(seg, !!withAudio);
    prepared.push({ ...p, seg });
  }
  if (withAudio) {
    for (const p of prepared) attachAudioTrack(p.video, captureStream);
  }

  const recorder = new MediaRecorder(captureStream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  let elapsedBefore = 0;
  let currentVideo: HTMLVideoElement = prepared[0]!.video;
  let showHook = true;

  function drawFrame() {
    ctx!.fillStyle = "#000000";
    ctx!.fillRect(0, 0, width, height);
    const vw = currentVideo.videoWidth || width;
    const vh = currentVideo.videoHeight || height;
    const scale = Math.max(width / vw, height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx!.drawImage(currentVideo, (width - dw) / 2, (height - dh) / 2, dw, dh);

    if (showHook) {
      ctx!.font = font;
      ctx!.textBaseline = "middle";
      ctx!.textAlign = "left";
      ctx!.lineJoin = "round";
      ctx!.miterLimit = 2;
      ctx!.lineWidth = overlay.strokeWidth;
      ctx!.strokeStyle = "#000000";
      ctx!.fillStyle = "#FFFFFF";
      drawLines.forEach((line, i) => {
        const y = overlay.blockTop + i * drawLineHeight + drawLineHeight / 2;
        ctx!.strokeText(line.text, line.x, y);
        ctx!.fillText(line.text, line.x, y);
      });
    }

    if (manualFrames) track!.requestFrame();
  }

  // Warm the first segment's decoder before opening the recorder, otherwise the
  // opening chunk can land on a blank pre-play frame.
  await currentVideo.play();
  await new Promise<void>((resolve) => {
    if (typeof currentVideo.requestVideoFrameCallback === "function") {
      currentVideo.requestVideoFrameCallback(() => resolve());
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }
  });
  currentVideo.pause();
  currentVideo.currentTime = prepared[0]!.start;
  await waitFor(currentVideo, "seeked");

  drawFrame();
  recorder.start(200);

  for (let index = 0; index < prepared.length; index++) {
    const { video, start, seg } = prepared[index]!;
    currentVideo = video;
    // Hook ONLY over the opening segment of a DNA edit.
    showHook = index === 0;
    if (index > 0) {
      video.currentTime = start;
      await waitFor(video, "seeked");
    }
    const segStartedAt = performance.now();
    await video.play();

    await new Promise<void>((resolve) => {
      let done = false;
      let lastRafAt = performance.now();
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        resolve();
      };
      const tick = () => {
        if (done) return;
        // Stop advancing the source once the cut boundary is reached — the last
        // frame is held for whatever wall-clock time remains, never looped.
        if (video.ended || video.currentTime >= seg.sourceOut - 0.03) {
          if (!video.paused) video.pause();
        }
        drawFrame();
        const segElapsed = (performance.now() - segStartedAt) / 1000;
        const pct = ((elapsedBefore + segElapsed) / totalDuration) * 100;
        opts.onProgress?.(Math.min(99, Math.round(pct)));
        if (segElapsed >= seg.outputDuration) finish();
      };
      const FALLBACK_GAP_MS = 120;
      const timer = setInterval(() => {
        if (done) return;
        if (performance.now() - lastRafAt >= FALLBACK_GAP_MS) tick();
      }, 1000 / 30);
      const raf = () => {
        if (done) return;
        lastRafAt = performance.now();
        tick();
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    });

    video.pause();
    elapsedBefore += seg.outputDuration;
  }

  const thumbnail = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8);
    } catch {
      resolve(null);
    }
  });

  if (recorder.state === "recording") recorder.requestData();
  recorder.stop();
  await stopped;

  captureStream.getTracks().forEach((t) => t.stop());
  if (captureStream !== stream) stream.getTracks().forEach((t) => t.stop());
  prepared.forEach((p) => {
    p.video.pause();
    p.video.src = "";
  });

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) throw new Error("Recorder produced an empty file.");
  return { blob, extension, mimeType, thumbnail };
}
