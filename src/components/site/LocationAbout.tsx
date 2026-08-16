import {
  MapPin,
  Phone,
  MessageCircle,
  Check,
  Award,
  BookOpenCheck,
  HeartHandshake,
} from "lucide-react";
import aboutImg from "@/assets/doctor-about.jpg";
import { PHONE, telUrl, whatsappUrl } from "@/lib/contact";

export function LocationAbout() {
  return (
    <section id="contact" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        {/* Location */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft active:scale-[0.99] md:p-8">
          <h3 className="text-center font-display text-2xl font-bold text-red-600 md:text-left">
            Contact & Our Location
          </h3>
          <div className="mt-4 rounded-2xl bg-primary-soft p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                Rahat Homeopathic & physiotherapy clinic
                <div className="text-[15px] font-semibold text-foreground sm:text-sm">
                  {" "}
                  11c2 North Karachi(Dr.Naseem Ahmed).
                </div>
                <div className="text-[13px] text-muted-foreground sm:text-xs">
                  St, Sirsyed Town Sector 11 C 2 North Karachi, Karachi, 75850
                  <br />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <iframe
              title="Clinic Location"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3616.8948444939824!2d67.06058829999999!3d24.9696921!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3eb341eb84332d53%3A0xd6833173c75c3d7!2sRahat%20Homeopathic%20%26%20physiotherapy%20clinic%2011c2%20North%20Karachi(Dr.Naseem%20Ahmed).!5e0!3m2!1sen!2s!4v1786216763886!5m2!1sen!2s"
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
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--whatsapp)] px-4 py-3 text-[15px] font-semibold text-white shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft active:scale-95 sm:text-sm"
            >
              <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
            </a>
            <a
              href={telUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft active:scale-95 sm:text-sm"
            >
              <Phone className="h-4 w-4" /> Call {PHONE}
            </a>
          </div>
        </div>

        {/* About */}
        <div
          id="about"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft active:scale-[0.99] md:p-8"
        >
          <h3 className="text-center font-display text-2xl font-bold text-red-600 md:text-left">
            About Dr. Naseem Ahmed Khan
          </h3>
          <div className="mt-5 grid items-start gap-5 sm:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                <span className="mb-2 block text-[20px] font-semibold text-primary sm:text-lg">
                  Homeopath &amp; Physiotherapist
                </span>
                Dr. Naseem Ahmed is a highly educated and experienced{" "}
                <strong>Homeopath and Physiotherapist</strong> dedicated to providing professional,
                patient-focused care. He works with both{" "}
                <strong>acute and chronic health conditions</strong>, focusing on understanding each
                patient’s individual needs.
                <span className="mb-2 mt-5 block text-[20px] font-semibold text-primary sm:text-lg">
                  Our Approach
                </span>
                He combines <strong>homeopathic care</strong> with{" "}
                <strong>modern physiotherapy techniques</strong> to support natural healing, improve
                physical well-being, and help patients achieve better health and mobility.
                <span className="mb-2 mt-5 block text-[20px] font-semibold text-primary sm:text-lg">
                  Patient-Centered Care
                </span>
                Dr. Naseem Ahmed believes that every patient is different. His approach is based on
                careful assessment, personalized treatment, and patient comfort, with the goal of
                providing safe and effective care.
              </p>{" "}
              <h4 className="mb-4 font-display text-[20px] font-semibold text-primary sm:text-lg">
                Education
              </h4>
              <ul className="mt-4 space-y-2.5 text-[15px] sm:text-sm">
                {[
                  {
                    Icon: BookOpenCheck,
                    t: (
                      <>
                        <span className="font-bold text-primary">
                          Diploma in Homeopathic Medicine & Surgery (D.H.M.S)
                        </span>
                        <span className="block text-[15px] text-muted-foreground sm:text-sm">
                          Pakistan Central Homeopathic Medical College & Hospital, Karachi
                        </span>
                      </>
                    ),
                  },
                  {
                    Icon: Award,
                    t: (
                      <>
                        <span className="font-bold text-primary">
                          Registered Homeopathic Medical Practitioner (R.H.M.P)
                        </span>
                        <span className="block text-[15px] text-muted-foreground sm:text-sm">
                          National Council for Homeopathy, Pakistan, Islamabad
                        </span>
                      </>
                    ),
                  },
                  {
                    Icon: Check,
                    t: (
                      <>
                        <span className="font-bold text-primary">
                          Certificate in Physiotherapy (C.P.T)
                        </span>
                        <span className="block text-[15px] text-muted-foreground sm:text-sm">
                          Sindh Medical Faculty
                        </span>
                      </>
                    ),
                  },
                ].map(({ Icon, t }, index) => (
                  <li key={index} className="flex items-start gap-2 text-foreground">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon className="h-3.5 w-3.5" />
                    </span>

                    <div>{t}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="group overflow-hidden rounded-2xl bg-primary-soft">
              <img
                src={aboutImg}
                alt="Dr. Naseem Ahmed Khan"
                loading="lazy"
                width={1024}
                height={1024}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
