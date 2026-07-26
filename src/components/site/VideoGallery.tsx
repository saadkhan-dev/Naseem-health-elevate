import { Play, Loader2 } from "lucide-react";
import { usePublishedVideos } from "@/hooks/queries/useContent";

export function VideoGallery() {
  const { data: videos, isLoading } = usePublishedVideos();

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
            {isLoading ? (
              <div className="col-span-full flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : videos?.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No videos yet</p>
            ) : (
              videos?.map((v) => (
                <a
                  key={v.id}
                  href={v.video_url || "#"}
                  target={v.video_url ? "_blank" : undefined}
                  rel={v.video_url ? "noreferrer" : undefined}
                  className="group"
                >
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt={v.title} loading="lazy" width={800} height={600} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                        <Play className="h-8 w-8 text-primary/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 shadow-soft transition-transform group-hover:scale-110">
                        <Play className="h-5 w-5 translate-x-0.5 fill-primary text-primary" />
                      </div>
                    </div>
                    {v.duration && (
                      <span className="absolute bottom-2 right-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
                        {v.duration}
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 text-xs font-medium leading-snug text-foreground">{v.title}</div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
