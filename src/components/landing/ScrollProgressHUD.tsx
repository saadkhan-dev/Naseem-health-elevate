import { motion, useScroll, useSpring } from "framer-motion";

export function ScrollProgressHUD() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-50 h-[2px]">
      <motion.div
        className="h-full w-full origin-left bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
        style={{ scaleX }}
      />
    </div>
  );
}
