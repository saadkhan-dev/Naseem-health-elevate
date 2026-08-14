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
      { title: "Dr. Naseem Ahmed Khan — Homeopathic & Physiotherapist in Karachi" },
      {
        name: "description",
        content:
          "Expert homeopathic & physiotherapy care in Karachi by Dr. Naseem Ahmed Khan. Natural healing, pain relief, video consultation and personalized treatment.",
      },
      {
        property: "og:title",
        content: "Dr. Naseem Ahmed Khan — Homeopathic & Physiotherapist in Karachi",
      },
      {
        property: "og:description",
        content:
          "Book an appointment with Dr. Naseem Ahmed Khan for natural homeopathic and physiotherapy treatment in Karachi.",
      },
    ],
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
