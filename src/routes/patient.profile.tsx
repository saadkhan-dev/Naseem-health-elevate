import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateProfile } from "@/hooks/queries/usePatient";

export const Route = createFileRoute("/patient/profile")({
  component: PatientProfile,
});

function computeAge(dob: string): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function PatientProfile() {
  const { profile, user, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    date_of_birth: "",
    gender: "",
    address: "",
  });
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  // Once the user edits anything, stop re-syncing the form from the profile so
  // a profile refetch can never discard their typed values.
  const dirty = useRef(false);

  useEffect(() => {
    if (profile && !dirty.current) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        date_of_birth: profile.date_of_birth ?? "",
        gender: profile.gender ?? "",
        address: profile.address ?? "",
      });
    }
  }, [profile]);

  async function handleSave() {
    setMessage("");
    setSaveError(false);
    const result = await updateProfile.mutateAsync({
      full_name: form.full_name || undefined,
      phone: form.phone || undefined,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      address: form.address || null,
    });
    if (result.error) {
      setMessage(result.error);
      setSaveError(true);
      return;
    }
    await refreshProfile();
    dirty.current = false;
    setMessage("Profile updated.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep your details up to date for a smoother experience
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="text-sm text-muted-foreground">
          Account email: <span className="font-medium text-foreground">{user?.email}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-name" className="text-sm font-medium text-foreground">
              Full Name
            </label>
            <Input
              id="profile-name"
              autoComplete="name"
              value={form.full_name}
              onChange={(e) => {
                dirty.current = true;
                setForm({ ...form, full_name: e.target.value });
              }}
              className="mt-1"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label htmlFor="profile-phone" className="text-sm font-medium text-foreground">
              Phone
            </label>
            <Input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => {
                dirty.current = true;
                setForm({ ...form, phone: e.target.value });
              }}
              className="mt-1"
              placeholder="+92 3XX XXXXXXX"
            />
          </div>
          <div>
            <label htmlFor="profile-dob" className="text-sm font-medium text-foreground">
              Date of Birth
            </label>
            <Input
              id="profile-dob"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => {
                dirty.current = true;
                setForm({ ...form, date_of_birth: e.target.value });
              }}
              className="mt-1"
            />
            {(() => {
              const age = computeAge(form.date_of_birth);
              return age != null ? (
                <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                  Your age: <span className="font-semibold text-foreground">{age} years</span>
                </p>
              ) : null;
            })()}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Gender</label>
            <Select
              value={form.gender}
              onValueChange={(v) => {
                dirty.current = true;
                setForm({ ...form, gender: v });
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="profile-address" className="text-sm font-medium text-foreground">
              Address
            </label>
            <Textarea
              id="profile-address"
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => {
                dirty.current = true;
                setForm({ ...form, address: e.target.value });
              }}
              className="mt-1"
              placeholder="Your address"
            />
          </div>
        </div>
        {message && (
          <p
            className={`mt-3 text-sm font-medium ${
              saveError ? "text-destructive" : "text-primary"
            }`}
          >
            {message}
          </p>
        )}
        <Button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="mt-4 h-11 rounded-xl sm:h-10"
        >
          {updateProfile.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}
