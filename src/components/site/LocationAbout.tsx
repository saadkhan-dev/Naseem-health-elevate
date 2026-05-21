import { MapPin, Phone, MessageCircle, Check, Award, BookOpenCheck, HeartHandshake } from "lucide-react";
import aboutImg from "@/assets/doctor-about.jpg";
import { PHONE, telUrl, whatsappUrl } from "@/lib/contact";

export function LocationAbout() {
  return (
    <section id="contact" className="px-4 py-16 md:px-8 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        {/* Location */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <h3 className="font-display text-2xl font-semibold text-foreground">Our Location</h3>
          <div className="mt-4 rounded-2xl bg-primary-soft p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Main Clinic — Clifton</div>
                <div className="text-xs text-muted-foreground">
                  101, 1st Floor, Clifton Medical Center,<br />
                  Clifton Block-5, Karachi, Pakistan.
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <iframe
              title="Clinic Location"
              src="https://www.google.com/maps?q=Clifton+Block+5+Karachi&output=embed"
              width="100%"
              height="260"
              loading="lazy"
              className="block w-full"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a
              href={whatsappUrl("Hi Dr. Naseem, I'd like to know more about your clinic.")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--whatsapp)] px-4 py-3 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.02]"
            >
              <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
            </a>
            <a
              href={telUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-transform hover:scale-[1.02]"
            >
              <Phone className="h-4 w-4" /> Call {PHONE}
            </a>
          </div>
        </div>

        {/* About */}
        <div id="about" className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <h3 className="font-display text-2xl font-semibold text-foreground">About Dr. Naseem Alam</h3>
          <div className="mt-5 grid items-start gap-5 sm:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Dr. Naseem Alam is a professional Homeopath and Physiotherapist with years
                of experience treating acute & chronic conditions. He believes in holistic
                healing and patient-centered care — combining natural homeopathic remedies
                with modern physiotherapy techniques.
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {[
                  { Icon: BookOpenCheck, t: "D.H.M.S (Homeopathy)" },
                  { Icon: Award, t: "Physiotherapy Specialist" },
                  { Icon: Check, t: "Pain Management Expert" },
                  { Icon: HeartHandshake, t: "Holistic & Natural Approach" },
                ].map(({ Icon, t }) => (
                  <li key={t} className="flex items-center gap-2 text-foreground">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl bg-primary-soft">
              <img src={aboutImg} alt="Dr. Naseem Alam" loading="lazy" width={1024} height={1024} className="h-full w-full object-cover" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
