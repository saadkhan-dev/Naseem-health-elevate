import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Stethoscope, ArrowLeft, Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { supabase, staffSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The password-recovery token may land in either Supabase client (the
    // admin/staff one or the public/patient one), so listen on both.
    const { data: publicSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    const { data: staffSub } = staffSupabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    staffSupabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => {
      publicSub.subscription.unsubscribe();
      staffSub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);

    // Update the password on whichever client actually holds the recovery session.
    const publicSession = (await supabase.auth.getSession()).data.session;
    const { error: err } = publicSession
      ? await supabase.auth.updateUser({ password })
      : await staffSupabase.auth.updateUser({ password });

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  }

  async function finish() {
    // Clear BOTH clients so a recovery session that leaked into the other
    // storage key is never left behind, then go to the admin login.
    await Promise.all([supabase.auth.signOut(), staffSupabase.auth.signOut()]);
    navigate({ to: "/admin/login" });
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
              Set a New Password
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a strong password to secure your admin account.
            </p>
          </div>

          {!ready ? (
            <div className="mt-8 flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Validating your reset link...
            </div>
          ) : done ? (
            <div className="mt-8">
              <div className="flex flex-col items-center rounded-2xl bg-primary-soft p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-primary" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  Password updated successfully.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  You can now sign in with your new password.
                </p>
              </div>
              <Button onClick={finish} className="mt-4 h-11 w-full rounded-xl">
                Go to Admin Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="h-11 rounded-xl pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm new password</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter new password"
                    className="h-11 rounded-xl pl-9"
                  />
                </div>
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}

              <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
