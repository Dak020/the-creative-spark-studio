import { useRef, useState } from "react";
import { Play } from "lucide-react";

/**
 * Lightweight render preview.
 *
 * The <video> stays at preload="none" with a poster until the user actually
 * plays it, so a grid of 30 results never downloads 30 files at once — that
 * eager buffering is what made playback stutter. Once activated the element
 * keeps its own src, and the src string is stable across list refetches.
 */
export function RenderPlayer({
  src,
  poster,
  className = "",
}: {
  src: string;
  poster?: string | null;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  return (
    <div className={`relative aspect-[9/16] w-full overflow-hidden bg-black ${className}`}>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        controls={active}
        playsInline
        preload="none"
        className="size-full object-contain"
        onPlay={() => setActive(true)}
      />
      {!active ? (
        <button
          type="button"
          aria-label="Play render"
          onClick={() => {
            setActive(true);
            void ref.current?.play();
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/10"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-background/85 shadow-lg">
            <Play className="size-5 text-primary" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
