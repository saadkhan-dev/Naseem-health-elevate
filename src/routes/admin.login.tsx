import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Stethoscope, ArrowLeft, Loader2, Mail, Lock, KeyRound } from "lucide-react";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { staffSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
});

function AdminLogin() {
  const { loginStaff, logout } = useStaffAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await loginStaff(email, password);
    if (result.error || !result.role) {
      setError(result.error ?? "Sign in failed. Please try again.");
      setLoading(false);
      return;
    }
    if (result.role !== "admin" && result.role !== "doctor") {
      await logout();
      setError("This account is not authorized to access the admin area.");
      setLoading(false);
      return;
    }
    navigate({ to: "/admin" });
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);
    const { error } = await staffSupabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) {
      setForgotError(error.message);
    } else {
      setForgotSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to website
        </Link>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-card">
              <Stethoscope className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold text-foreground">
              {forgotOpen ? "Reset Password" : "Admin Login"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {forgotOpen
                ? "Enter your account email to receive a reset link."
                : "Sign in to manage your clinic"}
            </p>
          </div>

          {forgotOpen ? (
            <form onSubmit={handleForgot} className="mt-6 space-y-4">
              {forgotSent ? (
                <div className="rounded-2xl bg-primary-soft p-4 text-sm text-foreground">
                  If an account exists for <span className="font-medium">{forgotEmail}</span>, a
                  password reset link has been sent to that email address.
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">Email address</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="admin@health-elevate.com"
                        className="h-11 rounded-xl pl-9"
                      />
                    </div>
                  </div>

                  {forgotError && (
                    <p className="text-sm font-medium text-destructive">{forgotError}</p>
                  )}

                  <Button type="submit" disabled={forgotLoading} className="h-11 w-full rounded-xl">
                    {forgotLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Send Reset Link <KeyRound className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setForgotOpen(false);
                  setForgotError("");
                  setForgotSent(false);
                }}
                className="w-full text-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Back to login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@health-elevate.com"
                    className="h-11 rounded-xl pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 rounded-xl pl-9"
                  />
                </div>
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}

              <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In to Admin"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setForgotOpen(true);
                  setError("");
                }}
                className="w-full text-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Forgot password?
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
