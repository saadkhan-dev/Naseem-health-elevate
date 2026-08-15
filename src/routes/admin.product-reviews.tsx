import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, Star, MessageSquare, Eye, EyeOff } from "lucide-react";
import { useAdminProductReviews, useUpdateProductReview } from "@/hooks/queries/useShop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/product-reviews")({
  component: AdminProductReviews,
});

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function AdminProductReviews() {
  const { data: reviews, isLoading, isError, error } = useAdminProductReviews();
  const updateReview = useUpdateProductReview();

  async function handleStatus(
    id: string,
    status: "pending" | "approved" | "rejected",
    isActive?: boolean,
  ) {
    await updateReview.mutateAsync({ id, status, isActive });
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Product Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Moderate reviews submitted by patients for your products. Approved reviews appear on the
          product pages.
        </p>
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
        ) : (reviews ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No product reviews yet</p>
        ) : (
          (reviews ?? []).map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`capitalize ${statusStyles[r.status] ?? ""}`}>{r.status}</Badge>
                  <span className="text-sm font-medium text-foreground">
                    {r.products?.name ?? "Product"}
                  </span>
                  <span className="flex items-center gap-0.5 text-sm text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < r.rating
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/40"
                        }`}
                      />
                    ))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.profiles?.full_name ?? r.name} ·{" "}
                    {format(new Date(r.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                {!r.is_active && <Badge className="bg-muted text-muted-foreground">Hidden</Badge>}
              </div>
              <p className="mt-2 text-sm text-foreground">{r.comment}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={updateReview.isPending}
                  onClick={() => handleStatus(r.id, "approved", r.is_active)}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600"
                  disabled={updateReview.isPending}
                  onClick={() => handleStatus(r.id, "rejected", r.is_active)}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={updateReview.isPending}
                  onClick={() => handleStatus(r.id, r.status, !r.is_active)}
                >
                  {r.is_active ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> Show
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
