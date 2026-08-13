import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2, Gift } from "lucide-react";
import {
  useAdminVideoOffers,
  useCreateVideoOffer,
  useUpdateVideoOffer,
  useDeleteVideoOffer,
  useAdminServices,
} from "@/hooks/queries/useAdmin";
import type { VideoOffer } from "@/lib/admin-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { isVideoConsultationService } from "@/lib/bookings";
import { computeOfferAmount } from "@/lib/video-offer-types";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/offers")({
  component: AdminOffers,
});

interface OfferForm {
  title: string;
  description: string;
  offer_type: "waive" | "percent" | "fixed";
  discount_percent: string;
  discount_amount: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  eligibility: "all" | "new_patients";
  terms: string;
}

const today = new Date().toISOString().slice(0, 10);

const emptyForm: OfferForm = {
  title: "",
  description: "",
  offer_type: "percent",
  discount_percent: "20",
  discount_amount: "",
  start_date: today,
  end_date: "",
  is_active: true,
  eligibility: "all",
  terms: "",
};

function AdminOffers() {
  const { data: offers, isLoading, isError, error } = useAdminVideoOffers();
  const { data: services } = useAdminServices();
  const createOffer = useCreateVideoOffer();
  const updateOffer = useUpdateVideoOffer();
  const deleteOffer = useDeleteVideoOffer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VideoOffer | null>(null);
  const [form, setForm] = useState<OfferForm>(emptyForm);
  const [formError, setFormError] = useState("");

  const videoService = services?.find(isVideoConsultationService);
  const basePrice = videoService?.price ?? 0;

  const preview = useMemo(() => {
    const discount_percent = form.discount_percent === "" ? null : Number(form.discount_percent);
    const discount_amount = form.discount_amount === "" ? null : Number(form.discount_amount);
    return computeOfferAmount(
      { offer_type: form.offer_type, discount_percent, discount_amount },
      basePrice,
    );
  }, [form.offer_type, form.discount_percent, form.discount_amount, basePrice]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(o: VideoOffer) {
    setEditing(o);
    setForm({
      title: o.title,
      description: o.description ?? "",
      offer_type: o.offer_type,
      discount_percent: o.discount_percent?.toString() ?? "",
      discount_amount: o.discount_amount?.toString() ?? "",
      start_date: o.start_date,
      end_date: o.end_date ?? "",
      is_active: o.is_active,
      eligibility: o.eligibility,
      terms: o.terms ?? "",
    });
    setFormError("");
    setDialogOpen(true);
  }

  function validate(): string | null {
    if (!form.title.trim()) return "Title is required.";
    if (!form.start_date) return "Start date is required.";
    if (form.offer_type === "percent") {
      const p = Number(form.discount_percent);
      if (!form.discount_percent || Number.isNaN(p) || p < 1 || p > 100) {
        return "Enter a discount percentage between 1 and 100.";
      }
    }
    if (form.offer_type === "fixed") {
      const a = Number(form.discount_amount);
      if (!form.discount_amount || Number.isNaN(a) || a <= 0) {
        return "Enter a discount amount in Rs.";
      }
    }
    if (form.end_date && form.end_date < form.start_date) {
      return "End date cannot be before the start date.";
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError("");
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      offer_type: form.offer_type,
      discount_percent: form.offer_type === "percent" ? Number(form.discount_percent) : null,
      discount_amount: form.offer_type === "fixed" ? Number(form.discount_amount) : null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      is_active: form.is_active,
      eligibility: form.eligibility,
      terms: form.terms.trim() || null,
    };
    if (editing) {
      await updateOffer.mutateAsync({ id: editing.id, data: payload });
    } else {
      await createOffer.mutateAsync(payload);
    }
    setDialogOpen(false);
  }

  const typeLabel: Record<OfferForm["offer_type"], string> = {
    waive: "Free (100% off)",
    percent: "Percentage off",
    fixed: "Fixed amount off",
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Video Consultation Offers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discounts and waivers applied automatically at booking
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Offer
        </Button>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : offers?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No offers yet — create one to discount or waive video consultation fees.
          </p>
        ) : (
          offers?.map((o) => {
            const discountLabel =
              o.offer_type === "waive"
                ? "Free"
                : o.offer_type === "percent"
                  ? `${o.discount_percent}% off`
                  : `Rs. ${o.discount_amount} off`;
            return (
              <div key={o.id} className="rounded-xl border bg-card px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      {o.title}
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                        {discountLabel}
                      </span>
                      {!o.is_active && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {o.start_date}
                      {o.end_date ? ` → ${o.end_date}` : " → open-ended"} ·{" "}
                      {o.eligibility === "new_patients" ? "New patients only" : "Everyone"}
                    </div>
                    {o.description && (
                      <div className="mt-1 text-xs text-muted-foreground">{o.description}</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => deleteOffer.mutate(o.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Offer" : "Add Offer"}</DialogTitle>
            <DialogDescription>
              Active offers are applied to new video consultation bookings. "New patients only"
              excludes anyone who already used an offer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Ramadan Special — 20% Off"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shown to the patient on the payment step"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Type</label>
                <Select
                  value={form.offer_type}
                  onValueChange={(v) =>
                    setForm({ ...form, offer_type: v as OfferForm["offer_type"] })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="waive">Free (100% off)</SelectItem>
                    <SelectItem value="percent">Percentage off</SelectItem>
                    <SelectItem value="fixed">Fixed amount off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                {form.offer_type === "percent" ? (
                  <div>
                    <label className="text-sm font-medium text-foreground">Discount %</label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      className="mt-1"
                      value={form.discount_percent}
                      onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                    />
                  </div>
                ) : form.offer_type === "fixed" ? (
                  <div>
                    <label className="text-sm font-medium text-foreground">Discount (Rs.)</label>
                    <Input
                      type="number"
                      min={1}
                      className="mt-1"
                      value={form.discount_amount}
                      onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium text-foreground">Eligibility</label>
                    <Select
                      value={form.eligibility}
                      onValueChange={(v) =>
                        setForm({ ...form, eligibility: v as OfferForm["eligibility"] })
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone</SelectItem>
                        <SelectItem value="new_patients">New patients only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Start Date</label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">End Date (optional)</label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Eligibility</label>
              <Select
                value={form.eligibility}
                onValueChange={(v) =>
                  setForm({ ...form, eligibility: v as OfferForm["eligibility"] })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="new_patients">New patients only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Terms (optional)</label>
              <Textarea
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
                placeholder="e.g. Limited to one use per patient."
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Active</div>
                <div className="text-xs text-muted-foreground">Apply to new bookings now</div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>

            {basePrice > 0 && form.offer_type !== "waive" && (
              <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
                <Gift className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">
                  Preview: Rs. {basePrice} → <b className="text-foreground">Rs. {preview}</b>{" "}
                  charged
                </span>
              </div>
            )}

            {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          </div>
          <DialogFooter className="shrink-0 -mx-6 -mb-6 gap-2 border-t bg-background px-6 py-4 sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={createOffer.isPending || updateOffer.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
