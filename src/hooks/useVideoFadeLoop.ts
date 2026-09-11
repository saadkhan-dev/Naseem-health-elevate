import { useEffect, type RefObject } from "react";

export function useVideoFadeLoop(videoRef: RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId = 0;
    let fading = false;
    let fadeOutTriggered = false;

    const fadeTo = (target: number, duration: number, onComplete?: () => void) => {
      if (fading) return;
      fading = true;
      const start = performance.now();
      const startOpacity = parseFloat(video.style.opacity || "0");

      const animate = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        video.style.opacity = String(startOpacity + (target - startOpacity) * progress);
        if (progress < 1) {
          rafId = requestAnimationFrame(animate);
        } else {
          fading = false;
          onComplete?.();
        }
      };
      rafId = requestAnimationFrame(animate);
    };

    const onCanPlay = () => {
      void video.play();
      fadeTo(1, 500);
    };

    const onTimeUpdate = () => {
      if (!video.duration || fadeOutTriggered) return;
      const remaining = video.duration - video.currentTime;
      if (remaining <= 0.55 && remaining > 0) {
        fadeOutTriggered = true;
        fadeTo(0, 500);
      }
    };

    const onEnded = () => {
      video.style.opacity = "0";
      fadeOutTriggered = false;
      window.setTimeout(() => {
        video.currentTime = 0;
        void video.play();
        fadeTo(1, 500);
      }, 100);
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    return () => {
      cancelAnimationFrame(rafId);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoRef]);
}
