import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ParticipantContextIfNeeded,
  ParticipantName,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import type { TrackReference, TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { Participant } from "livekit-client";

/**
 * Conference grid for a video consultation.
 *
 * Replaces the stock `VideoConference` component, whose internal paginated
 * grid reconciles tiles through transient id-based keys. A participant's camera
 * placeholder (`<identity>_camera_placeholder`) and their published camera
 * track (`<identity>_camera_TR_<sid>`) have DIFFERENT ids, so when the camera
 * publishes the stale placeholder id is no longer part of the current track
 * array and the layout throws
 * "Error while running updatePages(): Error: Element not part of the array: …".
 *
 * This layout derives its tiles from the current LiveKit state on every render
 * and keys every tile by the STABLE participant identity:
 *  * a participant's placeholder tile and their published-camera tile are the
 *    same React element, so the row is updated in place instead of being
 *    removed and re-added,
 *  * a tile only ever points at a reference (or placeholder) that exists in the
 *    latest `useTracks` output, so no element that is no longer in the current
 *    array is ever referenced again and no stale id can linger after a track is
 *    published,
 *  * there is no retained page/array state to reconcile: participants joining
 *    with (or without) a camera, enabling/disabling the camera, reconnecting,
 *    leaving and track (un)publish all just re-derive the same tile list.
 */
export function ConferenceLayout() {
  const trackRefs = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const tiles = useMemo(() => {
    const byIdentity = new Map<
      string,
      { participant: Participant; camera?: TrackReferenceOrPlaceholder; shares: TrackReference[] }
    >();
    for (const ref of trackRefs) {
      let entry = byIdentity.get(ref.participant.identity);
      if (!entry) {
        entry = { participant: ref.participant, shares: [] };
        byIdentity.set(ref.participant.identity, entry);
      }
      if (ref.source === Track.Source.ScreenShare) {
        if ("publication" in ref && ref.publication) {
          entry.shares.push(ref as TrackReference);
        }
      } else if (ref.source === Track.Source.Camera) {
        entry.camera ??= ref;
      }
    }

    const ordered = [...byIdentity.values()].sort((a, b) =>
      orderParticipants(a.participant, b.participant),
    );

    const tiles: Array<{
      key: string;
      participant: Participant;
      trackRef?: TrackReferenceOrPlaceholder;
    }> = [];
    for (const entry of ordered) {
      if (entry.camera) {
        tiles.push({
          key: entry.participant.identity,
          participant: entry.participant,
          trackRef: entry.camera,
        });
      } else if (entry.shares.length > 0) {
        tiles.push({
          key: entry.participant.identity,
          participant: entry.participant,
          trackRef: entry.shares[0],
        });
      } else {
        tiles.push({ key: entry.participant.identity, participant: entry.participant });
      }
      for (const share of entry.shares) {
        tiles.push({
          key: `share-${entry.participant.identity}-${share.publication?.trackSid ?? "live"}`,
          participant: entry.participant,
          trackRef: share,
        });
      }
    }
    return tiles;
  }, [trackRefs]);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { colCount, rowCount } = useMemo(
    () => gridSize(tiles.length, size.width, size.height),
    [tiles.length, size.width, size.height],
  );

  return (
    <>
      <RoomAudioRenderer />
      <div
        ref={gridRef}
        className="lk-grid-layout min-h-0 w-full flex-1"
        style={{ "--lk-col-count": colCount, "--lk-row-count": rowCount } as CSSProperties}
      >
        {tiles.map((tile) =>
          tile.trackRef ? (
            <ParticipantTile key={tile.key} trackRef={tile.trackRef} />
          ) : (
            <div
              key={tile.key}
              className="lk-participant-tile items-center justify-center gap-1 bg-[var(--lk-bg2)]"
            >
              <ParticipantContextIfNeeded participant={tile.participant}>
                <ParticipantName className="lk-participant-name" />
              </ParticipantContextIfNeeded>
              <span className="text-xs text-[var(--lk-fg-5)]">Waiting for video…</span>
            </div>
          ),
        )}
      </div>
    </>
  );
}

function orderParticipants(a: Participant, b: Participant): number {
  if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
  return (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0);
}

/** Responsive column/row layout: one column when the container is taller than wide. */
function gridSize(tileCount: number, width: number, height: number) {
  if (tileCount <= 1) return { colCount: 1, rowCount: 1 };
  const colCount =
    width >= height ? Math.min(tileCount, Math.max(1, Math.ceil(Math.sqrt(tileCount)))) : 1;
  return { colCount, rowCount: Math.ceil(tileCount / colCount) };
}
