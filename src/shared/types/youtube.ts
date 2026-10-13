// Row `yt:state` (spec §6.1), written by the youtube job. Imported through src/shared/types.ts, never directly.
// Times are epoch ms.
import type { CHANNELS } from '../../../config/youtube.ts';

export type YtChannel = keyof typeof CHANNELS;
export type YtStatus = 'live' | 'offline' | 'unknown';
export type YtSource = 'api' | 'camstreamer' | 'seed' | 'etag';

export interface YtSlotState {
  videoId: string | null;
  status: YtStatus;
  title: string | null;
  actualStartTime: string | null; // ISO, from the Data API
  thumbKind: 'live' | 'custom';
  maxres: boolean | null; // first-sight maxresdefault_live HEAD (keyed only); null = never checked
  lastLiveAt: number | null;
  deadSince: number | null;
  apiAt: number | null; // last Data API classification
  source: YtSource; // the signal behind `status`
  etag: string | null; // hqdefault_live ETag of `videoId`; resets when the ID changes
  etagAt: number | null;
  csMisses: number; // consecutive CamStreamer "not live" answers
}
export interface YtSeen {
  channel: YtChannel;
  title: string;
  live: boolean;
  checkedAt: number;
}
export interface YtUnmapped {
  videoId: string;
  channel: YtChannel;
  title: string;
}
export interface YtState {
  v: 1;
  mode: 'api' | 'keyless';
  at: number; // job time
  slots: Record<string, YtSlotState>; // by cam id
  seen: Record<string, YtSeen>; // by video id; pruned to 30 days (Developer Policies III.E.4)
  unmapped: YtUnmapped[];
  lastDiscovery: Partial<Record<YtChannel, number>>;
  retries: Partial<Record<YtChannel, number>>;
  etagCursor: number;
  unitsTick: number; // Data API units this run spent; the dispatcher adds them to counter yt:units:{PT date}
}
