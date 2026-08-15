import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2, Tag } from "lucide-react";
import {
  useAdminProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
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
import { Badge } from "@/components/ui/badge";
import { todayInClinic } from "@/lib/clinic";
import {
  productEffectivePrice,
  productDiscountPercent,
  isProductOfferActive,
} from "@/lib/product-offer-types";
import type { Product } from "@/lib/admin-data";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
});

const emptyForm = {
  name: "",
  description: "",
  price: 0,
  category: "",
  discount_price: null as number | null,
  stock_quantity: null as number | null,
  image_url: "",
  in_stock: true,
  offer_is_active: false,
  offer_title: "",
  offer_percent: null as number | null,
  offer_start_date: "",
  offer_end_date: "",
};

function AdminProducts() {
  const { data: products, isLoading, isError, error } = useAdminProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const today = todayInClinic();

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: p.price,
      category: p.category ?? "",
      discount_price: p.discount_price ?? null,
      stock_quantity: p.stock_quantity ?? null,
      image_url: p.image_url ?? "",
      in_stock: p.in_stock,
      offer_is_active: p.offer_is_active,
      offer_title: p.offer_title ?? "",
      offer_percent: p.offer_percent ?? null,
      offer_start_date: p.offer_start_date ?? "",
      offer_end_date: p.offer_end_date ?? "",
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  /** Keep the discount % and discounted price in sync based on the original price. */
  function setDiscountPrice(value: string) {
    const discount_price = value === "" ? null : +value;
    let offer_percent = form.offer_percent;
    if (discount_price != null && form.price > 0 && discount_price <= form.price) {
      offer_percent = Math.round(((form.price - discount_price) / form.price) * 100);
    }
    setForm({ ...form, discount_price, offer_percent });
  }

  function setDiscountPercent(value: string) {
    const offer_percent = value === "" ? null : +value;
    let discount_price = form.discount_price;
    if (offer_percent != null && form.price > 0) {
      discount_price = Math.round(form.price * (1 - offer_percent / 100));
    }
    setForm({ ...form, offer_percent, discount_price });
  }

  async function handleSave() {
    const data = {
      ...form,
      offer_start_date: form.offer_start_date || null,
      offer_end_date: form.offer_end_date || null,
    };
    const result = editing
      ? await updateProduct.mutateAsync({ id: editing.id, data })
      : await createProduct.mutateAsync(data);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setSaveError(null);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    const result = await deleteProduct.mutateAsync(id);
    if (result.error) setListError(result.error);
  }

  const discountPercent = productDiscountPercent({
    price: form.price,
    discount_price: form.discount_price,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your product inventory</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {listError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : products?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No products yet</p>
        ) : (
          products?.map((p) => {
            const offerActive = isProductOfferActive(p, today);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border bg-card px-5 py-4"
              >
                <div className="flex items-center gap-4">
                  {p.image_url && (
                    <img src={p.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  )}
                  <div>
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Rs. {productEffectivePrice(p, today)}
                      {offerActive && <span className="ml-1 line-through">Rs. {p.price}</span>}
                      {p.category && <span className="ml-1 capitalize">· {p.category}</span>}
                      {typeof p.stock_quantity === "number" && (
                        <span className="ml-1">· {p.stock_quantity} in stock</span>
                      )}
                      {!p.in_stock && <span className="ml-1 text-red-600">(out of stock)</span>}
                    </div>
                    {p.offer_is_active && p.discount_price != null && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge className="gap-1 bg-red-50 text-red-600">
                          <Tag className="h-3 w-3" />
                          {p.offer_title?.trim() || `${productDiscountPercent(p) ?? 0}% OFF`}
                          {p.offer_title?.trim() && productDiscountPercent(p) != null && (
                            <span className="font-normal opacity-70">
                              · {productDiscountPercent(p)}% OFF
                            </span>
                          )}
                        </Badge>
                        {offerActive ? (
                          <span className="text-[11px] font-medium text-emerald-600">
                            Offer live
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Scheduled / paused
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => handleDelete(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>Configure the product details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Original price (Rs.)</label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: +e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Category</label>
                <Input
                  value={form.category}
                  placeholder="e.g. Drops, Tablets, Ointment…"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Stock quantity</label>
                <Input
                  type="number"
                  value={form.stock_quantity ?? ""}
                  placeholder="Empty = unlimited"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      stock_quantity: e.target.value === "" ? null : +e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Image URL</label>
                <Input
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
              </div>
            </div>

            {/* Offer / discount */}
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">Offer / discount</div>
                  <div className="text-xs text-muted-foreground">
                    Enable a sale price. Customers pay the discounted price below.
                  </div>
                </div>
                <Switch
                  checked={form.offer_is_active}
                  onCheckedChange={(v) => setForm({ ...form, offer_is_active: v })}
                />
              </div>

              {form.offer_is_active && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Offer price (Rs.)
                      </label>
                      <Input
                        type="number"
                        value={form.discount_price ?? ""}
                        placeholder="e.g. 900"
                        onChange={(e) => setDiscountPrice(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Discount % (optional)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={form.offer_percent ?? ""}
                        placeholder="e.g. 20"
                        onChange={(e) => setDiscountPercent(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Offer label (optional)
                    </label>
                    <Input
                      value={form.offer_title}
                      placeholder='e.g. "Special Offer", "20% OFF", "Ramadan Special"'
                      onChange={(e) => setForm({ ...form, offer_title: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Start date (optional)
                      </label>
                      <Input
                        type="date"
                        value={form.offer_start_date}
                        onChange={(e) => setForm({ ...form, offer_start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        End date (optional)
                      </label>
                      <Input
                        type="date"
                        value={form.offer_end_date}
                        onChange={(e) => setForm({ ...form, offer_end_date: e.target.value })}
                      />
                    </div>
                  </div>

                  {form.discount_price != null && form.discount_price > 0 && (
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      Customers pay{" "}
                      <span className="font-semibold">
                        Rs. {form.discount_price.toLocaleString()}
                      </span>{" "}
                      {discountPercent != null && (
                        <>
                          ( <span className="font-semibold">{discountPercent}% OFF</span> from Rs.{" "}
                          {form.price.toLocaleString()} )
                        </>
                      )}
                    </div>
                  )}
                  {form.discount_price != null &&
                    form.price > 0 &&
                    form.discount_price >= form.price && (
                      <p className="text-xs font-medium text-destructive">
                        Offer price must be lower than the original price.
                      </p>
                    )}
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        offer_is_active: false,
                        discount_price: null,
                        offer_percent: null,
                        offer_title: "",
                        offer_start_date: "",
                        offer_end_date: "",
                      })
                    }
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove offer & restore normal price
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">In stock</div>
                <div className="text-xs text-muted-foreground">
                  Allow customers to order this product
                </div>
              </div>
              <Switch
                checked={form.in_stock}
                onCheckedChange={(v) => setForm({ ...form, in_stock: v })}
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
              onClick={handleSave}
              disabled={createProduct.isPending || updateProduct.isPending}
            >
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
