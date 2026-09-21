import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PASSWORD_RESET_REDIRECT = "https://rahathomeophysioclinic.com/reset-password";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login, resendConfirmation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetState, setResetState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [resetError, setResetError] = useState("");
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState("");

  // Show the "resend confirmation" action only for the unconfirmed-email error.
  const unconfirmed = /confirm your email|email not confirmed/i.test(error);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      onSuccess();
    }
  }

  async function handleResendConfirmation() {
    setResendState("loading");
    setResendError("");
    const err = await resendConfirmation(email.trim());
    if (err) {
      setResendError(err);
      setResendState("error");
    } else {
      setResendState("sent");
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setResetState("error");
      setResetError("Enter your email address above to reset your password.");
      return;
    }
    setResetError("");
    setResetState("loading");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: PASSWORD_RESET_REDIRECT,
      });
      if (error) {
        setResetState("error");
        setResetError(error.message);
        return;
      }
      setResetState("sent");
    } catch {
      setResetState("error");
      setResetError("We couldn't send the reset email. Please check your internet connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {unconfirmed && (
        <div className="-mt-2">
          {resendState === "sent" ? (
            <p role="status" className="text-sm text-primary">
              Confirmation link sent! Check your inbox (and spam folder).
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendState === "loading"}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline disabled:opacity-60"
            >
              {resendState === "loading" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending confirmation email...
                </>
              ) : (
                "Resend confirmation email"
              )}
            </button>
          )}
          {resendState === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {resendError}
            </p>
          )}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
      <div className="text-center">
        {resetState === "sent" ? (
          <p role="status" className="text-sm text-primary">
            Reset link sent! Check your email to set a new password.
          </p>
        ) : resetState === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {resetError}
          </p>
        ) : (
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetState === "loading"}
            className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {resetState === "loading" ? (
              <>
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Sending reset link...
              </>
            ) : (
              "Forgot password?"
            )}
          </button>
        )}
      </div>
    </form>
  );
}
