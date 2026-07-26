import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { formatTimeDisplay } from "@/lib/bookings";
import { Button } from "@/components/ui/button";

interface BookingConfirmationProps {
  serviceName: string;
  date: Date;
  time: string;
  onClose: () => void;
}

export function BookingConfirmation({ serviceName, date, time, onClose }: BookingConfirmationProps) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold text-foreground">Appointment Requested</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your appointment has been submitted. Dr. Naseem will confirm your slot shortly.
      </p>
      <div className="mt-6 w-full max-w-xs space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
        <Row label="Service" value={serviceName} />
        <Row label="Date" value={format(date, "EEEE, MMMM d, yyyy")} />
        <Row label="Time" value={formatTimeDisplay(time)} />
      </div>
      <Button className="mt-6" onClick={onClose}>
        Book another appointment
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
