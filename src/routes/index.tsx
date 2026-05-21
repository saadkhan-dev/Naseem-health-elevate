import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/site/Nav";
import { Hero } from "@/components/site/Hero";
import { BookingPanel } from "@/components/site/BookingPanel";
import { ConsultationProducts } from "@/components/site/ConsultationProducts";
import { VideoGallery } from "@/components/site/VideoGallery";
import { LocationAbout } from "@/components/site/LocationAbout";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dr. Naseem Alam — Homeopathic & Physiotherapist in Karachi" },
      {
        name: "description",
        content:
          "Expert homeopathic & physiotherapy care in Karachi by Dr. Naseem Alam. Natural healing, pain relief, video consultation and personalized treatment.",
      },
      { property: "og:title", content: "Dr. Naseem Alam — Homeopathic & Physiotherapist in Karachi" },
      {
        property: "og:description",
        content: "Book an appointment with Dr. Naseem Alam for natural homeopathic and physiotherapy treatment in Karachi.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <Hero />
        <BookingPanel />
        <ConsultationProducts />
        <VideoGallery />
        <LocationAbout />
      </main>
      <SiteFooter />
    </div>
  );
}
