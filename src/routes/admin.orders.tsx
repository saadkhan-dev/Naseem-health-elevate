import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, ShoppingBag, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import {
  useAdminOrders,
  useUpdateOrderStatus,
  useAdminOrderRequests,
  useUpdateOrderRequest,
} from "@/hooks/queries/useAdminExtra";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

const requestKindStyles: Record<string, string> = {
  query: "bg-sky-100 text-sky-700",
  cancel: "bg-red-100 text-red-700",
  return: "bg-orange-100 text-orange-700",
};

function AdminOrders() {
  const { data: orders, isLoading, isError, error } = useAdminOrders();
  const updateStatus = useUpdateOrderStatus();
  const { data: requests, isLoading: reqLoading } = useAdminOrderRequests();
  const updateRequest = useUpdateOrderRequest();
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function handleStatusChange(id: string, status: string) {
    setMessage("");
    const result = await updateStatus.mutateAsync({ id, status: status as never });
    if (result.error) setMessage(result.error);
  }

  async function handleRequestStatus(id: string, status: string, requestKind: string) {
    setMessage("");
    const result = await updateRequest.mutateAsync({
      id,
      status: status as never,
      adminNotes: notes[id],
    });
    if (result.error) setMessage(result.error);
    if (!result.error) setNotes((prev) => ({ ...prev, [id]: "" }));
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Product and medicine orders. Respond to patient requests (queries, cancellations, returns)
          below.
        </p>
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

      {/* Patient order requests */}
      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" /> Patient requests
          {(requests ?? []).filter((r) => r.status === "new").length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {(requests ?? []).filter((r) => r.status === "new").length} new
            </span>
          )}
        </h2>

        {reqLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (requests ?? []).length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No patient requests yet
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {(requests ?? []).map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`capitalize ${requestKindStyles[r.kind] ?? ""}`}>
                      {r.kind === "cancel"
                        ? "Cancellation"
                        : r.kind === "return"
                          ? "Return"
                          : "Query"}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">
                      {r.patient?.full_name ?? "Patient"} · {r.order?.order_no ?? "Order"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, yyyy, h:mm a")}
                    </span>
                  </div>
                  <Badge
                    className={`capitalize ${
                      r.status === "resolved"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.status === "closed"
                          ? "bg-muted text-muted-foreground"
                          : r.status === "in_progress"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {r.status}
                  </Badge>
                </div>
                <div className="mt-2 text-sm text-foreground">{r.message}</div>
                {r.order && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Order status: {r.order.status} · Total: Rs.{" "}
                    {Number(r.order.total).toLocaleString()}
                  </div>
                )}
                {r.admin_notes && (
                  <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Clinic reply: {r.admin_notes}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Textarea
                    rows={2}
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Reply to the patient…"
                    className="min-h-[42px] flex-1 text-sm"
                  />
                  <Select
                    value={r.status}
                    onValueChange={(v) => handleRequestStatus(r.id, v, r.kind)}
                  >
                    <SelectTrigger className="h-10 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["new", "in_progress", "resolved", "closed"].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => handleRequestStatus(r.id, "resolved", r.kind)}
                    className="gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All orders */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
          <ShoppingBag className="h-4 w-4 text-primary" /> All orders
        </h2>

        <div className="mt-3 space-y-3">
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
                    <Badge
                      className={`capitalize ${statusStyles[o.status] ?? statusStyles.placed}`}
                    >
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
      </section>
    </div>
  );
}
