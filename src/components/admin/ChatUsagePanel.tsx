import { useRef, useState } from "react";
import {
  Ban,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Hash,
  Loader2,
  MessageSquareText,
  RefreshCw,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { useChatUsage } from "@/hooks/queries/useAdmin";
import type { ChatUsageRange, ChatUsageStats } from "@/lib/server/chat-usage";
import { QueryError } from "@/components/admin/QueryError";
import { cn } from "@/lib/utils";

const RANGES: { value: ChatUsageRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-green-100 text-green-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
  rate_limited: { label: "Rate limited", className: "bg-amber-100 text-amber-700" },
  spam: { label: "Blocked", className: "bg-purple-100 text-purple-700" },
};

function clinicDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function StatCard({
  label,
  value,
  Icon,
  color,
  bg,
  title,
}: {
  label: string;
  value: number | string;
  Icon: typeof Users;
  color: string;
  bg: string;
  title?: string;
}) {
  return (
    <div title={title} className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg} ${color}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

export function ChatUsagePanel() {
  const [range, setRange] = useState<ChatUsageRange>("30d");
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } =
    useChatUsage(range);
  const lastRefreshedRef = useRef<number | null>(null);
  if (dataUpdatedAt > 0) lastRefreshedRef.current = dataUpdatedAt;

  const s = data as ChatUsageStats | undefined;

  const totalTokens = (s?.estimatedInputTokens ?? 0) + (s?.estimatedOutputTokens ?? 0);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">AI Chatbot Usage</h2>
          <p className="text-sm text-muted-foreground">
            {lastRefreshedRef.current
              ? `Updated ${new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Karachi",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                }).format(new Date(lastRefreshedRef.current))} (Pakistan time)`
              : "Tracking every chatbot request"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-card p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  range === r.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
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

      {s && !s.ok && !isError && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Chatbot usage tracking isn't set up yet. Run{" "}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
            supabase/chat-usage.sql
          </code>{" "}
          in the Supabase SQL Editor to enable statistics.
        </div>
      )}

      {isLoading && !s ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border bg-card py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading chatbot usage…
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Messages"
              value={s?.total ?? 0}
              Icon={MessageSquareText}
              color="text-blue-600"
              bg="bg-blue-100"
            />
            <StatCard
              label="Today's Messages"
              value={s?.today ?? 0}
              Icon={CalendarDays}
              color="text-cyan-600"
              bg="bg-cyan-100"
            />
            <StatCard
              label="Unique Users"
              value={s?.uniqueUsers ?? 0}
              Icon={Users}
              color="text-purple-600"
              bg="bg-purple-100"
            />
            <StatCard
              label="Successful Responses"
              value={s?.successful ?? 0}
              Icon={CheckCircle2}
              color="text-green-600"
              bg="bg-green-100"
            />
            <StatCard
              label="Failed Requests"
              value={s?.failed ?? 0}
              Icon={XCircle}
              color="text-red-600"
              bg="bg-red-100"
            />
            <StatCard
              label="Rate-Limit Hits"
              value={s?.rateLimited ?? 0}
              Icon={Ban}
              color="text-amber-600"
              bg="bg-amber-100"
            />
            <StatCard
              label="Total Tokens Used"
              value={totalTokens.toLocaleString()}
              Icon={Calculator}
              color="text-indigo-600"
              bg="bg-indigo-100"
            />
            <StatCard
              label="Est. Input Tokens"
              value={(s?.estimatedInputTokens ?? 0).toLocaleString()}
              Icon={Hash}
              color="text-sky-600"
              bg="bg-sky-100"
            />
            <StatCard
              label="Est. Output Tokens"
              value={(s?.estimatedOutputTokens ?? 0).toLocaleString()}
              Icon={Hash}
              color="text-blue-700"
              bg="bg-blue-50"
            />
            <StatCard
              label="Gemini Quota Remaining"
              value="Unavailable"
              Icon={Gauge}
              color="text-amber-600"
              bg="bg-amber-50"
              title="Gemini does not expose a reliable remaining-quota value, so this is not estimated or faked."
            />
            <StatCard
              label="Last 7 Days"
              value={s?.last7Days ?? 0}
              Icon={TrendingUp}
              color="text-teal-600"
              bg="bg-teal-100"
            />
            <StatCard
              label="Last 30 Days"
              value={s?.last30Days ?? 0}
              Icon={TrendingUp}
              color="text-emerald-600"
              bg="bg-emerald-100"
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card">
              <div className="border-b px-5 py-4">
                <h3 className="text-sm font-semibold text-foreground">Daily Usage Breakdown</h3>
                <p className="text-xs text-muted-foreground">Messages per day (Pakistan time)</p>
              </div>
              {(s?.daily.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No chatbot activity in this period
                </p>
              ) : (
                <div className="max-h-80 divide-y overflow-y-auto">
                  {s?.daily.map((d) => {
                    const max = Math.max(1, d.total);
                    return (
                      <div key={d.date} className="px-5 py-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{d.date}</span>
                          <span className="text-muted-foreground">{d.total} messages</span>
                        </div>
                        <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${(d.success / max) * 100}%` }}
                            title={`${d.success} successful`}
                          />
                          <div
                            className="h-full bg-red-400"
                            style={{ width: `${(d.failed / max) * 100}%` }}
                            title={`${d.failed} failed`}
                          />
                          <div
                            className="h-full bg-amber-400"
                            style={{ width: `${(d.rateLimited / max) * 100}%` }}
                            title={`${d.rateLimited} rate limited`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card">
              <div className="border-b px-5 py-4">
                <h3 className="text-sm font-semibold text-foreground">Recent Chatbot Activity</h3>
                <p className="text-xs text-muted-foreground">Latest requests in this period</p>
              </div>
              {(s?.recent.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No recent chatbot activity
                </p>
              ) : (
                <div className="max-h-80 divide-y overflow-y-auto">
                  {s?.recent.map((r) => {
                    const status = STATUS_STYLES[r.status] ?? {
                      label: r.status,
                      className: "bg-slate-100 text-slate-700",
                    };
                    return (
                      <div key={r.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {clinicDateTime(r.createdAt)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                status.className,
                              )}
                            >
                              {status.label}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600">
                              {r.userType}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-foreground">
                          {r.message || "(empty)"}
                        </p>
                        {r.model && (
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            {r.model}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
