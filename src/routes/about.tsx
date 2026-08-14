import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, GraduationCap, Languages, Award, ArrowLeft, CalendarCheck } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { useDoctorProfile } from "@/hooks/queries/useSiteExtra";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Dr. Naseem Ahmed Khan" },
      {
        name: "description",
        content:
          "Meet Dr. Naseem Ahmed Khan, homeopath and physiotherapist in Karachi, and learn about his approach to natural, patient-centred care.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { data: profile, isLoading, isError, error } = useDoctorProfile();

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>

          {isError && (
            <div className="mt-6">
              <QueryError error={error} />
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !profile ? (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">Profile coming soon.</p>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-border bg-card shadow-soft">
              <div className="flex flex-col items-center gap-4 border-b border-border p-8 text-center">
                {profile.photo_url ? (
                  <img
                    src={profile.photo_url}
                    alt={profile.full_name}
                    className="h-28 w-28 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-primary text-3xl font-bold text-primary-foreground">
                    {profile.full_name.slice(0, 1)}
                  </div>
                )}
                <div>
                  <h1 className="font-display text-3xl font-bold text-foreground">
                    {profile.full_name}
                  </h1>
                  <div className="mt-1 font-medium text-primary">{profile.title}</div>
                  {profile.tagline && (
                    <p className="mt-2 text-sm text-muted-foreground">{profile.tagline}</p>
                  )}
                </div>
              </div>

              <div className="p-8">
                {profile.bio && (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {profile.bio}
                  </p>
                )}

                {profile.experience_years > 0 && (
                  <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                    <Award className="h-4 w-4 text-primary" />
                    {profile.experience_years}+ years of experience
                  </div>
                )}
                {profile.credentials && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="whitespace-pre-line">{profile.credentials}</span>
                  </div>
                )}
                {profile.education && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="whitespace-pre-line">{profile.education}</span>
                  </div>
                )}
                {profile.languages && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{profile.languages}</span>
                  </div>
                )}
                {profile.specialties && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Specialties
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.specialties
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                          >
                            {s}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/booking"
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-primary px-5 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-[1.05]"
                  >
                    <CalendarCheck className="h-4 w-4" /> Book an appointment
                  </Link>
                  <Link
                    to="/booking"
                    search={{ mode: "video" }}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 text-sm font-semibold text-primary transition hover:bg-primary/20"
                  >
                    Video consultation
                  </Link>
                </div>

                {(profile.phone || profile.email || profile.address) && (
                  <div className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
                    {profile.phone && <div>Phone: {profile.phone}</div>}
                    {profile.email && <div>Email: {profile.email}</div>}
                    {profile.address && <div>Address: {profile.address}</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
