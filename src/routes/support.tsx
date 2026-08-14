import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MessageSquare, CheckCircle2 } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitSupportMessage } from "@/hooks/queries/useSiteExtra";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Contact & Support — Dr. Naseem Ahmed Khan" },
      {
        name: "description",
        content:
          "Get in touch with Dr. Naseem Ahmed Khan's clinic for appointments, orders or any questions.",
      },
    ],
  }),
  component: SupportPage,
});

const empty = { name: "", email: "", phone: "", subject: "", message: "" };

function SupportPage() {
  const [form, setForm] = useState(empty);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);
  const submit = useSubmitSupportMessage();

  async function handleSubmit() {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Please enter your name.");
      return;
    }
    if (form.message.trim().length < 10) {
      setFormError("Please describe your question (at least 10 characters).");
      return;
    }
    try {
      const result = await submit.mutateAsync(form);
      if (result.error) {
        setFormError(result.error);
      } else {
        setDone(true);
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Contact & Support</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Send us a message and we'll get back to you
              </p>
            </div>
          </div>

          {done ? (
            <div className="mt-8 flex flex-col items-center gap-3 rounded-3xl border border-green-200 bg-green-50 p-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="font-semibold text-foreground">Message received!</p>
              <p className="text-sm text-muted-foreground">
                Thank you for contacting us. We'll reply as soon as possible.
              </p>
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-foreground">Your Name</label>
                  <Input
                    className="mt-1"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Email (optional)</label>
                  <Input
                    type="email"
                    className="mt-1"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Phone (optional)</label>
                  <Input
                    className="mt-1"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+92 3XX XXXXXXX"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Subject (optional)</label>
                  <Input
                    className="mt-1"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="e.g. Appointment question"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Message</label>
                  <Textarea
                    className="mt-1"
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="How can we help?"
                  />
                </div>
              </div>
              {formError && (
                <p className="mt-3 text-sm font-medium text-destructive">{formError}</p>
              )}
              <Button
                onClick={handleSubmit}
                disabled={submit.isPending}
                className="mt-4 h-11 w-full rounded-xl"
              >
                {submit.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                Send message
              </Button>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
