import { BadgePercent } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { todayInClinic } from "@/lib/clinic";
import { computeOfferAmount, isOfferActive, type VideoOffer } from "@/lib/video-offer-types";

interface VideoOfferCardsProps {
  offers: VideoOffer[];
  /** Full video consultation price. When provided, active offers show the discounted fee. */
  basePrice?: number;
  className?: string;
}

function discountLabel(o: VideoOffer): string {
  if (o.offer_type === "waive") return "Free";
  if (o.offer_type === "percent") return `${o.discount_percent}% off`;
  return `Rs. ${o.discount_amount} off`;
}

function formatOfferDate(d: string): string {
  const parsed = new Date(`${d}T00:00:00`);
  return format(parsed, "MMMM d, yyyy");
}

/**
 * Public "Video Consultation offers" card list.
 *
 * Uses the DISPLAY rule: active offers (start date reached) AND upcoming offers
 * (still in the future) are shown together. Only active offers advertise the
 * discounted price — upcoming offers show their start date and leave the normal
 * price untouched until then.
 */
export function VideoOfferCards({ offers, basePrice, className }: VideoOfferCardsProps) {
  const today = todayInClinic();
  if (!offers || offers.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <BadgePercent className="h-3.5 w-3.5" />
        Current & Upcoming Offers
      </div>
      {offers.map((o) => {
        const active = isOfferActive(o, today);
        const activePrice = active && basePrice != null ? computeOfferAmount(o, basePrice) : null;
        return (
          <div
            key={o.id}
            className={cn(
              "rounded-xl border p-3",
              active ? "border-primary/40 bg-primary-soft/60" : "border-border bg-muted/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{o.title}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-muted-foreground",
                )}
              >
                {active ? "Active" : "Upcoming"}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{discountLabel(o)}</span>
              {active
                ? o.end_date
                  ? ` · valid until ${formatOfferDate(o.end_date)}`
                  : " · currently active"
                : ` · starts ${formatOfferDate(o.start_date)}${
                    o.end_date ? `, ends ${formatOfferDate(o.end_date)}` : ""
                  }`}
            </div>
            {o.description && <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>}
            {activePrice != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                You pay <span className="font-bold text-primary">Rs. {activePrice}</span>
                {activePrice < basePrice! && (
                  <>
                    {" "}
                    instead of <s>Rs. {basePrice}</s>
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
