import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2, Minus, Plus, Trash2, ShoppingCart, ArrowLeft, PackageX } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { usePublishedProducts } from "@/hooks/queries/useContent";
import { todayInClinic } from "@/lib/clinic";
import { productEffectivePrice } from "@/lib/product-offer-types";
import type { Product } from "@/lib/admin-data";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — Dr. Naseem Ahmed Khan" },
      { name: "description", content: "Review your cart and proceed to checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const cart = useCart();
  const router = useRouter();
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

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/shop"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to shop
          </Link>

          <h1 className="mt-3 font-display text-3xl font-bold text-foreground">Your Cart</h1>

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
            <div className="mt-6 space-y-3">
              {lines.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"
                >
                  <Link
                    to="/product/$productId"
                    params={{ productId: product.id }}
                    className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/product/$productId"
                      params={{ productId: product.id }}
                      className="text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {product.name}
                    </Link>
                    <div className="mt-0.5 text-sm font-medium text-primary">
                      Rs. {productEffectivePrice(product, today).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex h-9 items-center gap-1 rounded-xl border border-border bg-background px-1">
                    <button
                      type="button"
                      onClick={() => cart.updateQuantity(product.id, quantity - 1)}
                      aria-label="Decrease quantity"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-foreground">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.updateQuantity(product.id, quantity + 1)}
                      aria-label="Increase quantity"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="w-20 text-right text-sm font-bold text-foreground">
                    Rs. {(productEffectivePrice(product, today) * quantity).toLocaleString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => cart.remove(product.id)}
                    aria-label="Remove from cart"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <div className="mt-6 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-lg font-bold text-foreground">
                    Rs. {subtotal.toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Delivery charges and final total are confirmed by the clinic after your payment is
                  verified.
                </p>
                <Button
                  className="mt-4 w-full gap-2"
                  size="lg"
                  onClick={() => router.navigate({ to: "/checkout" })}
                >
                  <ShoppingCart className="h-4 w-4" /> Proceed to Checkout
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
