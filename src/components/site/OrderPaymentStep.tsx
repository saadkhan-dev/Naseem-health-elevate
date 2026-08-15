import * as React from "react";
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Wallet,
  Upload,
  X,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  usePaymentMethods,
  useSubmitOrderPayment,
  useSubmitGuestOrderPayment,
  useSubmitGuestOrderReceipt,
} from "@/hooks/queries/useShop";
import { PAYMENT_STATUS_LABELS } from "@/lib/payment";

interface OrderPaymentStepProps {
  /** Internal order id (signed-in patient path). */
  orderId?: string;
  /** Patient-facing Order ID (e.g. ORD-7K4M92). */
  orderNo: string | null;
  amount: number;
  /** When true the order was fully waived — no payment is needed. */
  isWaived?: boolean;
  /** Contact details from checkout — used for the guest ownership check. */
  phone?: string;
  email?: string;
  /** True when the customer is signed in (orderId path). */
  signedIn?: boolean;
  onClose: () => void;
}

/**
 * Prepaid product order payment step, shown right after the customer places an
 * order. The customer picks a bank/wallet method, follows the clinic's
 * instructions and submits their transaction/reference ID (or a receipt
 * screenshot). The order stays in "payment_pending" until the clinic verifies
 * the payment manually.
 *
 * Signed-in patients submit by order id (ownership enforced server-side);
 * guests submit by Order ID + the phone/email used at checkout.
 */
export function OrderPaymentStep({
  orderId,
  orderNo,
  amount,
  isWaived = false,
  phone,
  email,
  signedIn = false,
  onClose,
}: OrderPaymentStepProps) {
  const { data: methods, isLoading: methodsLoading } = usePaymentMethods();
  const submitOwn = useSubmitOrderPayment();
  const submitGuest = useSubmitGuestOrderPayment();
  const submitReceipt = useSubmitGuestOrderReceipt();

  const [verificationMode, setVerificationMode] = React.useState<"transaction" | "receipt">(
    "transaction",
  );
  const [methodId, setMethodId] = React.useState<string>();
  const [reference, setReference] = React.useState("");
  const [payerName, setPayerName] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [done, setDone] = React.useState(false);

  const [guestId, setGuestId] = React.useState(orderNo ?? "");
  const [guestPhone, setGuestPhone] = React.useState(phone ?? "");
  const [guestEmail, setGuestEmail] = React.useState(email ?? "");
  const [guestFile, setGuestFile] = React.useState<File>();
  const [guestPreview, setGuestPreview] = React.useState<string>();
  const [guestError, setGuestError] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const selectedMethod = methods?.find((m) => m.id === methodId);

  React.useEffect(() => {
    return () => {
      if (guestPreview) URL.revokeObjectURL(guestPreview);
    };
  }, [guestPreview]);

  function pickReceiptFile(f: File) {
    setGuestError("");
    if (!["image/jpeg", "image/jpg", "image/png"].includes(f.type)) {
      setGuestError("Please choose a JPG, JPEG or PNG receipt image.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setGuestError("Receipt image must be under 5 MB.");
      return;
    }
    setGuestFile(f);
    setGuestPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(new Error("Could not read the receipt image."));
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmitTransaction() {
    setFormError("");
    if (!methodId) {
      setFormError("Please choose a payment method.");
      return;
    }
    if (!reference.trim()) {
      setFormError("Please enter the transaction / reference ID from your payment.");
      return;
    }
    if (!payerName.trim()) {
      setFormError("Please enter the name the payment was made from.");
      return;
    }

    try {
      const result = signedIn && orderId
        ? await submitOwn.mutateAsync({
            orderId,
            methodId,
            reference: reference.trim(),
            payerName: payerName.trim(),
          })
        : await submitGuest.mutateAsync({
            id: guestId.trim(),
            phone: guestPhone,
            email: guestEmail,
            methodId,
            reference: reference.trim(),
            payerName: payerName.trim(),
          });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setDone(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not submit your payment. Try again.");
    }
  }

  async function handleUploadReceipt(e: React.FormEvent) {
    e.preventDefault();
    setGuestError("");

    if (!methodId) {
      setGuestError("Please choose a payment method.");
      return;
    }
    if (!guestFile) {
      setGuestError("Please choose a receipt screenshot (JPG/JPEG/PNG).");
      return;
    }

    try {
      const fileBase64 = await readFileAsBase64(guestFile);
      const res = await submitReceipt.mutateAsync({
        id: guestId.trim(),
        phone: guestPhone,
        email: guestEmail,
        methodId,
        fileName: guestFile.name,
        mimeType: guestFile.type as "image/jpeg" | "image/jpg" | "image/png",
        fileBase64,
        fileSize: guestFile.size,
      });
      if (res.error) {
        setGuestError(res.error);
        return;
      }
      setDone(true);
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : "Could not upload your receipt.");
    }
  }

  const orderRows = (
    <div className="mx-auto mt-3 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
      <Row label="Order ID" value={orderNo ?? "—"} mono />
      <Row label="Amount" value={`Rs. ${amount}`} />
    </div>
  );

  if (isWaived) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
          No Payment Needed
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Your order was fully covered — nothing to pay.
        </p>
        {orderRows}
        <Button className="mt-6" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
          Payment Submitted for Verification
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Thank you! The clinic will verify your payment of{" "}
          <span className="font-semibold text-foreground">Rs. {amount}</span> manually. Your order
          starts processing once it's marked{" "}
          <span className="font-medium text-foreground">
            {PAYMENT_STATUS_LABELS.payment_verified}
          </span>
          .
        </p>

        <div className="mt-5 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
          <Row label="Order ID" value={orderNo ?? "—"} mono />
          <Row label="Amount" value={`Rs. ${amount}`} />
          <Row label="Payment status" value={PAYMENT_STATUS_LABELS.payment_submitted} />
        </div>

        <p className="mt-4 max-w-sm text-xs text-muted-foreground">
          Track your order from{" "}
          <span className="font-medium text-foreground">My Orders</span> in your patient dashboard
          (or keep your Order ID handy — it's also your payment reference).
        </p>

        <Button className="mt-6" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wallet className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
          Complete Your Payment
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Order — <span className="font-bold text-foreground">Rs. {amount}</span>
        </p>
        {orderRows}
      </div>

      {!signedIn && (
        <div className="mx-auto mt-5 w-full max-w-md">
          <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              To verify your payment we need your <span className="font-semibold text-foreground">Order ID</span>{" "}
              (shown above) plus the <span className="font-semibold text-foreground">phone or email</span> you
              used at checkout.
            </span>
          </div>
        </div>
      )}

      <div className="mx-auto mt-6 w-full max-w-md">
        <div className="text-sm font-semibold text-foreground">Payment Verification</div>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setVerificationMode("transaction")}
            className={`rounded-xl px-3 py-2.5 text-center transition-colors ${
              verificationMode === "transaction" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Transaction ID
          </button>
          <button
            type="button"
            onClick={() => setVerificationMode("receipt")}
            className={`rounded-xl px-3 py-2.5 text-center transition-colors ${
              verificationMode === "receipt" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Upload Receipt
          </button>
        </div>
      </div>

      <div className="mx-auto mt-5 w-full max-w-md space-y-4">
        {verificationMode === "transaction" ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            {!signedIn && (
              <div className="grid gap-3">
                <Field label="Order ID">
                  <Input value={guestId} onChange={(e) => setGuestId(e.target.value)} />
                </Field>
                <Field label="Phone / Email (used at checkout)">
                  <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="03xx or you@email.com" />
                </Field>
              </div>
            )}

            <Field label="Payment method">
              {methodsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="grid gap-2">
                  {(methods ?? []).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethodId(m.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                        methodId === m.id
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/40"
                      }`}
                    >
                      <span className="font-semibold">{m.name}</span>
                      {m.description && (
                        <span className="block text-xs text-muted-foreground">{m.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            {selectedMethod?.instructions && (
              <div className="rounded-xl bg-primary-soft px-3 py-2.5 text-xs text-primary">
                {selectedMethod.instructions}
              </div>
            )}

            <Field label="Transaction / Reference ID">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. bank transaction ID or Easypaisa TID"
              />
            </Field>
            <Field label="Name the payment was made from">
              <Input
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="e.g. Muhammad Ali"
              />
            </Field>

            {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}

            <Button
              onClick={handleSubmitTransaction}
              disabled={submitOwn.isPending || submitGuest.isPending}
              className="w-full gap-1.5"
            >
              {(submitOwn.isPending || submitGuest.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Submit payment proof
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleUploadReceipt}
            className="space-y-4 rounded-2xl border border-border bg-card p-5"
          >
            {!signedIn && (
              <div className="grid gap-3">
                <Field label="Order ID">
                  <Input value={guestId} onChange={(e) => setGuestId(e.target.value)} />
                </Field>
                <Field label="Phone / Email (used at checkout)">
                  <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="03xx or you@email.com" />
                </Field>
              </div>
            )}

            <Field label="Payment method">
              {methodsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="grid gap-2">
                  {(methods ?? []).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethodId(m.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                        methodId === m.id
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/40"
                      }`}
                    >
                      <span className="font-semibold">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickReceiptFile(f);
              }}
            />
            {guestPreview ? (
              <div className="relative overflow-hidden rounded-xl border border-border">
                <img src={guestPreview} alt="Receipt preview" className="max-h-52 w-full object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setGuestFile(undefined);
                    setGuestPreview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return undefined;
                    });
                  }}
                  aria-label="Remove receipt"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground transition hover:border-primary/40"
              >
                <Upload className="h-6 w-6" />
                Upload receipt screenshot (JPG/PNG, up to 5 MB)
              </button>
            )}

            {guestError && <p className="text-sm font-medium text-destructive">{guestError}</p>}

            <Button type="submit" disabled={submitReceipt.isPending} className="w-full gap-1.5">
              {submitReceipt.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload receipt
            </Button>
          </form>
        )}

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Your payment is verified manually by the clinic before the order is processed.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono font-medium text-foreground" : "font-medium text-foreground"}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}
