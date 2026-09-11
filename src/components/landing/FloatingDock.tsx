import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, MessageCircle, Phone, ArrowUp, X } from "lucide-react";
import { scrollToHash } from "@/lib/scroll";
import { whatsappUrl, telUrl } from "@/lib/contact";
import { SITE_CONFIG } from "@/lib/site-config";
import { useFloatingControls } from "@/hooks/useFloatingControls";
import { useFloatingDismiss } from "@/hooks/useFloatingDismiss";

export function FloatingDock() {
  const [showDock, setShowDock] = useState(false);
  const { hidden } = useFloatingControls();
  const { dockDismissed, dismissDock } = useFloatingDismiss();

  useEffect(() => {
    function handleScroll() {
      if (window.scrollY > 400) {
        setShowDock(true);
      } else {
        setShowDock(false);
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  const enabled = SITE_CONFIG.showFloatingActions && !hidden && !dockDismissed;

  return (
    <AnimatePresence>
      {showDock && enabled && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-6 left-1/2 z-40 mx-auto w-[calc(100%-2.5rem)] max-w-fit -translate-x-1/2"
        >
          <div className="relative">
            <div className="liquid-glass-glow flex items-center justify-center gap-1.5 rounded-full p-2 shadow-2xl backdrop-blur-2xl sm:gap-2 sm:px-2">
              <button
                onClick={() => scrollToHash("#booking")}
                className="flex items-center gap-2 rounded-full bg-emerald-400 px-3 py-2 text-xs font-bold text-black transition-all hover:bg-emerald-300 hover:scale-105 active:scale-95 shadow-md sm:px-4"
              >
                <CalendarCheck className="h-4 w-4" />
                <span className="hidden whitespace-nowrap sm:inline">Book Appointment</span>
              </button>

              <a
                href={whatsappUrl("Hi Dr. Naseem, I'd like to consult.")}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="liquid-glass rounded-full p-2 text-white/80 transition-all hover:bg-emerald-500/20 hover:text-emerald-300 hover:scale-110 sm:p-2.5"
              >
                <MessageCircle className="h-4 w-4" />
              </a>

              <a
                href={telUrl}
                aria-label="Call clinic"
                className="liquid-glass rounded-full p-2 text-white/80 transition-all hover:bg-cyan-500/20 hover:text-cyan-300 hover:scale-110 sm:p-2.5"
              >
                <Phone className="h-4 w-4" />
              </a>

              <div className="h-4 w-px bg-white/20" />

              <button
                onClick={scrollToTop}
                aria-label="Scroll to top"
                className="liquid-glass rounded-full p-2 text-white/70 transition-all hover:bg-white/10 hover:text-white hover:scale-110 sm:p-2.5"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={dismissDock}
              aria-label="Hide quick actions"
              title="Hide quick actions (restore from the floating 'Restore' control)"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/80 shadow-soft backdrop-blur transition-all duration-300 hover:bg-white/10 hover:text-white active:scale-90"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}