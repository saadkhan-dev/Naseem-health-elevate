import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Loader2,
  Package,
  PackageX,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  MessageSquare,
  X,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMyOrders, useSubmitOrderRequest } from "@/hooks/queries/usePatient";
import type { PatientOrder } from "@/lib/patient-data";
import { QueryError } from "@/components/admin/QueryError";
import { cn } from "@/lib/utils";

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

const requestKindStyles: Record<string, string> = {
  query: "bg-sky-100 text-sky-700",
  cancel: "bg-red-100 text-red-700",
  return: "bg-orange-100 text-orange-700",
};

function PatientOrders() {
  const { data: orders, isLoading, isError, error } = useMyOrders();
  const submitRequest = useSubmitOrderRequest();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [requestFor, setRequestFor] = useState<{
    orderId: string;
    kind: "query" | "cancel" | "return";
  } | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestFor) return;
    setRequestError("");
    try {
      const result = await submitRequest.mutateAsync({
        orderId: requestFor.orderId,
        kind: requestFor.kind,
        message: requestMessage,
      });
      if (result.error) {
        setRequestError(result.error);
        return;
      }
      setRequestFor(null);
      setRequestMessage("");
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Could not submit your request.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track medicines and products ordered from the clinic. Cancellation or return requests are
          reviewed by the clinic.
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
            <OrderCard
              key={o.id}
              order={o}
              expanded={!!expanded[o.id]}
              onToggle={() => toggle(o.id)}
              requestFor={requestFor}
              requestMessage={requestMessage}
              setRequestMessage={setRequestMessage}
              requestError={requestError}
              submitting={submitRequest.isPending}
              onRequest={(kind) => {
                setRequestError("");
                setRequestFor({ orderId: o.id, kind });
              }}
              onCancelRequest={() => setRequestFor(null)}
              onSubmitRequest={handleSubmitRequest}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: PatientOrder;
  expanded: boolean;
  onToggle: () => void;
  requestFor: { orderId: string; kind: "query" | "cancel" | "return" } | null;
  requestMessage: string;
  setRequestMessage: (v: string) => void;
  requestError: string;
  submitting: boolean;
  onRequest: (kind: "query" | "cancel" | "return") => void;
  onCancelRequest: () => void;
  onSubmitRequest: (e: React.FormEvent) => void;
}

function OrderCard({
  order,
  expanded,
  onToggle,
  requestFor,
  requestMessage,
  setRequestMessage,
  requestError,
  submitting,
  onRequest,
  onCancelRequest,
  onSubmitRequest,
}: OrderCardProps) {
  const canCancel = order.status === "placed" || order.status === "processing";
  const canReturn = order.status === "delivered";
  const timeline = (order.status_history ?? []).slice().reverse();

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display font-semibold text-foreground">
          {order.order_no ?? "Order"}
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`capitalize ${statusStyles[order.status] ?? statusStyles.placed}`}>
            {order.status}
          </Badge>
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse order details" : "Expand order details"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {format(new Date(order.created_at), "MMM d, yyyy, h:mm a")} · Delivers to {order.address}
      </div>

      <div className="mt-3 space-y-1">
        {(order.order_items ?? []).map((item, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="text-foreground">
              {item.product_name} <span className="text-muted-foreground">× {item.quantity}</span>
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
          Rs. {Number(order.total).toLocaleString()}
        </span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {timeline.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Order timeline
              </div>
              <ol className="space-y-2">
                {timeline.map((h) => (
                  <li key={h.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full",
                        h.status === order.status ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                    />
                    <span>
                      <span className="font-medium capitalize text-foreground">{h.status}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {format(new Date(h.created_at), "MMM d, h:mm a")}
                      </span>
                      {h.note && (
                        <span className="block text-xs text-muted-foreground">{h.note}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {(order.requests ?? []).length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" /> Your requests
              </div>
              <div className="space-y-2">
                {(order.requests ?? []).map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge className={`capitalize ${requestKindStyles[r.kind] ?? ""}`}>
                        {r.kind === "cancel"
                          ? "Cancellation"
                          : r.kind === "return"
                            ? "Return"
                            : "Query"}
                      </Badge>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                          r.status === "resolved"
                            ? "bg-emerald-100 text-emerald-700"
                            : r.status === "closed"
                              ? "bg-muted text-muted-foreground"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{r.message}</p>
                    {r.admin_notes && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Clinic reply: {r.admin_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {requestFor?.orderId === order.id ? (
            <form
              onSubmit={onSubmitRequest}
              className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {requestFor.kind === "query"
                    ? "Ask about this order"
                    : requestFor.kind === "cancel"
                      ? "Request cancellation"
                      : "Request a return"}
                </span>
                <button
                  type="button"
                  onClick={onCancelRequest}
                  aria-label="Close request form"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Textarea
                rows={3}
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder={
                  requestFor.kind === "query"
                    ? "Your question about this order..."
                    : requestFor.kind === "cancel"
                      ? "Reason for cancelling (e.g. changed my mind)..."
                      : "Reason for returning (e.g. received a damaged item)..."
                }
              />
              {requestError && (
                <p className="text-sm font-medium text-destructive">{requestError}</p>
              )}
              <Button type="submit" size="sm" disabled={submitting || !requestMessage.trim()}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Submit request
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRequest("query")}
                className="gap-1.5"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Ask a question
              </Button>
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600"
                  onClick={() => onRequest("cancel")}
                >
                  Request cancellation
                </Button>
              )}
              {canReturn && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-orange-600"
                  onClick={() => onRequest("return")}
                >
                  Request a return
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
