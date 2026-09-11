import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function QueryError({ error }: { error?: Error | null }) {
  const message = error?.message ?? "Unknown database error";
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Failed to load data from the database</AlertTitle>
      <AlertDescription>
        Could not fetch records from Supabase. Check the connection settings and table permissions
        (RLS). Error: {message}
      </AlertDescription>
    </Alert>
  );
}
