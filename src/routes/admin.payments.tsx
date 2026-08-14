import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2, Save, Video } from "lucide-react";
import {
  useAdminServices,
  useSetVideoPricing,
  useAdminPaymentMethods,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useDeletePaymentMethod,
} from "@/hooks/queries/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import type { PaymentMethod } from "@/lib/payment";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/payments")({
  component: AdminPayments,
});

interface MethodForm {
  name: string;
  description: string;
  instructions: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  iban: string;
  mobile_number: string;
  is_active: boolean;
  sort_order: number;
}

const emptyMethodForm: MethodForm = {
  name: "",
  description: "",
  instructions: "",
  account_holder_name: "",
  bank_name: "",
  account_number: "",
  iban: "",
  mobile_number: "",
  is_active: true,
  sort_order: 0,
};

function AdminPayments() {
  const {
    data: services,
    isLoading: servicesLoading,
    isError: servicesError,
    error,
  } = useAdminServices();
  const {
    data: methods,
    isLoading: methodsLoading,
    isError: methodsError,
    error: methodsErrorData,
  } = useAdminPaymentMethods();
  const setPricing = useSetVideoPricing();
  const createMethod = useCreatePaymentMethod();
  const updateMethod = useUpdatePaymentMethod();
  const deleteMethod = useDeletePaymentMethod();

  const videoService = services?.find(isVideoConsultationService);

  const [priceInput, setPriceInput] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceMsg, setPriceMsg] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState<MethodForm>(emptyMethodForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyMethodForm);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(m: PaymentMethod) {
    setEditing(m);
    setForm({
      name: m.name,
      description: m.description ?? "",
      instructions: m.instructions ?? "",
      account_holder_name: m.account_holder_name ?? "",
      bank_name: m.bank_name ?? "",
      account_number: m.account_number ?? "",
      iban: m.iban ?? "",
      mobile_number: m.mobile_number ?? "",
      is_active: m.is_active,
      sort_order: m.sort_order,
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  async function handleSavePricing() {
    const price = Number(priceInput);
    if (Number.isNaN(price) || price < 0) {
      setPriceMsg("Please enter a valid price.");
      return;
    }
    setPriceSaving(true);
    setPriceMsg("");
    try {
      const result = await setPricing.mutateAsync(price);
      setPriceMsg(result.error ? result.error : `Video consultation price saved: Rs. ${price}`);
    } catch (e) {
      setPriceMsg(e instanceof Error ? e.message : "Could not save the price.");
    } finally {
      setPriceSaving(false);
    }
  }

  async function handleSaveMethod() {
    const result = editing
      ? await updateMethod.mutateAsync({ id: editing.id, data: form })
      : await createMethod.mutateAsync(form);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setSaveError(null);
    setDialogOpen(false);
  }

  async function handleDeleteMethod(id: string) {
    const result = await deleteMethod.mutateAsync(id);
    if (result.error) setListError(result.error);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Video consultation pricing and payment methods
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Payment Method
        </Button>
      </div>

      {(servicesError || methodsError) && (
        <div className="mt-4">
          <QueryError error={servicesError ? error : methodsErrorData} />
        </div>
      )}

      {listError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      <div className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Video className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Video Consultation Fee</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The prepaid amount patients see when booking a video consultation. Offers and waivers
              are applied on top of this.
            </p>
            {servicesLoading ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : !videoService ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No Video Consultation service found. Create one on the Services page first.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Price (Rs.)</div>
                  <Input
                    type="number"
                    min={0}
                    value={priceInput || videoService.price}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="h-10 w-40"
                  />
                </div>
                <Button onClick={handleSavePricing} disabled={priceSaving} className="h-10">
                  {priceSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Price
                </Button>
                {priceMsg && <p className="text-sm text-muted-foreground">{priceMsg}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Payment Methods</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Methods patients can choose from after booking a video consultation, with the account
          details shown for each.
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {methodsLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : methods?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No payment methods yet — add one to let patients pay for video consultations.
          </p>
        ) : (
          methods?.map((m) => (
            <div key={m.id} className="rounded-xl border bg-card px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">
                    {m.name}
                    {!m.is_active && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        inactive
                      </span>
                    )}
                  </div>
                  {m.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{m.description}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => handleDeleteMethod(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(m.account_holder_name ||
                m.bank_name ||
                m.account_number ||
                m.iban ||
                m.mobile_number) && (
                <div className="mt-3 grid gap-1 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground sm:grid-cols-2">
                  {m.account_holder_name && (
                    <span>
                      Account holder: <b className="text-foreground">{m.account_holder_name}</b>
                    </span>
                  )}
                  {m.bank_name && (
                    <span>
                      Bank: <b className="text-foreground">{m.bank_name}</b>
                    </span>
                  )}
                  {m.account_number && (
                    <span>
                      Account no.: <b className="font-mono text-foreground">{m.account_number}</b>
                    </span>
                  )}
                  {m.iban && (
                    <span>
                      IBAN: <b className="font-mono text-foreground">{m.iban}</b>
                    </span>
                  )}
                  {m.mobile_number && (
                    <span>
                      Mobile: <b className="font-mono text-foreground">{m.mobile_number}</b>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Payment Method" : "Add Payment Method"}</DialogTitle>
            <DialogDescription>
              Name + instructions the patient sees, and optional account details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Bank Transfer"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short caption shown next to the method"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Instructions</label>
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="Steps the patient follows to pay, e.g. send the amount to the account below and note the reference."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Account Holder</label>
                <Input
                  value={form.account_holder_name}
                  onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Bank</label>
                <Input
                  value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Account Number</label>
                <Input
                  value={form.account_number}
                  onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">IBAN</label>
                <Input
                  value={form.iban}
                  onChange={(e) => setForm({ ...form, iban: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-foreground">Mobile Number</label>
                <Input
                  value={form.mobile_number}
                  onChange={(e) => setForm({ ...form, mobile_number: e.target.value })}
                  placeholder="For methods like JazzCash / Easypaisa"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Active</div>
                <div className="text-xs text-muted-foreground">Show this method to patients</div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          {saveError && <p className="text-sm font-medium text-destructive">{saveError}</p>}
          <DialogFooter className="shrink-0 -mx-6 -mb-6 gap-2 border-t bg-background px-6 py-4 sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSaveMethod}
              disabled={createMethod.isPending || updateMethod.isPending}
            >
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
