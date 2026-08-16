import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Plus, X } from "lucide-react";
import { useFloatingControls } from "@/hooks/useFloatingControls";
import { useFloatingDismiss } from "@/hooks/useFloatingDismiss";
import { cn } from "@/lib/utils";

/**
 * Small restore control for the dismissed floating WhatsApp / Naseem AI
 * buttons. It appears only while at least one widget has been dismissed (and
 * only on public routes where floating controls are allowed). Clicking it
 * opens a tiny menu letting the user bring back either widget.
 *
 * Positioning: it sits where a dismissed widget used to be so it never
 * overlaps the widget that is still visible. Safe-area aware on mobile.
 */
export function FloatingRestore() {
  const { hidden } = useFloatingControls();
  const { whatsappDismissed, naseemDismissed, restoreWhatsapp, restoreNaseem } =
    useFloatingDismiss();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const showRestore = !hidden && (whatsappDismissed || naseemDismissed);

  useEffect(() => {
    if (!showRestore) setOpen(false);
  }, [showRestore]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  if (!showRestore) return null;

  // If WhatsApp is dismissed, sit in WhatsApp's old spot (bottom); otherwise
  // WhatsApp is still visible so sit above it (Naseem's old spot).
  const bottomClass = whatsappDismissed
    ? "bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]"
    : "bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)]";

  return (
    <div
      ref={menuRef}
      data-floating-control="true"
      className={cn("fixed right-3 z-50 sm:right-5", bottomClass)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Restore floating actions"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glass active:scale-95"
      >
        {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-3 w-52 overflow-hidden rounded-2xl border border-border bg-card shadow-glass">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Floating Actions
          </div>
          <div className="p-1.5">
            {whatsappDismissed && (
              <button
                type="button"
                onClick={() => {
                  restoreWhatsapp();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <MessageCircle className="h-4 w-4 shrink-0 text-[color:var(--whatsapp)]" />
                WhatsApp
              </button>
            )}
            {naseemDismissed && (
              <button
                type="button"
                onClick={() => {
                  restoreNaseem();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Bot className="h-4 w-4 shrink-0 text-primary" />
                Naseem AI Assistant
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
