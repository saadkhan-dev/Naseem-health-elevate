import type { SupabaseClient } from "@supabase/supabase-js";
import { staffSupabase } from "./supabase";

export const PRODUCT_IMAGE_BUCKET = "product-images";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export interface UploadProductImageResult {
  url?: string;
  error?: string;
}

/**
 * Uploads a product image to the shared `product-images` bucket (admin-only
 * RLS) and returns its PUBLIC URL so patients can render it without a session.
 * Mirrors the existing `patient-documents` client-side upload pattern.
 */
export async function uploadProductImage(
  file: File,
  client: SupabaseClient = staffSupabase,
): Promise<UploadProductImageResult> {
  if (!ALLOWED.has(file.type)) {
    return { error: "Only JPG, PNG, WEBP, GIF or AVIF images are accepted." };
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return { error: "Product images must be under 5 MB." };
  }
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || `product-${Date.now()}`;
  const path = `products/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await client.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data } = client.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

const PUBLIC_PREFIX = (() => {
  try {
    return new URL(
      `${new URL(import.meta.env.VITE_SUPABASE_URL).origin}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`,
    ).toString();
  } catch {
    return "";
  }
})();

/**
 * Best-effort cleanup of uploaded objects that are no longer referenced. Any
 * image whose URL lives in the `product-images` bucket gets removed from
 * storage. Errors are swallowed — orphaned objects are harmless.
 */
export async function deleteStoredProductImages(
  urls: string[],
  client: SupabaseClient = staffSupabase,
): Promise<void> {
  if (!PUBLIC_PREFIX) return;
  const paths = urls
    .filter((u): u is string => typeof u === "string" && u.startsWith(PUBLIC_PREFIX))
    .map((u) => u.slice(PUBLIC_PREFIX.length))
    .filter((p) => p.length > 0);
  if (paths.length === 0) return;
  await client.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .remove(paths)
    .catch(() => {});
}
