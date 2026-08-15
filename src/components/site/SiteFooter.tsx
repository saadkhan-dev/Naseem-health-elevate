import { Facebook, Instagram, MessageCircle, Phone, Mail, MapPin, Stethoscope } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PHONE, EMAIL, telUrl, whatsappUrl } from "@/lib/contact";
import { SectionLink } from "@/components/site/SectionLink";
import { useFooterClearance } from "@/hooks/useFooterClearance";

export function SiteFooter() {
  const { clearance, hidden } = useFooterClearance();
  const whatsappBottom = `calc(${clearance}px + 1.25rem)`;
  return (
    <footer className="bg-[color:var(--footer)] text-[color:var(--footer-foreground)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 md:px-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/30 text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-semibold">Dr. Naseem Ahmed Khan</div>
              <div className="text-[11px] text-white/60">Homeopath & Physiotherapist</div>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Providing natural, safe and effective homeopathic & physiotherapy treatments to help you
            live a pain-free, healthy and better life.
          </p>
          <div className="mt-5 flex gap-3">
            {[
              {
                Icon: Facebook,
                link: "https://www.facebook.com/share/1EoXFSNZkm/",
                label: "Facebook",
              },
              {
                Icon: Instagram,
                link: "https://www.instagram.com/rahatphysio9?igsh=bTE0N2k0d3o4cXI2",
                label: "Instagram",
              },
              {
                Icon: MessageCircle,
                link: whatsappUrl("Hi Dr. Naseem, I'd like to know more."),
                label: "WhatsApp",
              },
            ].map(({ Icon, link, label }, i) => (
              <a
                key={i}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:shadow-soft active:scale-90"
                aria-label={label}
              >
                <Icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              </a>
            ))}
          </div>
        </div>

        <FCol
          title="Quick Links"
          items={[
            { label: "Home", href: "/#home" },
            { label: "About Us", href: "/#about" },
            { label: "Services", href: "/#services" },
            { label: "Products", href: "/#products" },
            { label: "Shop Online", href: "/shop" },
            { label: "Book Appointment", href: "/booking" },
            { label: "Check Appointment Status", href: "/appointment-status" },
          ]}
        />
        <FCol
          title="Our Services"
          items={[
            { label: "Homeopathic Treatment", href: "/#services" },
            { label: "Physiotherapy Sessions", href: "/#services" },
            { label: "Pain Management", href: "/#services" },
            { label: "Rehabilitation", href: "/#services" },
            { label: "Video Consultation", href: "/booking?mode=video" },
          ]}
        />

        <div>
          <div className="mb-3 text-sm font-semibold text-white">Contact Us</div>
          <ul className="space-y-2.5 text-sm text-white/75">
            <li>
              <a
                href={telUrl}
                className="inline-flex items-center gap-2 transition-all duration-300 hover:translate-x-0.5 hover:text-white active:translate-x-0 active:opacity-80"
              >
                <Phone className="h-4 w-4 text-primary" /> {PHONE}
              </a>
            </li>
            <li>
              <a
                href={whatsappUrl("Hi Dr. Naseem")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 transition-all duration-300 hover:translate-x-0.5 hover:text-white active:translate-x-0 active:opacity-80"
              >
                <MessageCircle className="h-4 w-4 text-[color:var(--whatsapp)]" /> WhatsApp
              </a>
            </li>
            <li>
              <a
                href={`mailto:${EMAIL}`}
                className="inline-flex items-center gap-2 transition-all duration-300 hover:translate-x-0.5 hover:text-white active:translate-x-0 active:opacity-80"
              >
                <Mail className="h-4 w-4 text-primary" /> {EMAIL}
              </a>
            </li>
            <li className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Sirsyed Town Sector 11 C 2 North Karachi
            </li>
          </ul>
          <div className="mt-5 rounded-xl bg-white/5 p-3 text-xs text-white/70">
            <div className="mb-1 font-semibold text-white">Clinic Timings</div>
            Mon – Sat: 07:00 PM – 11:00 PM
            <br />
            Sunday: 11:00 AM – 01:00 PM
            <br />
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-white/60 sm:flex-row md:px-8">
          <div>© {new Date().getFullYear()} Dr. Naseem Ahmed Khan. All Rights Reserved.</div>
          <div>Designed with care for better health.</div>
        </div>
      </div>

      {/* Floating WhatsApp */}
      <a
        href={whatsappUrl("Hi Dr. Naseem, I'd like to know more.")}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        data-floating-control="true"
        className={`group fixed right-5 z-50 flex items-center gap-3 rounded-full bg-[color:var(--whatsapp)] py-2 pl-2 pr-5 text-white shadow-soft transition-[transform,box-shadow,opacity] duration-300 hover:-translate-y-1 hover:shadow-glass active:scale-95 ${
          hidden ? "pointer-events-none opacity-0" : ""
        }`}
        style={{ bottom: whatsappBottom }}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
          <MessageCircle className="h-5 w-5" />
        </span>
        <span className="text-left leading-tight">
          <span className="block font-display text-sm font-semibold">WhatsApp</span>
          <span className="block text-[11px] text-white/85">Chat with us</span>
        </span>
      </a>
    </footer>
  );
}

function FCol({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-white">{title}</div>
      <ul className="space-y-2.5 text-sm text-white/75">
        {items.map((i) =>
          i.href.startsWith("/#") ? (
            <li key={i.label}>
              <SectionLink
                hash={i.href.slice(1)}
                className="inline-block transition-all duration-300 hover:translate-x-0.5 hover:text-white"
              >
                {i.label}
              </SectionLink>
            </li>
          ) : (
            <li key={i.label}>
              <Link
                to={i.href}
                className="inline-block transition-all duration-300 hover:translate-x-0.5 hover:text-white"
              >
                {i.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
