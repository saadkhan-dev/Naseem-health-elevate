import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/site/Nav";
import { Hero } from "@/components/site/Hero";
import { ServicesSection } from "@/components/site/ServicesSection";
import { DiseasesSection } from "@/components/site/DiseasesSection";
import { BookingPanel } from "@/components/site/BookingPanel";
import { ConsultationProducts } from "@/components/site/ConsultationProducts";
import { VideoGallery } from "@/components/site/VideoGallery";
import { LocationAbout } from "@/components/site/LocationAbout";
import { ReviewsSection } from "@/components/site/ReviewsSection";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Homeopathic & Physiotherapy Clinic in Karachi | Rahat Homeo Physio Clinic",
      },
      {
        name: "description",
        content:
          "Rahat Homeo Physio Clinic in Karachi offers homeopathic treatment and physiotherapy by Dr. Naseem Ahmed Khan. Book an appointment or online video consultation today.",
      },
      {
        property: "og:title",
        content: "Homeopathic & Physiotherapy Clinic in Karachi | Rahat Homeo Physio Clinic",
      },
      {
        property: "og:description",
        content:
          "Natural homeopathic treatment and physiotherapy in Karachi with Dr. Naseem Ahmed Khan. Book appointments and video consultations online.",
      },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": "https://rahathomeophysioclinic.com/#website",
              url: "https://rahathomeophysioclinic.com/",
              name: "Rahat Homeo Physio Clinic",
              inLanguage: "en",
              publisher: { "@id": "https://rahathomeophysioclinic.com/#clinic" },
            },
            {
              "@type": "MedicalClinic",
              "@id": "https://rahathomeophysioclinic.com/#clinic",
              name: "Rahat Homeo Physio Clinic",
              alternateName: "Rahat Homeopathic & Physiotherapy Clinic",
              url: "https://rahathomeophysioclinic.com/",
              telephone: "+92 315 2968384",
              email: "rahatphysio9@gmail.com",
              address: {
                "@type": "PostalAddress",
                streetAddress: "11C2 North Karachi (Dr. Naseem Ahmed), Street Sir Syed Town",
                addressLocality: "Karachi",
                addressRegion: "Sindh",
                postalCode: "75850",
                addressCountry: "PK",
              },
              geo: { "@type": "GeoCoordinates", latitude: 24.9696921, longitude: 67.0605883 },
              areaServed: [{ "@type": "City", name: "Karachi" }],
              openingHoursSpecification: [
                {
                  "@type": "OpeningHoursSpecification",
                  dayOfWeek: ["Sunday"],
                  opens: "11:00",
                  closes: "13:00",
                },
                {
                  "@type": "OpeningHoursSpecification",
                  dayOfWeek: [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ],
                  opens: "19:00",
                  closes: "23:00",
                },
              ],
              founder: { "@id": "https://rahathomeophysioclinic.com/#doctor" },
            },
            {
              "@type": "Person",
              "@id": "https://rahathomeophysioclinic.com/#doctor",
              name: "Dr. Naseem Ahmed Khan",
              jobTitle: "Homeopath & Physiotherapist",
              url: "https://rahathomeophysioclinic.com/about",
              telephone: "+92 315 2968384",
              email: "rahatphysio9@gmail.com",
              worksFor: { "@id": "https://rahathomeophysioclinic.com/#clinic" },
            },
          ],
        },
      },
    ],
    links: [{ rel: "canonical", href: "https://rahathomeophysioclinic.com/" }],
  }),
  component: Index,
});

let isFirstHomeLoad = true;

function Index() {
  useEffect(() => {
    if (!isFirstHomeLoad || window.location.hash) return;
    isFirstHomeLoad = false;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <Hero />
        <ServicesSection />
        <DiseasesSection />
        <BookingPanel />
        <ConsultationProducts />
        <VideoGallery />
        <ReviewsSection />
        <LocationAbout />
      </main>
      <SiteFooter />
    </div>
  );
}
