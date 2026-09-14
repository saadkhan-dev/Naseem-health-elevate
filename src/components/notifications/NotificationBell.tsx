import { useState } from "react";
import { Bell } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  NotificationList,
  type NotificationItem,
} from "@/components/notifications/NotificationList";
import { unreadBadge } from "@/lib/notification-unread";

interface NotificationBellProps {
  label: string;
  data?: NotificationItem[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onMarkRead: (id: string) => void;
  onMarkAll: () => void;
  triggerClassName: string;
  badgeClassName: string;
  emptyText?: string;
}

const POPOVER_WIDTH = "w-[min(24rem,calc(100vw-2rem))]";

export function NotificationBell({
  label,
  data = [],
  isLoading = false,
  isError = false,
  error = null,
  onMarkRead,
  onMarkAll,
  triggerClassName,
  badgeClassName,
  emptyText,
}: NotificationBellProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const unread = data.filter((n) => !n.read_at).length;
  const badge = unreadBadge(unread);

  const trigger = (
    <button type="button" aria-label={label} className={triggerClassName}>
      <Bell className="h-4 w-4" />
      {badge && (
        <span className={badgeClassName} aria-label={`${unread} unread notifications`}>
          {badge}
        </span>
      )}
    </button>
  );

  const list = (
    <NotificationList
      notifications={data}
      unread={unread}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onMarkRead={onMarkRead}
      onMarkAll={onMarkAll}
      onNavigate={() => setOpen(false)}
      emptyText={emptyText}
      contentClassName="max-h-[60vh] overflow-auto"
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="right" className="w-full p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">{label}</SheetTitle>
          {list}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className={`${POPOVER_WIDTH} max-h-[min(32rem,100dvh-6rem)] overflow-hidden p-0`}
      >
        {list}
      </PopoverContent>
    </Popover>
  );
}
