// YouTube IFrame Player API (spec §8.3): https://www.youtube.com/iframe_api is loaded once, lazily, the first time
// a YouTube tile is tapped. Only the few controller methods the cams feature calls are typed here.

export interface YtPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getDuration(): number;
  loadVideoById(videoId: string): void;
  destroy(): void;
}
interface YtPlayerOptions {
  events: { onReady?: (e: { target: YtPlayer }) => void; onError?: (e: { data: number }) => void };
}
interface YtNamespace {
  Player: new (el: HTMLIFrameElement, opts: YtPlayerOptions) => YtPlayer;
}
type YtWindow = Window & { YT?: Partial<YtNamespace>; onYouTubeIframeAPIReady?: () => void };

const API_URL = 'https://www.youtube.com/iframe_api';
const TIMEOUT_MS = 20_000;
let loading: Promise<YtNamespace> | null = null;

/** Resolves with window.YT once the API is ready; rejects after 20 s (blocked or offline) so a retry can start over. */
export function loadYtApi(): Promise<YtNamespace> {
  const w = window as YtWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT as YtNamespace);
  loading ??= new Promise<YtNamespace>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error('YouTube API timeout'));
    }, TIMEOUT_MS);
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      if (w.YT?.Player) resolve(w.YT as YtNamespace);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error('YouTube API failed to load'));
    };
    document.head.append(script);
  });
  return loading;
}

/** The embed URL, exactly as spec §8.3 fixes it (muted autoplay inline, JS API on, no related videos). */
export function ytEmbedUrl(videoId: string): string {
  const query = `autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0&origin=${encodeURIComponent(location.origin)}`;
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${query}`;
}
