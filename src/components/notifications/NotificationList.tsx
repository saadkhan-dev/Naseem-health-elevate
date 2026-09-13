import { format } from "date-fns";
import { Bell, CheckCheck, Inbox, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/admin/QueryError";
import { unreadBadge } from "@/lib/notification-unread";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationListProps {
  notifications: NotificationItem[];
  unread: number;
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onMarkRead: (id: string) => void;
  onMarkAll: () => void;
  emptyText?: string;
  className?: string;
  contentClassName?: string;
}

export function NotificationList({
  notifications,
  unread,
  isLoading = false,
  isError = false,
  error = null,
  onMarkRead,
  onMarkAll,
  emptyText = "No notifications yet",
  className,
  contentClassName = "max-h-48 overflow-auto lg:max-h-72",
}: NotificationListProps) {
  const navigate = useNavigate();

  function handleItemClick(n: NotificationItem) {
    if (!n.read_at) onMarkRead(n.id);
    if (n.link && n.link.startsWith("/") && !n.link.startsWith("//")) {
      void navigate({ to: n.link });
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 font-display font-semibold text-foreground">
          <Bell className="h-4 w-4 text-primary" />
          Notifications
          {unread > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
              {unreadBadge(unread)}
            </span>
          )}
        </div>
        {unread > 0 && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onMarkAll}>
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>
      {isError && (
        <div className="p-4">
          <QueryError error={error} />
        </div>
      )}
      {isLoading && notifications.length === 0 ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div className={contentClassName}>
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleItemClick(n)}
              className={`block w-full border-b border-border/60 px-5 py-3 text-left last:border-0 ${
                n.read_at ? "opacity-60" : "bg-primary/5"
              }`}
            >
              <div className="text-sm font-medium text-foreground">{n.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {format(new Date(n.created_at), "MMM d, h:mm a")}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
