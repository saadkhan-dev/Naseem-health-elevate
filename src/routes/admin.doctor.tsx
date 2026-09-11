import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useAdminDoctorProfile, useUpdateDoctorProfile } from "@/hooks/queries/useAdminExtra";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/doctor")({
  component: AdminDoctor,
});

const empty = {
  full_name: "",
  title: "",
  tagline: "",
  bio: "",
  credentials: "",
  education: "",
  experience_years: 0,
  languages: "",
  specialties: "",
  phone: "",
  email: "",
  address: "",
  is_active: true,
};

function AdminDoctor() {
  const { data: profile, isLoading, isError, error } = useAdminDoctorProfile();
  const updateProfile = useUpdateDoctorProfile();
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        title: profile.title ?? "",
        tagline: profile.tagline ?? "",
        bio: profile.bio ?? "",
        credentials: profile.credentials ?? "",
        education: profile.education ?? "",
        experience_years: profile.experience_years ?? 0,
        languages: profile.languages ?? "",
        specialties: profile.specialties ?? "",
        phone: profile.phone ?? "",
        email: profile.email ?? "",
        address: profile.address ?? "",
        is_active: profile.is_active,
      });
    }
  }, [profile]);

  async function handleSave() {
    setMessage("");
    const result = await updateProfile.mutateAsync({
      full_name: form.full_name || undefined,
      title: form.title || undefined,
      tagline: form.tagline || undefined,
      bio: form.bio || undefined,
      credentials: form.credentials || undefined,
      education: form.education || undefined,
      experience_years: form.experience_years,
      languages: form.languages || undefined,
      specialties: form.specialties || undefined,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      is_active: form.is_active,
    });
    setMessage(result.error ?? "Profile saved.");
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Doctor Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          About page content shown publicly on the site
        </p>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <Input
                className="mt-1"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Title</label>
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Tagline</label>
              <Input
                className="mt-1"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Bio</label>
              <Textarea
                className="mt-1"
                rows={6}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Credentials</label>
              <Input
                className="mt-1"
                value={form.credentials}
                onChange={(e) => setForm({ ...form, credentials: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Education</label>
              <Input
                className="mt-1"
                value={form.education}
                onChange={(e) => setForm({ ...form, education: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Experience (years)</label>
              <Input
                type="number"
                className="mt-1"
                value={form.experience_years}
                onChange={(e) => setForm({ ...form, experience_years: +e.target.value || 0 })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Languages</label>
              <Input
                className="mt-1"
                value={form.languages}
                onChange={(e) => setForm({ ...form, languages: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Specialties</label>
              <Input
                className="mt-1"
                value={form.specialties}
                onChange={(e) => setForm({ ...form, specialties: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Phone</label>
              <Input
                className="mt-1"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                className="mt-1"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Address</label>
              <Input
                className="mt-1"
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Active</div>
                <div className="text-xs text-muted-foreground">Show the About page publicly</div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          {message && <p className="mt-3 text-sm font-medium text-primary">{message}</p>}
          <Button onClick={handleSave} disabled={updateProfile.isPending} className="mt-4">
            {updateProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Profile
          </Button>
        </div>
      )}
    </div>
  );
}
