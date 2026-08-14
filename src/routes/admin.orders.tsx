import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, ShoppingBag } from "lucide-react";
import { useAdminOrders, useUpdateOrderStatus } from "@/hooks/queries/useAdminExtra";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrders,
});

const statusStyles: Record<string, string> = {
  placed: "bg-blue-100 text-blue-700",
  processing: "bg-amber-100 text-amber-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function AdminOrders() {
  const { data: orders, isLoading, isError, error } = useAdminOrders();
  const updateStatus = useUpdateOrderStatus();
  const [message, setMessage] = useState("");

  async function handleStatusChange(id: string, status: string) {
    setMessage("");
    const result = await updateStatus.mutateAsync({ id, status: status as never });
    if (result.error) setMessage(result.error);
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Product and medicine orders</p>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (orders ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No orders yet</p>
        ) : (
          (orders ?? []).map((o) => (
            <div key={o.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-foreground">
                  {o.order_no ?? "Order"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {o.name} · {o.phone} · {format(new Date(o.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`capitalize ${statusStyles[o.status] ?? statusStyles.placed}`}>
                    {o.status}
                  </Badge>
                  <Select value={o.status} onValueChange={(v) => handleStatusChange(o.id, v)}>
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["placed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Ship to: {o.address}
                {o.email ? ` · ${o.email}` : ""}
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
                    <span className="font-medium">
                      Rs. {(Number(item.price) * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold text-foreground">
                  Rs. {Number(o.total).toLocaleString()}
                </span>
              </div>
              {o.notes ? (
                <div className="mt-2 text-xs text-muted-foreground">Notes: {o.notes}</div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
