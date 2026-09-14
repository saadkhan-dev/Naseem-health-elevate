import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Info, Loader2, MonitorUp, RefreshCw, Video } from "lucide-react";
import { getLiveKitUsage } from "@/lib/video-call";
import type { LiveKitUsageAllowance } from "@/lib/server/livekit-usage";
import { QueryError } from "@/components/admin/QueryError";
import { cn } from "@/lib/utils";

function clinicDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const SOURCE_BADGES: Record<LiveKitUsageAllowance["source"], { label: string; className: string }> =
  {
    official: { label: "Official", className: "bg-green-100 text-green-700" },
    live: { label: "Live", className: "bg-blue-100 text-blue-700" },
    "app-tracked": { label: "App-tracked (est.)", className: "bg-amber-100 text-amber-700" },
    unavailable: { label: "Unavailable", className: "bg-slate-100 text-slate-600" },
  };

/**
 * Admin "LiveKit Usage" panel — the video-consultation equivalent of the
 * AI-chatbot usage panel. Numbers are deliberately honest:
 *  - WebRTC minutes come from app-tracked `video_session_events` and are
 *    labelled "Estimated — LiveKit official Analytics API unavailable on this
 *    plan."
 *  - Concurrency comes live from the LiveKit REST API.
 *  - Everything else without an official source is shown as "Unavailable"
 *    rather than guessed.
 */
export function LiveKitUsagePanel() {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["livekit-usage"],
    queryFn: getLiveKitUsage,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  const lastRefreshedRef = useRef<number | null>(null);
  if (dataUpdatedAt > 0) lastRefreshedRef.current = dataUpdatedAt;

  const usage = data;
  const isNotConfigured = !!data && !data.configured;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">LiveKit Usage (Video Calls)</h2>
          <p className="text-sm text-muted-foreground">
            {lastRefreshedRef.current
              ? `Updated ${clinicDateTime(new Date(lastRefreshedRef.current).toISOString())} (Pakistan time)`
              : "Plan allowances and live room activity"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {usage?.plan && (
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              Plan: {usage.plan}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {isNotConfigured && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              LiveKit is not configured on the server yet. Set{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                LIVEKIT_URL
              </code>
              ,{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                LIVEKIT_API_KEY
              </code>{" "}
              and{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                LIVEKIT_API_SECRET
              </code>{" "}
              as Cloudflare Workers secrets to start video consultations.
            </div>
          </div>
        </div>
      )}

      {usage?.billingNotes?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {usage.billingNotes.map((note) => (
            <span
              key={note}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground"
            >
              <Info className="h-3.5 w-3.5 shrink-0" />
              {note}
            </span>
          ))}
        </div>
      ) : null}

      {isLoading && !data ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border bg-card py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading LiveKit usage…
        </div>
      ) : (
        data && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <MonitorUp className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold text-foreground">
                      {data.live.activeRooms ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">Active Rooms (live)</div>
                  </div>
                </div>
                {data.live.warning && (
                  <p className="mt-2 text-[11px] text-amber-600" title={data.live.warning}>
                    Live API: {data.live.warning}
                  </p>
                )}
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold text-foreground">
                      {data.live.connectedParticipants ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">Connected (live)</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <Video className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold text-foreground">
                      {formatEstimate(
                        data.allowances.find((a) => a.label === "WebRTC participant minutes")
                          ?.used ?? null,
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">WebRTC minutes this month</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold text-foreground">
                      {formatNumber(
                        data.allowances.find((a) => a.label === "Concurrent participants (live)")
                          ?.used ?? null,
                      )}
                      <span className="text-sm text-muted-foreground">
                        {" "}
                        /{" "}
                        {data.allowances.find((a) => a.label === "Concurrent participants (live)")
                          ?.limit ?? "—"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">Concurrent participants</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-xl border bg-card">
              <div className="border-b px-5 py-4">
                <h3 className="text-sm font-semibold text-foreground">Plan Allowances</h3>
                <p className="text-xs text-muted-foreground">
                  Build (free) plan limits; calendar-month billing
                </p>
              </div>
              <div className="divide-y">
                {data.allowances.map((a) => {
                  const badge = SOURCE_BADGES[a.source];
                  const pct =
                    a.limit != null && a.used != null
                      ? Math.min(100, (a.used / a.limit) * 100)
                      : null;
                  const barColor =
                    pct == null
                      ? "bg-muted"
                      : pct >= 100
                        ? "bg-red-500"
                        : pct >= 80
                          ? "bg-amber-500"
                          : "bg-emerald-500";
                  return (
                    <div key={a.label} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{a.label}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              badge.className,
                            )}
                          >
                            {badge.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {a.used == null ? "Unavailable" : `${formatNumber(a.used)} ${a.unit}`}
                            {a.limit != null && a.used != null
                              ? ` / ${formatNumber(a.limit)} ${a.unit}`
                              : ""}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full", barColor)}
                          style={{ width: `${pct ?? 0}%` }}
                          title={
                            pct == null
                              ? "No source of truth for this metric on the Build plan"
                              : `${pct.toFixed(0)}% used`
                          }
                        />
                      </div>
                      {pct != null && pct >= 80 && (
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <AlertTriangle className="h-3 w-3" />
                          {pct >= 100
                            ? "At / over the plan limit — calls may be blocked or billed."
                            : "Approaching the plan limit (warning at 80%)."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )
      )}
    </section>
  );
}

function formatNumber(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function formatEstimate(value: number | null): string {
  return value == null ? "Unavailable" : formatNumber(value);
}
