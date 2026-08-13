import { Stethoscope, CalendarCheck, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";

const links = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#products", label: "Products" },
  { href: "#videos", label: "Videos" },
  { href: "#contact", label: "Contact" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 glass border-b border-border/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8 md:py-4">
        <a
          href="#home"
          className="group flex items-center gap-2.5 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-card transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-base font-semibold text-foreground">
              Dr. Naseem Ahmed Khan
            </div>
            <div className="text-[11px] text-muted-foreground">Homeopath & Physiotherapist</div>
          </div>
        </a>

        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="relative text-sm font-medium text-foreground/75 transition-all duration-300 after:absolute after:-bottom-1.5 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 hover:text-primary hover:after:scale-x-100 active:scale-[0.97]"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#reviews"
            className="relative inline-flex items-center gap-1.5 text-sm font-medium text-foreground/75 transition-all duration-300 after:absolute after:-bottom-1.5 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 hover:text-primary hover:after:scale-x-100 active:scale-[0.97]"
          >
            <Star className="h-4 w-4" />
            Reviews
          </a>
        </nav>

        <div className="flex items-center">
          <Link
            to="/appointment-status"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-soft active:scale-95"
            aria-label="Appointment status"
          >
            <CalendarCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Appointment Status</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
