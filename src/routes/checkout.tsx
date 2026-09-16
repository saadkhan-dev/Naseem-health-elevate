import { useEffect, useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  ShoppingBag,
  PackageX,
  AlertTriangle,
} from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/lib/cart";
import { usePublishedProducts } from "@/hooks/queries/useContent";
import { useActiveDeliveryAreas, useStoreSettings } from "@/hooks/queries/useShop";
import { useAuth } from "@/hooks/useAuth";
import { todayInClinic } from "@/lib/clinic";
import { productEffectivePrice, isProductOrderable } from "@/lib/product-offer-types";
import {
  DEFAULT_STORE_SETTINGS,
  deliveryChargeLabel,
  productDeliveryLabel,
  resolveDeliveryCharge,
} from "@/lib/delivery";
import { OrderPaymentStep } from "@/components/site/OrderPaymentStep";
import { useScrollToSuccess } from "@/hooks/useScrollToSuccess";
import { useMyOrders } from "@/hooks/queries/usePatient";
import { useFormDraft } from "@/hooks/useFormDraft";
import {
  clearPendingOrderHint,
  loadPendingOrderHint,
  savePendingOrderHint,
  type PendingOrderHint,
} from "@/lib/pending-order";
import { placeOrder } from "@/lib/admin-data";
import type { PatientOrder } from "@/lib/patient-data";
import type { Product } from "@/lib/admin-data";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Checkout | Rahat Homeo Physio Clinic" },
    ],
  }),
  component: CheckoutPage,
});

function isDeliveryDraftMeaningful(v: {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  areaId: string | null;
}): boolean {
  return (
    v.areaId != null ||
    [v.name, v.phone, v.email, v.address, v.notes].some((s) => s.trim().length > 0)
  );
}

/** An order still needs the patient to complete payment (server-side status). */
function isOrderAwaitingPayment(o: PatientOrder): boolean {
  return (
    (o.payment_status === "payment_pending" || o.payment_status === "payment_failed") &&
    o.status !== "cancelled"
  );
}

function matchesHint(o: PatientOrder, hint: PendingOrderHint | null): boolean {
  if (!hint) return true;
  if (hint.orderNo && o.order_no) return o.order_no === hint.orderNo;
  if (hint.orderId) return o.id === hint.orderId;
  return true;
}

function CheckoutPage() {
  const cart = useCart();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { data: products, isLoading } = usePublishedProducts();
  const { data: storeSettings } = useStoreSettings();
  const { data: deliveryAreas } = useActiveDeliveryAreas();
  const today = todayInClinic();

  const deliveryDraft = useFormDraft(
    "checkout:delivery",
    {
      name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      email: "",
      address: "",
      notes: "",
      areaId: null as string | null,
    },
    { isMeaningful: (v) => isDeliveryDraftMeaningful(v) },
  );
  const { name, phone, email, address, notes } = deliveryDraft.value;
  const selectedAreaId = deliveryDraft.value.areaId;
  const selectedArea = deliveryAreas?.find((a) => a.id === selectedAreaId) ?? null;

  // Prefill the contact fields from the signed-in patient's profile, but never
  // overwrite a restored draft or anything the patient has typed.
  useEffect(() => {
    if (profile?.full_name && !deliveryDraft.value.name) {
      deliveryDraft.update({ name: profile.full_name });
    }
    if (profile?.phone && !deliveryDraft.value.phone) {
      deliveryDraft.update({ phone: profile.phone });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.full_name, profile?.phone]);

  const [formError, setFormError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderHint, setOrderHint] = useState<PendingOrderHint | null>(null);

  const [placed, setPlaced] = useState<{
    orderId: string | null;
    orderNo: string | null;
    subtotal: number;
    deliveryCharge: number;
    total: number | null;
    deliveryAreaName: string | null;
  } | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const successRef = useScrollToSuccess<HTMLDivElement>(!!placed);

  // Recovery after a refresh: find any order the patient still needs to pay for.
  const { data: myOrders } = useMyOrders(!!user);

  useEffect(() => {
    setOrderHint(loadPendingOrderHint());
  }, []);

  const signedInPendingOrder: PatientOrder | undefined = user
    ? ((orderHint?.orderId ? myOrders?.find((o) => o.id === orderHint.orderId) : undefined) ??
      myOrders?.find((o) => isOrderAwaitingPayment(o) && matchesHint(o, orderHint)))
    : undefined;
  const recoveredOrder = user
    ? (myOrders?.find(isOrderAwaitingPayment) ?? signedInPendingOrder)
    : undefined;

  // Drop the local hint once the clinic no longer has an unpaid order.
  useEffect(() => {
    if (user && orderHint && myOrders && !myOrders.some(isOrderAwaitingPayment)) {
      clearPendingOrderHint();
      setOrderHint(null);
    }
  }, [user, orderHint, myOrders]);

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const lines = cart.items
    .map((item) => {
      const product = byId.get(item.productId);
      return product ? { product, quantity: item.quantity } : null;
    })
    .filter((l): l is { product: Product; quantity: number } => l !== null);

  const subtotal = lines.reduce(
    (sum, l) => sum + productEffectivePrice(l.product, today) * l.quantity,
    0,
  );
  const settings = storeSettings ?? DEFAULT_STORE_SETTINGS;
  const deliveryCharge =
    selectedAreaId != null && deliveryAreas != null
      ? resolveDeliveryCharge(settings, subtotal, deliveryAreas, selectedAreaId)
      : resolveDeliveryCharge(settings, subtotal);
  const total = subtotal + deliveryCharge;

  const stockProblem = lines.find(
    (l) =>
      !isProductOrderable(l.product) ||
      (typeof l.product.stock_quantity === "number" && l.quantity > l.product.stock_quantity),
  );
  const stockBlocked = !!stockProblem;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (lines.length === 0) {
      setFormError("Your cart is empty.");
      return;
    }
    if (stockProblem) {
      setFormError(
        `"${stockProblem.product.name}" is out of stock or exceeds available stock. Adjust your cart to continue.`,
      );
      return;
    }
    setPlacing(true);
    try {
      const result = await placeOrder({
        items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        name,
        phone,
        email: email || undefined,
        address,
        notes: notes || undefined,
        deliveryAreaId: selectedAreaId,
      });
      if (result.error) {
        setFormError(result.error);
        setPlacing(false);
        return;
      }
      // The server is the source of truth for the final snapshot. The order is
      // stored as payment_pending — it is NOT confirmed until the clinic
      // verifies the payment server-side.
      const orderSubtotal = typeof result.subtotal === "number" ? result.subtotal : subtotal;
      const orderDelivery =
        typeof result.deliveryCharge === "number"
          ? result.deliveryCharge
          : Math.max(0, (typeof result.total === "number" ? result.total : total) - orderSubtotal);
      setPlaced({
        orderId: result.orderId ?? null,
        orderNo: result.orderNo ?? null,
        subtotal: orderSubtotal,
        deliveryCharge: orderDelivery,
        total: typeof result.total === "number" ? result.total : total,
        deliveryAreaName: result.deliveryAreaName ?? null,
      });
      // Remember the order so a refresh can send the patient straight back to
      // this same payment step instead of creating a duplicate order.
      savePendingOrderHint({
        orderId: result.orderId ?? null,
        orderNo: result.orderNo ?? null,
        total: typeof result.total === "number" ? result.total : total,
      });
      setPaymentSubmitted(false);
      // The cart stays intact until the payment proof is submitted, so a
      // failed/cancelled payment never loses the patient's items.
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not place your order.");
      setPlacing(false);
    }
  }

  if (placed) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="px-4 py-12 md:px-8">
          <div className="mx-auto max-w-2xl">
            <Link
              to="/shop"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Continue shopping
            </Link>

            <div
              ref={successRef}
              className="mt-6 rounded-3xl border border-border bg-card p-8 text-center shadow-soft"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold text-foreground">
                {paymentSubmitted
                  ? "Payment Submitted — Awaiting Verification"
                  : "Order Received — Payment Pending"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {paymentSubmitted ? (
                  <>
                    Your payment proof for order{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {placed.orderNo}
                    </span>{" "}
                    has been received. The clinic verifies it manually — once verified, your order
                    will be confirmed.
                  </>
                ) : (
                  <>
                    Your order{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {placed.orderNo}
                    </span>{" "}
                    has been received but is{" "}
                    <span className="font-semibold text-foreground">not yet confirmed</span>.
                    Complete the payment proof below — the clinic confirms the order only after
                    verifying your payment.
                  </>
                )}
              </p>

              <div className="mx-auto mt-5 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
                <Row label="Order ID" value={placed.orderNo ?? "—"} mono />
                <Row label="Product Price" value={`Rs. ${placed.subtotal.toLocaleString()}`} />
                <Row
                  label={`Delivery — ${placed.deliveryAreaName ?? "—"}`}
                  value={deliveryChargeLabel(placed.deliveryCharge)}
                />
                <div className="border-t border-border/70 pt-2">
                  <Row label="Grand Total" value={`Rs. ${(placed.total ?? 0).toLocaleString()}`} />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft">
              <OrderPaymentStep
                orderId={placed.orderId ?? undefined}
                orderNo={placed.orderNo}
                amount={placed.total ?? 0}
                signedIn={!!user}
                phone={phone}
                email={email}
                onPaymentSubmitted={() => {
                  cart.clear();
                  clearPendingOrderHint();
                  deliveryDraft.clearDraft();
                  setPaymentSubmitted(true);
                }}
                onClose={() => router.navigate({ to: "/shop" })}
              />
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const guestRecovery = !user && orderHint?.orderNo ? orderHint : null;
  const recoveryOrderNo = recoveredOrder?.order_no ?? guestRecovery?.orderNo ?? null;
  const recoveryAmount = recoveredOrder?.total ?? guestRecovery?.total ?? 0;
  const showRecovery = !placed && (!!recoveredOrder || !!guestRecovery);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/cart"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to cart
          </Link>

          <h1 className="mt-3 font-display text-3xl font-bold text-foreground">Checkout</h1>

          {showRecovery && (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    You have an order awaiting payment
                  </h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                    Order{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {recoveryOrderNo ?? "—"}
                    </span>{" "}
                    is still waiting for your payment — no need to place it again. Complete the
                    payment proof below to continue.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-amber-200 bg-card p-4">
                <OrderPaymentStep
                  orderId={recoveredOrder?.id}
                  orderNo={recoveryOrderNo}
                  amount={recoveryAmount}
                  signedIn={!!user}
                  phone={phone}
                  email={email}
                  onPaymentSubmitted={() => {
                    cart.clear();
                    clearPendingOrderHint();
                    deliveryDraft.clearDraft();
                    setOrderHint(null);
                  }}
                  onClose={() => router.navigate({ to: "/shop" })}
                />
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center p-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : lines.length === 0 ? (
            <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-14 text-center">
              <PackageX className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Your cart is empty.</p>
              <Link to="/shop">
                <Button>Browse products</Button>
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-5">
              <form
                onSubmit={handleSubmit}
                className="space-y-4 rounded-2xl border border-border bg-card p-6 lg:col-span-3"
              >
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Delivery Details
                </h2>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Full name
                  </label>
                  <Input
                    value={name}
                    autoComplete="name"
                    onChange={(e) => deliveryDraft.update({ name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Phone number
                    </label>
                    <Input
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => deliveryDraft.update({ phone: e.target.value })}
                      placeholder="03xx-xxxxxxx"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Email
                    </label>
                    <Input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => deliveryDraft.update({ email: e.target.value })}
                      placeholder="you@email.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Delivery address
                  </label>
                  <Textarea
                    rows={3}
                    value={address}
                    onChange={(e) => deliveryDraft.update({ address: e.target.value })}
                    placeholder="House, street, area, city…"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Delivery area
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <select
                      value={selectedAreaId ?? ""}
                      onChange={(e) => deliveryDraft.update({ areaId: e.target.value || null })}
                      disabled={placing}
                      className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary"
                    >
                      <option value="">Select area</option>
                      {(deliveryAreas ?? []).map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                    {selectedAreaId && deliveryAreas != null && (
                      <p className="text-xs text-muted-foreground">
                        Delivery charge:{" "}
                        {deliveryChargeLabel(
                          resolveDeliveryCharge(settings, subtotal, deliveryAreas, selectedAreaId),
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Order notes (optional)
                  </label>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => deliveryDraft.update({ notes: e.target.value })}
                    placeholder="Anything we should know about the delivery…"
                  />
                </div>

                {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}

                {stockBlocked && (
                  <p className="text-sm font-medium text-destructive">
                    One or more items are out of stock or exceed available stock. Please adjust your
                    cart before placing the order.
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2"
                  disabled={placing || stockBlocked}
                >
                  {placing && <Loader2 className="h-4 w-4 animate-spin" />}
                  <ShoppingBag className="h-4 w-4" />
                  Place Order — Rs. {total.toLocaleString()}
                </Button>
              </form>

              <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Order Summary
                </h2>
                <div className="mt-4 space-y-3">
                  {lines.map(({ product, quantity }) => (
                    <div key={product.id} className="flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium text-foreground sm:text-sm">
                          {product.name}
                        </div>
                        <div className="text-[13px] text-muted-foreground sm:text-xs">
                          × {quantity}
                        </div>
                        {productDeliveryLabel(product) && (
                          <div className="text-[13px] text-muted-foreground sm:text-xs">
                            {productDeliveryLabel(product)}
                          </div>
                        )}
                      </div>
                      <div className="text-[15px] font-semibold text-foreground sm:text-sm">
                        Rs. {(productEffectivePrice(product, today) * quantity).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-muted-foreground sm:text-sm">Subtotal</span>
                    <span className="text-[15px] font-medium text-foreground sm:text-sm">
                      Rs. {subtotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-muted-foreground sm:text-sm">
                      Delivery {selectedArea ? `— ${selectedArea.name}` : "Charges"}
                    </span>
                    <span className="text-[15px] font-medium text-foreground sm:text-sm">
                      {deliveryChargeLabel(deliveryCharge)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-[15px] font-semibold text-foreground sm:text-sm">
                      Grand Total
                    </span>
                    <span className="text-lg font-bold text-foreground">
                      Rs. {total.toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
                  {settings.delivery_is_active && deliveryCharge === 0
                    ? "Delivery is free on this order. "
                    : ""}
                  After placing the order you'll be guided through the payment (bank transfer or
                  mobile wallet). The clinic verifies your payment before processing the order. Your
                  delivery area and charge are stored with the order snapshot.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={
          mono
            ? "min-w-0 break-words text-right font-mono font-medium text-foreground"
            : "min-w-0 break-words text-right font-medium text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
