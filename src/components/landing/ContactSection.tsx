import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { MapPin, Phone, Mail, MessageCircle, Send, Clock, CheckCircle2 } from "lucide-react";
import { PHONE, EMAIL, telUrl, whatsappUrl } from "@/lib/contact";

export function ContactSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [karachiTime, setKarachiTime] = useState("");

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Karachi",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      };
      setKarachiTime(new Intl.DateTimeFormat("en-US", options).format(now));
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = `*New Patient Inquiry*\nName: ${name}\nContact: ${contact}\n\nMessage:\n${message}`;
    window.open(whatsappUrl(`Hi Dr. Naseem,\n\n${body}`), "_blank", "noopener,noreferrer");
    setSent(true);
    setName("");
    setContact("");
    setMessage("");
  }

  return (
    <section
      ref={ref}
      id="contact"
      className="relative overflow-hidden bg-black px-6 py-16 md:py-40"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(16,185,129,0.03)_0%,_transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl">
        {/* Header with Live Clock */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="mb-12 flex flex-col justify-between gap-4 md:mb-16 md:flex-row md:items-end"
        >
          <div>
            <span className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
              Location &amp; Inquiries
            </span>
            <h2 className="mt-2 font-serif-display text-4xl tracking-tight text-white md:text-6xl">
              Clinic Command <em className="italic text-white/60">Center</em>
            </h2>
          </div>

          <div className="liquid-glass inline-flex items-center gap-3 rounded-full px-4 py-2 text-xs">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-white/60">Karachi Local Time:</span>
            <span className="font-mono font-bold text-white">{karachiTime || "Loading..."}</span>
          </div>
        </motion.div>

        {/* 2-Column Contact & Map Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left Column: Form & Quick Channels */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="flex flex-col justify-between space-y-6"
          >
            <form onSubmit={handleSubmit} className="liquid-glass rounded-3xl p-6 md:p-8">
              <h3 className="mb-2 text-xl font-bold text-white">Direct WhatsApp Consultation</h3>
              <p className="mb-6 text-xs text-white/50">
                Send your inquiry directly to Dr. Naseem's verified clinic WhatsApp line.
              </p>

              <div className="space-y-4">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Full Name"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition-colors focus:border-emerald-400/50"
                />
                <input
                  type="text"
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Phone or WhatsApp Number"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition-colors focus:border-emerald-400/50"
                />
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your symptoms or ask about clinic availability..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition-colors focus:border-emerald-400/50"
                />
              </div>

              <button
                type="submit"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 py-3.5 text-sm font-bold text-black transition-all hover:bg-emerald-300 active:scale-95 sm:w-auto sm:px-8"
              >
                <Send className="h-4 w-4" /> Send Instant WhatsApp Message
              </button>

              {sent && (
                <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Redirecting to WhatsApp conversation...</span>
                </div>
              )}
            </form>

            {/* Quick Contact Buttons */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { Icon: Phone, label: PHONE, href: telUrl, sub: "Direct Phone" },
                {
                  Icon: MessageCircle,
                  label: "WhatsApp Clinic",
                  href: whatsappUrl("Hi Dr. Naseem"),
                  sub: "+92 315 2968384",
                },
                { Icon: Mail, label: EMAIL, href: `mailto:${EMAIL}`, sub: "Email Inquiries" },
                {
                  Icon: MapPin,
                  label: "North Karachi, 75850",
                  href: "https://maps.google.com/?q=Rahat+Homeopathic+Physiotherapy+Clinic+North+Karachi",
                  sub: "Sector 11C2 Sir Syed Town",
                },
              ].map(({ Icon, label, href, sub }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="liquid-glass flex items-center gap-3 rounded-2xl p-4 transition-all hover:bg-white/[0.05] hover:shadow-glass"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-emerald-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{label}</p>
                    <p className="text-[11px] text-white/40">{sub}</p>
                  </div>
                </a>
              ))}
            </div>
          </motion.div>

          {/* Right Column: Google Maps & Operational Hours */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur-md"
          >
            <div className="map-frame relative h-[280px] w-full overflow-hidden sm:h-[380px]">
              <iframe
                title="Rahat Homeo Physio Clinic Location Map"
                src="https://maps.google.com/maps?q=Rahat%20Homeopathic%20%26%20Physiotherapy%20Clinic%2C%20Sector%2011-C-2%2C%20North%20Karachi%20Town%2C%20Karachi&t=m&z=16&output=embed&iwloc=B"
                width="100%"
                height="100%"
                loading="lazy"
                className="h-full w-full border-0"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>

            <div className="border-t border-white/10 p-6 md:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                <Clock className="h-4 w-4" />
                <span>Clinical Schedule</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs text-white/70">
                <div className="rounded-xl bg-white/5 p-3">
                  <span className="font-semibold text-white">Monday – Saturday:</span>
                  <p className="mt-1 text-emerald-300">07:00 PM – 11:00 PM</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <span className="font-semibold text-white">Sunday Session:</span>
                  <p className="mt-1 text-emerald-300">11:00 AM – 01:00 PM</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
