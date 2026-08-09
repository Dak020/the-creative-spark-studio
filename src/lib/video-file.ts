/** Shared client-side validation helpers for source video uploads. */

const ALLOWED_EXT = /\.(mp4|m4v|mov|qt)$/i;
const ALLOWED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/m4v",
];

/**
 * Accept a file when EITHER the MIME type or the extension looks like MP4/MOV.
 * Mobile pickers (iOS/Android) frequently hand over files with a generic name
 * or an empty MIME type, so requiring both was rejecting valid clips.
 */
export function videoFileError(file: File): string | null {
  const type = (file.type || "").toLowerCase();
  const okType = ALLOWED_TYPES.includes(type);
  const okExt = ALLOWED_EXT.test(file.name);
  const genericVideo = type.startsWith("video/") && !file.name.includes(".");

  if (!okType && !okExt && !genericVideo) {
    return `${file.name || "This file"} is not an MP4 or MOV video${
      type ? ` (detected type: ${type})` : ""
    }.`;
  }
  if (file.size === 0) return `${file.name || "This file"} is empty.`;
  if (file.size > 300 * 1024 * 1024) {
    return `${file.name} is larger than 300MB.`;
  }
  return null;
}

export function videoExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ALLOWED_EXT.test(`.${fromName}`)) return fromName;
  return file.type.toLowerCase().includes("quicktime") ? "mov" : "mp4";
}

/** Resolve after `ms` with a fallback so a stalled <video> can never hang an upload. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
