import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2, ArrowLeft, CheckCircle2, ShoppingBag, PackageX } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/lib/cart";
import { usePublishedProducts } from "@/hooks/queries/useContent";
import { submitOrder } from "@/lib/site-extra";
import { useAuth } from "@/hooks/useAuth";
import { todayInClinic } from "@/lib/clinic";
import { productEffectivePrice, isProductOrderable } from "@/lib/product-offer-types";
import { OrderPaymentStep } from "@/components/site/OrderPaymentStep";
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

function CheckoutPage() {
  const cart = useCart();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { data: products, isLoading } = usePublishedProducts();
  const today = todayInClinic();

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

  // Client-side stock guard: block placing when an item is out of stock or the
  // requested quantity exceeds what's available.
  const stockProblem = lines.find(
    (l) =>
      !isProductOrderable(l.product) ||
      (typeof l.product.stock_quantity === "number" && l.quantity > l.product.stock_quantity),
  );
  const stockBlocked = !!stockProblem;

  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [placing, setPlacing] = useState(false);

  const [placed, setPlaced] = useState<{
    orderId: string | null;
    orderNo: string | null;
    total: number | null;
  } | null>(null);
  const [showPayment, setShowPayment] = useState(false);

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
      const result = await submitOrder({
        items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        name,
        phone,
        email: email || undefined,
        address,
        notes: notes || undefined,
      });
      if (result.error) {
        setFormError(result.error);
        setPlacing(false);
        return;
      }
      const orderTotal = typeof result.total === "number" ? result.total : subtotal;
      cart.clear();
      setPlaced({
        orderId: result.orderId ?? null,
        orderNo: result.orderNo ?? null,
        total: orderTotal,
      });
      setShowPayment(true);
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

            <div className="mt-6 rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold text-foreground">
                Order Placed Successfully
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your order{" "}
                <span className="font-mono font-semibold text-foreground">{placed.orderNo}</span>{" "}
                has been received.
              </p>

              <div className="mx-auto mt-5 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
                <Row label="Order ID" value={placed.orderNo ?? "—"} mono />
                <Row label="Amount" value={`Rs. ${(placed.total ?? 0).toLocaleString()}`} />
              </div>
            </div>

            {showPayment && (
              <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft">
                <OrderPaymentStep
                  orderId={placed.orderId ?? undefined}
                  orderNo={placed.orderNo}
                  amount={placed.total ?? 0}
                  signedIn={!!user}
                  phone={phone}
                  email={email}
                  onClose={() => router.navigate({ to: "/shop" })}
                />
              </div>
            )}
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

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
              {/* Delivery form */}
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
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Phone number
                    </label>
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
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
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House, street, area, city…"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Order notes (optional)
                  </label>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
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
                  Place Order — Rs. {subtotal.toLocaleString()}
                </Button>
              </form>

              {/* Order summary */}
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
                      </div>
                      <div className="text-[15px] font-semibold text-foreground sm:text-sm">
                        Rs. {(productEffectivePrice(product, today) * quantity).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[15px] text-muted-foreground sm:text-sm">Subtotal</span>
                  <span className="text-lg font-bold text-foreground">
                    Rs. {subtotal.toLocaleString()}
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
                  After placing the order you'll be guided through the payment (bank transfer or
                  mobile wallet). The clinic verifies your payment before processing the order.
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
