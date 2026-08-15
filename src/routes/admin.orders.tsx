import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Loader2,
  ShoppingBag,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  CreditCard,
  Banknote,
  Ban,
  Undo2,
  Search,
  X,
  FileImage,
} from "lucide-react";
import {
  useAdminOrders,
  useUpdateOrderStatus,
  useAdminOrderRequests,
  useUpdateOrderRequest,
} from "@/hooks/queries/useAdminExtra";
import { useSetOrderPaymentStatus } from "@/hooks/queries/useShop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { staffSupabase } from "@/lib/supabase";
import { QueryError } from "@/components/admin/QueryError";
import type { AdminOrder } from "@/lib/admin-extra";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrders,
});

const statusStyles: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  confirmed: "bg-amber-100 text-amber-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const paymentStatusStyles: Record<string, string> = {
  payment_pending: "bg-amber-100 text-amber-700",
  payment_submitted: "bg-sky-100 text-sky-700",
  payment_verified: "bg-green-100 text-green-700",
  payment_failed: "bg-red-100 text-red-700",
  refunded: "bg-slate-100 text-slate-600",
  waived: "bg-emerald-100 text-emerald-700",
};

const paymentLabels: Record<string, string> = {
  payment_pending: "Payment pending",
  payment_submitted: "Payment submitted",
  payment_verified: "Payment verified",
  payment_failed: "Payment failed",
  refunded: "Refunded",
  waived: "Fee waived",
};

const requestKindStyles: Record<string, string> = {
  query: "bg-sky-100 text-sky-700",
  cancel: "bg-red-100 text-red-700",
  return: "bg-orange-100 text-orange-700",
  complaint: "bg-purple-100 text-purple-700",
  replacement: "bg-teal-100 text-teal-700",
};

const requestKindLabels: Record<string, string> = {
  query: "Query",
  cancel: "Cancellation",
  return: "Return",
  complaint: "Complaint",
  replacement: "Replacement",
};

function AdminOrders() {
  const { data: orders, isLoading, isError, error } = useAdminOrders();
  const updateStatus = useUpdateOrderStatus();
  const setPayment = useSetOrderPaymentStatus();
  const { data: requests, isLoading: reqLoading } = useAdminOrderRequests();
  const updateRequest = useUpdateOrderRequest();
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Search + filters for the "All orders" list.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const [receiptOrder, setReceiptOrder] = useState<AdminOrder | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayStart = dayStart(now);
    const last7 = todayStart - 6 * 86400000;
    const last30 = todayStart - 29 * 86400000;

    return (orders ?? []).filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
      if (dateFilter === "today" && dayStart(new Date(o.created_at)) !== todayStart) return false;
      if (dateFilter === "7" && dayStart(new Date(o.created_at)) < last7) return false;
      if (dateFilter === "30" && dayStart(new Date(o.created_at)) < last30) return false;
      if (!q) return true;
      return (
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.phone ?? "").toLowerCase().includes(q) ||
        (o.order_no ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, paymentFilter, dateFilter]);

  async function handleOpenReceipt(o: AdminOrder) {
    setReceiptOrder(o);
    setReceiptUrl(null);
    setReceiptLoading(true);
    try {
      const { data } = await staffSupabase.storage
        .from("payment-receipts")
        .createSignedUrl(o.payment_receipt_url ?? "", 300);
      setReceiptUrl(data?.signedUrl ?? null);
    } finally {
      setReceiptLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setMessage("");
    const result = await updateStatus.mutateAsync({ id, status: status as never });
    if (result.error) setMessage(result.error);
  }

  async function handlePaymentStatus(
    orderId: string,
    status: "payment_verified" | "payment_failed" | "refunded" | "waived",
  ) {
    setMessage("");
    const result = await setPayment.mutateAsync({ orderId, status });
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
                      {requestKindLabels[r.kind] ?? r.kind}
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

        {/* Search + filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by patient name, phone or Order ID…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-40 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["pending", "confirmed", "shipped", "delivered", "cancelled"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-10 w-44 text-xs">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              {Object.entries(paymentLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-10 w-40 text-xs">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 space-y-3">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No orders match your search or filters.
            </p>
          ) : (
            filteredOrders.map((o) => (
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
                      className={`capitalize ${statusStyles[o.status] ?? statusStyles.pending}`}
                    >
                      {o.status}
                    </Badge>
                    <Badge
                      className={`capitalize ${
                        paymentStatusStyles[o.payment_status] ?? paymentStatusStyles.payment_pending
                      }`}
                    >
                      {paymentLabels[o.payment_status] ?? o.payment_status}
                    </Badge>
                    <Select value={o.status} onValueChange={(v) => handleStatusChange(o.id, v)}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["pending", "confirmed", "shipped", "delivered", "cancelled"].map((s) => (
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
                <OrderPaymentBlock
                  order={o}
                  onStatus={handlePaymentStatus}
                  busy={setPayment.isPending}
                  onViewReceipt={handleOpenReceipt}
                />
                {o.notes ? (
                  <div className="mt-2 text-xs text-muted-foreground">Notes: {o.notes}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Receipt preview modal */}
      <Dialog
        open={!!receiptOrder}
        onOpenChange={(open) => {
          if (!open) setReceiptOrder(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Payment receipt
              {receiptOrder?.order_no ? ` — ${receiptOrder.order_no}` : ""}
            </DialogTitle>
            <DialogDescription>
              Receipt uploaded by {receiptOrder?.payment_payer_name ?? "the customer"}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
            {receiptLoading ? (
              <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : receiptUrl ? (
              <img
                src={receiptUrl}
                alt="Payment receipt"
                className="max-h-[70vh] w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground">
                <X className="h-6 w-6" />
                Could not load the receipt.
              </div>
            )}
          </div>
          {receiptUrl && (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderPaymentBlock({
  order,
  onStatus,
  busy,
  onViewReceipt,
}: {
  order: AdminOrder;
  onStatus: (
    orderId: string,
    status: "payment_verified" | "payment_failed" | "refunded" | "waived",
  ) => void;
  busy: boolean;
  onViewReceipt: (o: AdminOrder) => void;
}) {
  const submitted = order.payment_status === "payment_submitted";

  if (order.payment_status === "payment_pending" && !order.payment_reference) {
    return (
      <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <CreditCard className="mr-1 inline h-3.5 w-3.5" /> No payment submitted yet.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
        <span className="inline-flex items-center gap-1">
          <Banknote className="h-3.5 w-3.5 text-primary" />
          Amount:{" "}
          <span className="font-semibold">
            Rs. {Number(order.payment_amount ?? order.total).toLocaleString()}
          </span>
        </span>
        {order.payment_method && (
          <span>
            Method: <span className="font-medium capitalize">{order.payment_method}</span>
          </span>
        )}
        {order.payment_payer_name && (
          <span>
            Payer: <span className="font-medium">{order.payment_payer_name}</span>
          </span>
        )}
        {order.payment_payer_phone && (
          <span>
            Payer phone: <span className="font-medium">{order.payment_payer_phone}</span>
          </span>
        )}
        {order.payment_payer_email && (
          <span>
            Payer email: <span className="font-medium">{order.payment_payer_email}</span>
          </span>
        )}
        {order.payment_reference && (
          <span>
            Ref: <span className="font-mono font-medium">{order.payment_reference}</span>
          </span>
        )}
        {order.payment_submitted_at && (
          <span>
            Submitted:{" "}
            <span className="font-medium">
              {format(new Date(order.payment_submitted_at), "MMM d, h:mm a")}
            </span>
          </span>
        )}
        {order.payment_verified_at && (
          <span>
            Verified:{" "}
            <span className="font-medium">
              {format(new Date(order.payment_verified_at), "MMM d, h:mm a")}
            </span>
          </span>
        )}
        {order.payment_receipt_url && (
          <button
            type="button"
            onClick={() => onViewReceipt(order)}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <FileImage className="h-3 w-3" /> Receipt
          </button>
        )}
      </div>
      {submitted && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => onStatus(order.id, "payment_verified")}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Verify payment
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-red-600"
            onClick={() => onStatus(order.id, "payment_failed")}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
            Mark failed
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-slate-600"
            onClick={() => onStatus(order.id, "refunded")}
            disabled={busy}
          >
            <Undo2 className="h-3.5 w-3.5" /> Refund
          </Button>
        </div>
      )}
      {order.payment_status === "payment_pending" && order.payment_reference && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-emerald-700"
            onClick={() => onStatus(order.id, "waived")}
            disabled={busy}
          >
            <CreditCard className="h-3.5 w-3.5" /> Waive fee
          </Button>
        </div>
      )}
    </div>
  );
}
