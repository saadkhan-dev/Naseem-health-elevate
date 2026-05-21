import { Play } from "lucide-react";
import v1 from "@/assets/video-1.jpg";
import v2 from "@/assets/video-2.jpg";
import v3 from "@/assets/video-3.jpg";
import v4 from "@/assets/video-4.jpg";

const videos = [
  { img: v1, title: "Joint Pain Relief — Natural Homeopathic Treatment", duration: "06:45" },
  { img: v2, title: "Cervical Pain: Causes, Symptoms & Treatment", duration: "09:12" },
  { img: v3, title: "Benefits of Homeopathy in Daily Life", duration: "05:03" },
  { img: v4, title: "Simple Exercises for Back Pain Relief", duration: "05:32" },
];

export function VideoGallery() {
  return (
    <section id="videos" className="px-4 py-16 md:px-8 md:py-20">
      <div className="mx-auto max-w-7xl rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_3fr]">
          <div>
            <h3 className="font-display text-2xl font-semibold text-foreground">Health Awareness Videos</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Informative videos by Dr. Naseem Alam on health, fitness & natural healing.
            </p>
            <button className="mt-4 rounded-xl border border-primary/30 bg-primary-soft px-4 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors">
              View All Videos
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {videos.map((v) => (
              <div key={v.title} className="group">
                <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  <img src={v.img} alt={v.title} loading="lazy" width={800} height={600} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 shadow-soft transition-transform group-hover:scale-110">
                      <Play className="h-5 w-5 translate-x-0.5 fill-primary text-primary" />
                    </div>
                  </div>
                  <span className="absolute bottom-2 right-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
                    {v.duration}
                  </span>
                </div>
                <div className="mt-2.5 text-xs font-medium leading-snug text-foreground">{v.title}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
