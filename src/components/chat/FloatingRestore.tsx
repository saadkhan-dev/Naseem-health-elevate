import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Plus, X } from "lucide-react";
import { useFloatingControls } from "@/hooks/useFloatingControls";
import { useFloatingDismiss } from "@/hooks/useFloatingDismiss";
import { cn } from "@/lib/utils";

const MENU_ITEMS = [
  {
    key: "whatsapp",
    label: "Show WhatsApp",
    Icon: MessageCircle,
    iconClass: "text-[color:var(--whatsapp)]",
  },
  { key: "naseem", label: "Show Naseem AI", Icon: Bot, iconClass: "text-primary" },
  { key: "both", label: "Show Both", Icon: Plus, iconClass: "text-muted-foreground" },
] as const;

type MenuItemKey = (typeof MENU_ITEMS)[number]["key"];

/**
 * Small restore control for the dismissed floating WhatsApp / Naseem AI
 * buttons. It appears only while at least one widget has been dismissed (and
 * only on public routes where floating controls are allowed).
 *
 * Layout matches the intended design:
 *
 *         Restore
 *           [+]
 *
 * — a tiny, subtle "Restore" caption above a circular [+] button. Clicking or
 * tapping "+" opens a small accessible menu with "Show WhatsApp",
 * "Show Naseem AI" and "Show Both".
 *
 * Positioning (never overlaps a still-visible widget, safe-area aware):
 *   - WhatsApp dismissed -> sits in WhatsApp's old spot (bottom-right).
 *   - WhatsApp visible (Naseem dismissed) -> sits above WhatsApp (Naseem's slot).
 * Mobile: bottom-4 right-3 · Desktop/laptop: bottom-6 right-6.
 */
export function FloatingRestore() {
  const { hidden } = useFloatingControls();
  const { whatsappDismissed, naseemDismissed, restoreWhatsapp, restoreNaseem } =
    useFloatingDismiss();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const showRestore = !hidden && (whatsappDismissed || naseemDismissed);

  useEffect(() => {
    if (!showRestore) setOpen(false);
  }, [showRestore]);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open]);

  // Close on outside click and Escape; move focus into the menu when it opens.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % MENU_ITEMS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? MENU_ITEMS.length - 1 : i - 1));
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Keep keyboard focus in sync with the active item.
  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function handleRestore(key: MenuItemKey) {
    if (key === "whatsapp") restoreWhatsapp();
    else if (key === "naseem") restoreNaseem();
    else {
      restoreWhatsapp();
      restoreNaseem();
    }
    setOpen(false);
    triggerRef.current?.focus();
  }

  if (!showRestore) return null;

  // If WhatsApp is dismissed, sit in WhatsApp's old spot (bottom). Otherwise
  // WhatsApp is still visible so sit above it (Naseem's old spot).
  const bottomClass = whatsappDismissed
    ? "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
    : "bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)]";

  return (
    <div
      ref={rootRef}
      data-floating-control="true"
      className={cn("fixed right-3 z-50 flex flex-col items-center gap-1 sm:right-6", bottomClass)}
    >
      {open && (
        <div
          role="menu"
          aria-label="Restore floating actions"
          className="absolute bottom-full right-0 mb-2 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-glass animate-in fade-in zoom-in-95 duration-150"
        >
          {MENU_ITEMS.map(({ key, label, Icon, iconClass }, i) => (
            <button
              key={key}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => handleRestore(key)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                activeIndex === i && "bg-muted",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", iconClass)} />
              {label}
            </button>
          ))}
        </div>
      )}

      <span className="text-[10px] font-medium tracking-wide text-muted-foreground sm:text-[11px]">
        Restore
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Restore floating actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glass active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-12 sm:w-12"
      >
        {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );
}
