import { useEffect, useRef, type RefObject } from "react";

interface UsePauseOffscreenVideoOptions {
  /**
   * Called whenever playback should be re-evaluated. Return `false` to keep the
   * video paused even when it is on screen (e.g. the user explicitly paused it).
   */
  shouldPlay?: () => boolean;
}

/**
 * Pauses a background <video> whenever it scrolls out of the (near-)viewport
 * or the tab is hidden, and resumes it when it becomes visible again.
 *
 * Decorative autoplay loops elsewhere on the page stop wasting bandwidth, GPU
 * and battery while they can't be seen — the biggest speed/jank win on mobile,
 * where several full-width videos exist below the fold. The visuals are
 * unchanged: a video only plays (and only gets decoded) while it is near view.
 */
export function usePauseOffscreenVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: UsePauseOffscreenVideoOptions = {},
): void {
  const shouldPlayRef = useRef(options.shouldPlay);
  shouldPlayRef.current = options.shouldPlay;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let inViewNear = false;
    let docVisible = document.visibilityState === "visible";

    const evaluate = () => {
      if (disposed) return;
      const wantsPlay =
        inViewNear && docVisible && (shouldPlayRef.current ? shouldPlayRef.current() : true);
      if (wantsPlay) {
        if (video.paused) void video.play().catch(() => {});
      } else if (!video.paused) {
        video.pause();
      }
    };

    const isNearViewport = () => {
      const rect = video.getBoundingClientRect();
      const margin = 240;
      return rect.bottom >= -margin && rect.top <= window.innerHeight + margin && rect.bottom > 0;
    };

    inViewNear = isNearViewport();

    const observer = new IntersectionObserver(
      (entries) => {
        inViewNear = entries.some((entry) => entry.isIntersecting);
        evaluate();
      },
      { rootMargin: "240px 0px 240px 0px" },
    );
    observer.observe(video);

    const onVisibilityChange = () => {
      docVisible = document.visibilityState === "visible";
      evaluate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    evaluate();

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [videoRef]);
}
