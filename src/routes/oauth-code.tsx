import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { completeGoogleMeetOAuth } from "@/lib/actions.functions";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/oauth-code")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
  component: OAuthCallbackPage,
});

type CallbackStatus = "working" | "success" | "error";

function OAuthCallbackPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>("working");
  const [message, setMessage] = useState("");
  // Guards against React StrictMode double-running the effect, which would
  // try to exchange the single-use Google code twice (the second attempt
  // would fail) and against double mounting in dev.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        if (search.error) {
          setStatus("error");
          setMessage(search.error_description || "The Google permission request was denied.");
          return;
        }
        if (!search.code) {
          setStatus("error");
          setMessage("Google did not provide an authorization code.");
          return;
        }

        const result = await completeGoogleMeetOAuth({
          data: {
            code: search.code,
            // Use the origin the callback was actually served from, which is
            // guaranteed to match Google's configured redirect URI.
            redirectUri: `${window.location.origin}/oauth-code`,
          },
        });

        if (cancelled) return;

        if (!result.ok) {
          setStatus("error");
          setMessage(result.message);
          return;
        }

        setStatus("success");
        setMessage(result.message);
        window.setTimeout(() => navigate({ to: "/" }), 1600);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Something went wrong linking Google Meet. Please try the consent again.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            status === "error"
              ? "bg-red-100"
              : status === "success"
                ? "bg-green-100"
                : "bg-primary/10"
          }`}
        >
          {status === "working" && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
          {status === "success" && <CheckCircle2 className="h-8 w-8 text-green-600" />}
          {status === "error" && <AlertTriangle className="h-8 w-8 text-red-600" />}
        </div>

        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {status === "working" && "Linking Google Meet…"}
          {status === "success" && "Google Meet Linked"}
          {status === "error" && "Could Not Link Google Meet"}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        {status !== "working" && (
          <div className="mt-6 inline-flex">
            <Button onClick={() => navigate({ to: "/" })}>Go Home</Button>
          </div>
        )}
      </div>
    </div>
  );
}
