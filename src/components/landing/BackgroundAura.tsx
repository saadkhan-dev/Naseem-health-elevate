import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Full-page ambient glows. The slow infinite drift is skipped on touch devices
 * and for prefers-reduced-motion, so mobile scrolling isn't forcing three huge
 * blurred elements to repaint/composite on every animation frame.
 */
export function BackgroundAura() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fine && !reduced) setAnimate(true);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Subtle digital dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* Primary Cyan/Teal Ambient Aura */}
      <motion.div
        style={{ opacity: 0.12, scale: 1, x: 0, y: 0 }}
        animate={
          animate
            ? {
                scale: [1, 1.2, 1],
                opacity: [0.08, 0.15, 0.08],
                x: [0, 40, 0],
                y: [0, -30, 0],
              }
            : undefined
        }
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent blur-[140px]"
      />

      {/* Secondary Deep Cyan Glow */}
      <motion.div
        style={{ opacity: 0.08, scale: 1, x: 0, y: 0 }}
        animate={
          animate
            ? {
                scale: [1, 1.15, 1],
                opacity: [0.05, 0.12, 0.05],
                x: [0, -50, 0],
                y: [0, 50, 0],
              }
            : undefined
        }
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
        }}
        className="absolute top-1/2 -right-40 h-[700px] w-[700px] rounded-full bg-gradient-to-bl from-cyan-500/15 via-blue-600/10 to-transparent blur-[160px]"
      />

      {/* Tertiary Subtle Pearl Violet Glow */}
      <motion.div
        style={{ opacity: 0.07, scale: 1 }}
        animate={
          animate
            ? {
                scale: [1, 1.25, 1],
                opacity: [0.04, 0.09, 0.04],
              }
            : undefined
        }
        transition={{
          duration: 26,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 8,
        }}
        className="absolute bottom-20 left-10 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-teal-400/10 via-emerald-600/5 to-transparent blur-[150px]"
      />
    </div>
  );
}
