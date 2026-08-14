import { Play, Loader2 } from "lucide-react";
import { usePublishedVideos } from "@/hooks/queries/useContent";

export function VideoGallery() {
  const { data: videos, isLoading } = usePublishedVideos();

  return (
    <section id="videos" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_3fr]">
          <div>
            <h3 className="font-display text-2xl font-bold text-red-600">
              Health Awareness Videos
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Informative videos by Dr. Naseem Ahmed Khan on health, fitness & natural healing.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {isLoading ? (
              <div className="flex w-full justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : videos?.length === 0 ? (
              <p className="w-full py-8 text-center text-sm text-muted-foreground">No videos yet</p>
            ) : (
              videos?.map((v) => (
                <a
                  key={v.id}
                  href={v.video_url || "#"}
                  target={v.video_url ? "_blank" : undefined}
                  rel={v.video_url ? "noreferrer" : undefined}
                  className="group w-[calc(50%-0.5rem)] transition-all duration-300 hover:-translate-y-1 hover:shadow-soft active:scale-[0.99] md:w-[calc(25%-0.75rem)]"
                >
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt={v.title}
                        loading="lazy"
                        width={800}
                        height={600}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                        <Play className="h-8 w-8 text-primary/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 shadow-soft transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:shadow-soft">
                        <Play className="h-5 w-5 translate-x-0.5 fill-primary text-primary transition-colors duration-300 group-hover:fill-primary-foreground group-hover:text-primary-foreground" />
                      </div>
                    </div>
                    {v.duration && (
                      <span className="absolute bottom-2 right-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
                        {v.duration}
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 text-xs font-medium leading-snug text-foreground transition-colors duration-300 group-hover:text-primary">
                    {v.title}
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
