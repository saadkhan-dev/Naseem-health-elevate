import { Play, Loader2, Clapperboard } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { usePublishedVideos } from "@/hooks/queries/useContent";

export function VideoGallery() {
  const { data: videos, isLoading } = usePublishedVideos();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <section className="relative overflow-hidden bg-black px-4 sm:px-6 lg:px-8 text-white">
      {/* Soothing deep teal/emerald ambient glow — easy on the eyes */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/3 h-96 w-96 rounded-full bg-emerald-500/[0.07] blur-[140px]" />
        <div className="absolute -right-24 top-1/2 h-96 w-96 rounded-full bg-teal-500/[0.06] blur-[150px]" />
        <div className="absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-cyan-500/[0.06] blur-[140px]" />
      </div>
      <div ref={ref} className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Health Education
          </span>
          <h2 className="mt-5 font-serif-display text-4xl sm:text-5xl font-bold text-white mb-2 lg:text-6xl">
            Health Awareness{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(52,211,153,0.3)]">
              Videos
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
            Learn from <span className="font-semibold text-emerald-300">Dr. Naseem Ahmed Khan</span>{" "}
            about health, fitness &amp; natural healing.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mx-auto mt-16 max-w-5xl"
        >
          {isLoading ? (
            <div className="flex w-full justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            </div>
          ) : videos?.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 backdrop-blur-sm py-16 text-center shadow-lg">
              <Clapperboard className="mx-auto h-10 w-10 text-white/20" />
              <p className="mt-4 text-sm text-white/40 italic">No videos yet</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-6">
              {videos?.map((v, index) => (
                <motion.a
                  key={v.id}
                  href={v.video_url || "#"}
                  target={v.video_url ? "_blank" : undefined}
                  rel={v.video_url ? "noreferrer" : undefined}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ duration: 0.5, delay: 0.4 + (index % 4) * 0.1 }}
                  className="group w-[calc(100%-1rem)] sm:w-[calc(50%-1rem)] md:w-[calc(33.333%-1rem)] lg:w-[calc(25%-1rem)] flex flex-col rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md p-3 transition-all duration-300 hover:-translate-y-2 hover:bg-white/10 hover:border-emerald-400/40 hover:shadow-2xl"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/50 border border-white/5">
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt={v.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-400/20 to-emerald-400/5">
                        <Play className="h-8 w-8 text-emerald-400/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg transition-all duration-300 group-hover:scale-125 group-hover:bg-emerald-400/80 group-hover:border-emerald-300">
                        <Play className="h-5 w-5 translate-x-0.5 fill-white text-white transition-colors duration-300" />
                      </div>
                    </div>
                    {v.duration && (
                      <span className="absolute bottom-2 right-2 rounded-md bg-black/80 backdrop-blur-sm border border-white/10 px-2 py-0.5 text-[10px] font-medium text-white">
                        {v.duration}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 mb-2 px-1 text-sm font-medium leading-snug text-white/80 transition-colors duration-300 group-hover:text-emerald-300">
                    {v.title}
                  </div>
                </motion.a>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
