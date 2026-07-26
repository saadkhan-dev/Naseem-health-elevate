import { Check, Video, ShoppingCart, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import consultationImg from "@/assets/consultation.jpg";
import { whatsappUrl } from "@/lib/contact";
import { usePublishedProducts } from "@/hooks/queries/useContent";

export function ConsultationProducts() {
  const { data: products, isLoading } = usePublishedProducts();

  return (
    <section id="services" className="px-4 py-16 md:px-8 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <div className="grid items-center gap-5 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-2xl font-semibold text-foreground">Video Consultation</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Consult with Dr. Naseem Alam from the comfort of your home.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  "Secure & private sessions",
                  "One-on-one video consultation",
                  "Personalized treatment guidance",
                  "Convenient & time-saving",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2 text-foreground">
                    <Check className="mt-0.5 h-4 w-4 text-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <a
                href={whatsappUrl("Hi Dr. Naseem, I'd like to start a video consultation now.")}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-transform hover:scale-[1.02]"
              >
                <Video className="h-4 w-4" /> Consult Now
              </a>
            </div>
            <div className="overflow-hidden rounded-2xl bg-primary-soft">
              <img src={consultationImg} alt="Video consultation" loading="lazy" width={900} height={900} className="h-full w-full object-cover" />
            </div>
          </div>
        </div>

        <div id="products" className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-semibold text-foreground">Our Homeopathic Products</h3>
              <p className="mt-1 text-sm text-muted-foreground">Safe, natural & effective products for better health.</p>
            </div>
            <div className="hidden gap-2 sm:flex">
              <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : products?.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No products available</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {products?.map((p) => (
                <div key={p.id} className="group rounded-2xl border border-border bg-background p-3 transition-shadow hover:shadow-card">
                  <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" width={800} height={800} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No image</div>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-foreground">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                    <div className="mt-1 text-sm font-bold text-primary">Rs. {p.price}</div>
                    <a
                      href={whatsappUrl(`Hi, I'd like to order: ${p.name} — Rs. ${p.price}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-soft py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
