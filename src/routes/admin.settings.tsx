import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Loader2,
  Save,
  Truck,
  Info,
  Package,
  Plus,
  Edit,
  Check,
  X,
  MapPin,
  Trash2,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { useStoreSettings } from "@/hooks/queries/useShop";
import {
  useUpdateStoreSettings,
  useDeliveryAreas,
  useCreateDeliveryArea,
  useUpdateDeliveryArea,
  useDeleteDeliveryArea,
} from "@/hooks/queries/useAdmin";
import { type DeliveryArea } from "@/lib/admin-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DEFAULT_STORE_SETTINGS, deliveryChargeLabel } from "@/lib/delivery";

export const Route = createFileRoute("/admin/settings")({
  component: AdminStoreSettings,
});

const EXAMPLE_SUBTOTAL = 2500;

function AdminStoreSettings() {
  const { data: storeSettings, isLoading } = useStoreSettings();
  const updateSettings = useUpdateStoreSettings();
  const { data: areas, isLoading: areasLoading } = useDeliveryAreas();
  const createArea = useCreateDeliveryArea();
  const updateArea = useUpdateDeliveryArea();
  const deleteArea = useDeleteDeliveryArea();

  const [draft, setDraft] = useState({ charge: "", threshold: "", note: "", active: false });
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [areaForm, setAreaForm] = useState(false);
  const [areaDraft, setAreaDraft] = useState({
    name: "",
    charge: "",
    threshold: "",
    note: "",
    active: true,
  });
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);

  useEffect(() => {
    const s = storeSettings ?? DEFAULT_STORE_SETTINGS;
    setDraft({
      charge: String(s.delivery_charge),
      threshold: s.free_delivery_threshold == null ? "" : String(s.free_delivery_threshold),
      note: s.delivery_note ?? "",
      active: s.delivery_is_active,
    });
  }, [storeSettings]);

  const charge = Math.max(0, Number(draft.charge) || 0);
  const threshold =
    draft.threshold.trim() === "" ? null : Math.max(0, Number(draft.threshold) || 0);
  const exampleDelivery = draft.active
    ? threshold != null && EXAMPLE_SUBTOTAL >= threshold
      ? 0
      : charge
    : 0;

  function openAreaForm(existing?: DeliveryArea) {
    setAreaDraft({
      name: existing?.name ?? "",
      charge: existing ? String(existing.delivery_charge) : "",
      threshold:
        existing?.free_delivery_threshold == null
          ? ""
          : String(existing.free_delivery_threshold),
      note: existing?.delivery_note ?? "",
      active: existing?.is_active ?? true,
    });
    setEditingAreaId(existing ? existing.id : null);
    setAreaForm(true);
  }

  function closeAreaForm() {
    setAreaForm(false);
    setEditingAreaId(null);
  }

  const areaCharge = Math.max(0, Number(areaDraft.charge) || 0);
  const areaThreshold =
    areaDraft.threshold.trim() === "" ? null : Math.max(0, Number(areaDraft.threshold) || 0);

  async function handleSave() {
    setMessage("");
    setSaved(false);
    const result = await updateSettings.mutateAsync({
      delivery_charge: charge,
      free_delivery_threshold: threshold,
      delivery_is_active: draft.active,
      delivery_note: draft.note.trim() || null,
    });
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setSaved(true);
  }

  async function handleSaveArea() {
    if (!areaDraft.name.trim()) return;
    const result = editingAreaId
      ? await updateArea.mutateAsync({
          id: editingAreaId,
          data: {
            name: areaDraft.name.trim(),
            delivery_charge: areaCharge,
            free_delivery_threshold: areaThreshold,
            delivery_note: areaDraft.note.trim() || null,
            is_active: areaDraft.active,
          },
        })
      : await createArea.mutateAsync({
          name: areaDraft.name.trim(),
          delivery_charge: areaCharge,
          free_delivery_threshold: areaThreshold,
          delivery_note: areaDraft.note.trim() || null,
        });
    if (result.error) {
      setMessage(result.error);
      return;
    }
    closeAreaForm();
  }

  async function handleAreaToggle(id: string, currentActive: boolean) {
    const result = await updateArea.mutateAsync({ id, data: { is_active: !currentActive } });
    if (result.error) setMessage(result.error);
  }

  async function handleAreaDelete(id: string) {
    if (!confirm("Are you sure you want to delete or disable this delivery area?")) return;
    const result = await deleteArea.mutateAsync(id);
    if (result.error) setMessage(result.error);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Delivery Charges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure default delivery charges, free-delivery thresholds, and area-wise delivery zones
          for customer orders.
        </p>
      </div>

      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {/* Section 1: Default Delivery Settings */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Truck className="h-5 w-5" />
            </span>
            <div>
              <div className="text-base font-semibold text-foreground">Default Delivery Settings</div>
              <div className="text-xs text-muted-foreground">
                {draft.active
                  ? "Delivery charges are currently enabled across the store."
                  : "Delivery charges are disabled — orders default to Rs. 0 delivery."}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {draft.active ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={draft.active}
              onCheckedChange={(v) => {
                setDraft((p) => ({ ...p, active: v }));
                setSaved(false);
              }}
              disabled={isLoading}
            />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Default delivery charge (Rs.)
            </label>
            <Input
              type="number"
              min={0}
              value={draft.charge}
              placeholder="e.g. 200"
              onChange={(e) => {
                setDraft((p) => ({ ...p, charge: e.target.value }));
                setSaved(false);
              }}
              className="w-full"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Standard clinic delivery fee when no area-specific charge applies.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Free delivery threshold (Rs.) <span className="text-muted-foreground/70">— optional</span>
            </label>
            <Input
              type="number"
              min={0}
              value={draft.threshold}
              placeholder="e.g. 5000 (Empty = no free delivery threshold)"
              onChange={(e) => {
                setDraft((p) => ({ ...p, threshold: e.target.value }));
                setSaved(false);
              }}
              className="w-full"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cart subtotal at/above which delivery fee is automatically waived.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Patient-facing delivery note <span className="text-muted-foreground/70">— optional</span>
            </label>
            <Input
              value={draft.note}
              placeholder="e.g. Delivery within Karachi only · 2–3 working days"
              onChange={(e) => {
                setDraft((p) => ({ ...p, note: e.target.value }));
                setSaved(false);
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Displayed on cart and checkout pages to inform customers.
            </p>
          </div>
        </div>

        {/* Live Example Calculation */}
        <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> Example Calculation (Subtotal: Rs. {EXAMPLE_SUBTOTAL.toLocaleString()})
          </div>
          <div className="mt-3 space-y-1.5 max-w-sm">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Product Subtotal</span>
              <span className="font-medium text-foreground">
                Rs. {EXAMPLE_SUBTOTAL.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Delivery Charge</span>
              <span className="font-medium text-foreground">
                {exampleDelivery > 0 ? `Rs. ${exampleDelivery.toLocaleString()}` : "Free (Rs. 0)"}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-1.5 text-xs sm:text-sm">
              <span className="font-semibold text-foreground">Grand Total</span>
              <span className="font-bold text-foreground">
                Rs. {(EXAMPLE_SUBTOTAL + exampleDelivery).toLocaleString()}
              </span>
            </div>
          </div>
          {!draft.active && (
            <p className="mt-2.5 text-xs text-amber-700">
              Delivery charges are currently switched off globally, so delivery will be Rs. 0.
            </p>
          )}
          {draft.active && charge === 0 && (
            <p className="mt-2.5 text-xs text-muted-foreground">
              Delivery charge is set to Rs. 0 (free delivery for all orders).
            </p>
          )}
          {draft.active && threshold != null && (
            <p className="mt-2.5 text-xs text-muted-foreground">
              Orders with subtotal of Rs. {threshold.toLocaleString()} or more receive free delivery.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            className="gap-2"
            onClick={handleSave}
            disabled={isLoading || updateSettings.isPending}
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Default Delivery Settings
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check className="h-4 w-4" /> Saved successfully
            </span>
          )}
        </div>
      </section>

      {/* Section 2: Delivery Areas / Delivery Zones */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600">
              <MapPin className="h-5 w-5" />
            </span>
            <div>
              <div className="text-base font-semibold text-foreground">Delivery Areas / Zones</div>
              <div className="text-xs text-muted-foreground">
                Create area-specific rates (e.g. North Karachi, Nazimabad, Gulshan, DHA). Patients select their area at checkout.
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => openAreaForm()}
            disabled={createArea.isPending || updateArea.isPending || deleteArea.isPending}
          >
            <Plus className="h-4 w-4" /> Add Delivery Area
          </Button>
        </div>

        {areasLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (areas ?? []).length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-medium text-foreground">No delivery areas configured</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When no areas are defined, checkout uses the store's default delivery charge. Click "Add Delivery Area" above to create zone-specific rates.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="pb-3 font-semibold">Area / Zone</th>
                  <th className="pb-3 font-semibold">Delivery Charge</th>
                  <th className="pb-3 font-semibold">Free Over</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(areas ?? []).map((area) => (
                  <tr key={area.id} className="hover:bg-muted/20">
                    <td className="py-3 font-medium text-foreground">
                      <div>{area.name}</div>
                      {area.delivery_note && (
                        <div className="text-xs text-muted-foreground">{area.delivery_note}</div>
                      )}
                    </td>
                    <td className="py-3 text-foreground">
                      Rs. {Number(area.delivery_charge).toLocaleString()}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {area.free_delivery_threshold != null
                        ? `Rs. ${Number(area.free_delivery_threshold).toLocaleString()}`
                        : "Global rule"}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          area.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {area.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => openAreaForm(area)}
                        >
                          <Edit className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 gap-1 text-xs ${
                            area.is_active ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"
                          }`}
                          onClick={() => handleAreaToggle(area.id, area.is_active)}
                          disabled={updateArea.isPending}
                        >
                          {area.is_active ? (
                            <>
                              <X className="h-3.5 w-3.5" /> Disable
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" /> Enable
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleAreaDelete(area.id)}
                          disabled={deleteArea.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: Priority & Rules Documentation */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="h-4 w-4 text-primary" /> Delivery-Charge Priority Logic
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The server evaluates delivery charges using the following strict hierarchy to ensure accurate pricing:
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">
                1
              </span>
              Per-Order Override
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              If an admin/doctor manually overrides the delivery fee on a specific order in Admin → Orders, that explicit adjustment always wins.
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">
                2
              </span>
              Selected Area / Zone
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              If the patient selected an active delivery area at checkout, the area's configured charge applies. The area's free threshold overrides the global threshold.
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">
                3
              </span>
              Global / Default Charge
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              If no area was chosen (or no area matched), the clinic-wide default delivery charge applies, subject to the store free-delivery threshold.
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">
                4
              </span>
              Rs. 0 (Disabled / Threshold)
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              If delivery charges are disabled globally or the order subtotal reaches the applicable free-delivery threshold, the charge is Rs. 0.
            </p>
          </div>
        </div>
      </section>

      {/* Add / Edit Area Modal Dialog */}
      {areaForm && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) closeAreaForm();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingAreaId ? "Edit Delivery Area" : "Add Delivery Area"}</DialogTitle>
              <DialogDescription>
                Configure zone name, delivery fee, and optional free-delivery threshold.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Area / Zone name *
                </label>
                <Input
                  value={areaDraft.name}
                  onChange={(e) => setAreaDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Gulshan, DHA, Nazimabad, North Karachi"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Delivery charge (Rs.) *
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={areaDraft.charge}
                    onChange={(e) => setAreaDraft((p) => ({ ...p, charge: e.target.value }))}
                    placeholder="e.g. 250"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Free over (Rs.) <span className="text-muted-foreground/70">— optional</span>
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={areaDraft.threshold}
                    onChange={(e) => setAreaDraft((p) => ({ ...p, threshold: e.target.value }))}
                    placeholder="Empty = default"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Delivery note <span className="text-muted-foreground/70">— optional</span>
                </label>
                <Textarea
                  rows={2}
                  value={areaDraft.note}
                  onChange={(e) => setAreaDraft((p) => ({ ...p, note: e.target.value }))}
                  placeholder="e.g. Same-day delivery available for this sector"
                />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <span className="text-xs font-medium text-muted-foreground">
                    {areaDraft.active ? "Active" : "Inactive"}
                  </span>
                  <Switch
                    checked={areaDraft.active}
                    onCheckedChange={(v) => setAreaDraft((p) => ({ ...p, active: v }))}
                  />
                </label>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={closeAreaForm}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveArea}
                    disabled={
                      createArea.isPending || updateArea.isPending || !areaDraft.name.trim()
                    }
                  >
                    {createArea.isPending || updateArea.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {editingAreaId ? "Save Changes" : "Add Area"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
