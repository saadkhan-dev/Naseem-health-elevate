import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, Package, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMyOrders } from "@/hooks/queries/usePatient";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/patient/orders")({
  component: PatientOrders,
});

const statusStyles: Record<string, string> = {
  placed: "bg-blue-100 text-blue-700",
  processing: "bg-amber-100 text-amber-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function PatientOrders() {
  const { data: orders, isLoading, isError, error } = useMyOrders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track medicines and products ordered from the clinic
        </p>
      </div>

      {isError && <QueryError error={error} />}

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (orders ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <PackageX className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No orders yet. You can order medicines and products from the shop section.
            </p>
          </div>
        ) : (
          (orders ?? []).map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-display font-semibold text-foreground">
                  {o.order_no ?? "Order"}
                </div>
                <Badge className={`capitalize ${statusStyles[o.status] ?? statusStyles.placed}`}>
                  {o.status}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {format(new Date(o.created_at), "MMM d, yyyy, h:mm a")} · Delivers to {o.address}
              </div>
              <div className="mt-3 space-y-1">
                {(o.order_items ?? []).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span className="text-foreground">
                      {item.product_name}{" "}
                      <span className="text-muted-foreground">× {item.quantity}</span>
                    </span>
                    <span className="font-medium text-foreground">
                      Rs. {(Number(item.price) * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Package className="h-4 w-4" /> Total
                </span>
                <span className="text-base font-bold text-foreground">
                  Rs. {Number(o.total).toLocaleString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
