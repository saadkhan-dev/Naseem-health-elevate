import { Facebook, Instagram, Youtube, MessageCircle, Phone, Mail, MapPin, Stethoscope } from "lucide-react";
import { PHONE, EMAIL, telUrl, whatsappUrl } from "@/lib/contact";

export function SiteFooter() {
  return (
    <footer className="bg-[color:var(--footer)] text-[color:var(--footer-foreground)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 md:px-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/30 text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-semibold">Dr. Naseem Alam</div>
              <div className="text-[11px] text-white/60">Homeopathic & Physiotherapist</div>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Providing natural, safe and effective homeopathic & physiotherapy treatments
            to help you live a pain-free, healthy and better life.
          </p>
          <div className="mt-5 flex gap-3">
            {[Facebook, Instagram, Youtube, MessageCircle].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-primary"
                aria-label="Social link"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <FCol title="Quick Links" items={["Home", "About Us", "Services", "Products", "Videos", "Contact Us"]} />
        <FCol title="Our Services" items={["Homeopathic Treatment", "Physiotherapy Sessions", "Pain Management", "Rehabilitation", "Video Consultation"]} />

        <div>
          <div className="mb-3 text-sm font-semibold text-white">Contact Us</div>
          <ul className="space-y-2.5 text-sm text-white/75">
            <li>
              <a href={telUrl} className="inline-flex items-center gap-2 hover:text-white">
                <Phone className="h-4 w-4 text-primary" /> {PHONE}
              </a>
            </li>
            <li>
              <a href={whatsappUrl("Hi Dr. Naseem")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                <MessageCircle className="h-4 w-4 text-[color:var(--whatsapp)]" /> WhatsApp
              </a>
            </li>
            <li>
              <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-2 hover:text-white">
                <Mail className="h-4 w-4 text-primary" /> {EMAIL}
              </a>
            </li>
            <li className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Clifton, Karachi, Pakistan
            </li>
          </ul>
          <div className="mt-5 rounded-xl bg-white/5 p-3 text-xs text-white/70">
            <div className="mb-1 font-semibold text-white">Clinic Timings</div>
            Mon – Sat: 10:00 AM – 08:00 PM<br />
            Sunday: 10:00 AM – 02:00 PM<br />
            Friday: Closed
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-white/60 sm:flex-row md:px-8">
          <div>© {new Date().getFullYear()} Dr. Naseem Alam. All Rights Reserved.</div>
          <div>Designed with care for better health.</div>
        </div>
      </div>

      {/* Floating WhatsApp */}
      <a
        href={whatsappUrl("Hi Dr. Naseem, I'd like to know more.")}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--whatsapp)] text-white shadow-soft transition-transform hover:scale-110"
      >
        <MessageCircle className="h-6 w-6" />
      </a>
    </footer>
  );
}

function FCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-white">{title}</div>
      <ul className="space-y-2 text-sm text-white/75">
        {items.map((i) => (
          <li key={i}>
            <a href="#" className="hover:text-white">{i}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
