import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Tag,
  Upload,
  ArrowUp,
  ArrowDown,
  X,
  ImagePlus,
} from "lucide-react";
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
import { DELIVERY_ESTIMATE_OPTIONS } from "@/lib/delivery";
import { getProductImages, type Product } from "@/lib/admin-data";
import { uploadProductImage, deleteStoredProductImages } from "@/lib/product-images";
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

/** Optional packing/size presets. "Other" lets the admin type a custom value. */
const PACK_SIZE_OPTIONS = [
  "10g",
  "25g",
  "50g",
  "100g",
  "250g",
  "500g",
  "1kg",
  "25ml",
  "50ml",
  "100ml",
  "250ml",
];

const CONDITION_OPTIONS = ["Fresh Condition"];
const OTHER = "__other__";

function isPackPreset(value: string) {
  return PACK_SIZE_OPTIONS.includes(value);
}

function isDeliveryPreset(value: string) {
  return (DELIVERY_ESTIMATE_OPTIONS as readonly string[]).includes(value);
}

function AdminProducts() {
  const { data: products, isLoading, isError, error } = useAdminProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState<string[]>([]);
  const [prevImages, setPrevImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [packSize, setPackSize] = useState("");
  const [packSizeOther, setPackSizeOther] = useState("");
  const [condition, setCondition] = useState("");
  const [conditionOther, setConditionOther] = useState("");
  // Optional estimated delivery time — preset, "Other" (custom) or none.
  const [deliveryEstimate, setDeliveryEstimate] = useState("");
  const [deliveryEstimateOther, setDeliveryEstimateOther] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const today = todayInClinic();

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setImages([]);
    setPrevImages([]);
    setImageUrlInput("");
    setPackSize("");
    setPackSizeOther("");
    setCondition("Fresh Condition");
    setConditionOther("");
    setDeliveryEstimate("");
    setDeliveryEstimateOther("");
    setSaveError(null);
    setDialogOpen(true);
  }

  async function openEdit(p: Product) {
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

    const gallery = await getProductImages(p.id);
    const loadedImages =
      gallery.length > 0 ? gallery.map((g) => g.url) : p.image_url ? [p.image_url] : [];
    setImages(loadedImages);
    setPrevImages(loadedImages);
    setImageUrlInput("");

    const size = p.pack_size?.trim() ?? "";
    if (size && isPackPreset(size)) {
      setPackSize(size);
      setPackSizeOther("");
    } else {
      setPackSize(size ? OTHER : "");
      setPackSizeOther(size);
    }

    const cond = p.product_condition?.trim() ?? "";
    if (cond && CONDITION_OPTIONS.includes(cond)) {
      setCondition(cond);
      setConditionOther("");
    } else {
      setCondition(cond ? OTHER : "");
      setConditionOther(cond);
    }

    const estimate = p.delivery_estimate?.trim() ?? "";
    if (estimate && isDeliveryPreset(estimate)) {
      setDeliveryEstimate(estimate);
      setDeliveryEstimateOther("");
    } else {
      setDeliveryEstimate(estimate ? OTHER : "");
      setDeliveryEstimateOther(estimate);
    }

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

  function addImageUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    setImages((prev) => [...prev, url]);
    setImageUrlInput("");
  }

  async function handlePickImage(file: File | undefined) {
    if (!file) return;
    setSaveError(null);
    setUploadingImage(true);
    try {
      const res = await uploadProductImage(file);
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      if (res.url) setImages((prev) => [...prev, res.url!]);
    } finally {
      setUploadingImage(false);
    }
  }

  function moveImage(index: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const packSizeValue = packSize === OTHER ? packSizeOther.trim() : packSize.trim();
    const conditionValue = condition === OTHER ? conditionOther.trim() : condition.trim();
    const deliveryEstimateValue =
      deliveryEstimate === OTHER ? deliveryEstimateOther.trim() : deliveryEstimate.trim();

    const data = {
      ...form,
      offer_start_date: form.offer_start_date || null,
      offer_end_date: form.offer_end_date || null,
      pack_size: packSizeValue || null,
      product_condition: conditionValue || null,
      delivery_estimate: deliveryEstimateValue || null,
      images,
    };

    const result = editing
      ? await updateProduct.mutateAsync({ id: editing.id, data })
      : await createProduct.mutateAsync(data);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    // Clean up any uploaded objects that are no longer referenced.
    const removed = prevImages.filter((u) => !images.includes(u));
    if (removed.length > 0) {
      deleteStoredProductImages(removed);
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
                <div className="flex min-w-0 items-center gap-4">
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Rs. {productEffectivePrice(p, today)}
                      {offerActive && <span className="ml-1 line-through">Rs. {p.price}</span>}
                      {p.category && <span className="ml-1 capitalize">· {p.category}</span>}
                      {p.pack_size && <span className="ml-1">· {p.pack_size}</span>}
                      {p.delivery_estimate && (
                        <span className="ml-1">· Delivery: {p.delivery_estimate}</span>
                      )}
                      {typeof p.stock_quantity === "number" && (
                        <span className="ml-1">· {p.stock_quantity} in stock</span>
                      )}
                      {!p.in_stock && <span className="ml-1 text-red-600">(out of stock)</span>}
                    </div>
                    {p.offer_is_active && p.discount_price != null && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
                          <span className="text-xs font-medium text-emerald-600">Offer live</span>
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Original price (Rs.)</label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: +e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Product Form</label>
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
            </div>

            {/* Product images — first image is the primary / front image */}
            <div className="rounded-xl border border-border p-4">
              <div className="text-sm font-medium text-foreground">Product images</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The first image is the main product image. Add more for an optional swipe/slider
                gallery on the shop. Use an image URL or upload from your device.
              </p>

              {images.length > 0 && (
                <div className="mt-3 space-y-2">
                  {images.map((url, i) => (
                    <div
                      key={`${i}-${url}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <img
                        src={url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {url}
                      </span>
                      {i === 0 ? (
                        <Badge variant="secondary" className="shrink-0">
                          Primary
                        </Badge>
                      ) : (
                        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                          Image {i + 1}
                        </span>
                      )}
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Move image earlier"
                          disabled={i === 0}
                          onClick={() => moveImage(i, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Move image later"
                          disabled={i === images.length - 1}
                          onClick={() => moveImage(i, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Remove image"
                          className="text-red-600"
                          onClick={() => removeImage(i)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={imageUrlInput}
                  placeholder="Paste an image URL…"
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addImageUrl();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addImageUrl}>
                  <ImagePlus className="h-4 w-4" /> Add URL
                </Button>
              </div>

              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 sm:w-auto"
                  disabled={uploadingImage}
                  asChild
                >
                  <label htmlFor="product-file-input" className="cursor-pointer">
                    {uploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploadingImage ? "Uploading…" : "Upload from device"}
                  </label>
                </Button>
                <input
                  id="product-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="sr-only"
                  disabled={uploadingImage}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    handlePickImage(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {/* Packing / size */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Packing / size{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <select
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
                >
                  <option value="">None</option>
                  {PACK_SIZE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value={OTHER}>Other</option>
                </select>
                {packSize === OTHER && (
                  <Input
                    className="mt-2"
                    value={packSizeOther}
                    placeholder="e.g. 2kg, 30 tablets…"
                    onChange={(e) => setPackSizeOther(e.target.value)}
                  />
                )}
              </div>

              {/* Condition */}
              <div>
                <label className="text-sm font-medium text-foreground">
                  Condition <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
                >
                  <option value="">None</option>
                  {CONDITION_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value={OTHER}>Other</option>
                </select>
                {condition === OTHER && (
                  <Input
                    className="mt-2"
                    value={conditionOther}
                    placeholder="e.g. Slightly expired stock"
                    onChange={(e) => setConditionOther(e.target.value)}
                  />
                )}
              </div>

              {/* Estimated delivery time — shown to patients on shop/product/cart */}
              <div>
                <label className="text-sm font-medium text-foreground">
                  Estimated Delivery{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <select
                  value={deliveryEstimate}
                  onChange={(e) => setDeliveryEstimate(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
                >
                  <option value="">None</option>
                  {DELIVERY_ESTIMATE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value={OTHER}>Custom</option>
                </select>
                {deliveryEstimate === OTHER && (
                  <Input
                    className="mt-2"
                    value={deliveryEstimateOther}
                    placeholder="e.g. Within 24 hours"
                    onChange={(e) => setDeliveryEstimateOther(e.target.value)}
                  />
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Shown to patients on the product page, shop cards, cart and checkout — leave empty
                  to hide it for this product.
                </p>
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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              disabled={createProduct.isPending || updateProduct.isPending || uploadingImage}
            >
              {createProduct.isPending || updateProduct.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editing ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
