// One HDRelay live session on a <video> (spec §8.3 HlsPlayer). Native HLS on Apple (Safari, every iOS browser,
// iPadOS), hls.js elsewhere (its light build, code-split via importWithReload, pinned 1.7.3). Recovery: a fatal
// MEDIA_ERROR gets recoverMediaError() at most once per 60 s; network errors, a 404 on the session chunklist or a
// 10 s stall (watchdog) restart the session from the master playlist (a new HDRelay session) after 2/5/15/60 s.
// After 3 failed attempts the session gives up, except on the wall, which retries forever.
import type Hls from 'hls.js';
import type { ErrorData } from 'hls.js';
import { importWithReload } from '../../lib/build-guard.ts';

export type HlsState = 'loading' | 'playing' | 'retrying' | 'failed' | 'unsupported';

const HLS_CONFIG = {
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 5,
  maxLiveSyncPlaybackRate: 1.1,
  backBufferLength: 10,
};
const BACKOFF_MS = [2000, 5000, 15_000, 60_000];
const MAX_ATTEMPTS = 3;
const MEDIA_RECOVER_GAP_MS = 60_000;
const STALL_MS = 10_000;
const WATCH_MS = 2000;
const STEADY_MS = 60_000; // playing this long resets the attempt count

const isApple = (video: HTMLVideoElement): boolean =>
  navigator.vendor.startsWith('Apple') && video.canPlayType('application/vnd.apple.mpegurl') !== '';

type HlsClass = typeof Hls;

export class HlsSession {
  private hls: Hls | null = null;
  private Hls: HlsClass | null = null;
  private native = false;
  private attempts = 0;
  private lastMediaRecover = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private lastTime = -1;
  private lastAdvance = 0;
  private playingSince = 0;
  private paused = false;
  private dead = false;
  private readonly video: HTMLVideoElement;
  private readonly url: string;
  private readonly unlimited: boolean;
  private readonly onState: (s: HlsState) => void;

  constructor(video: HTMLVideoElement, url: string, unlimited: boolean, onState: (s: HlsState) => void) {
    this.video = video;
    this.url = url;
    this.unlimited = unlimited;
    this.onState = onState;
  }

  async start(): Promise<void> {
    this.onState('loading');
    this.native = isApple(this.video);
    if (!this.native) {
      try {
        this.Hls = (await importWithReload(() => import('hls.js/light'))).default;
      } catch {
        if (!this.dead) this.onState('unsupported'); // chunk failed to load (offline or a redeploy)
        return;
      }
      if (this.dead) return;
      if (!this.Hls.isSupported()) {
        this.onState('unsupported');
        return;
      }
    }
    this.video.addEventListener('playing', this.onPlaying);
    this.video.addEventListener('error', this.onVideoError);
    this.attach(false);
    this.watchTimer = setInterval(this.watch, WATCH_MS);
  }

  /** Offscreen or hidden: stop downloading, keep the session. */
  pause(): void {
    if (this.dead || this.paused) return;
    this.paused = true;
    this.video.pause();
    this.hls?.stopLoad();
  }

  /** Back on screen: jump to the live edge again. */
  resume(): void {
    if (this.dead || !this.paused) return;
    this.paused = false;
    this.lastAdvance = Date.now();
    if (this.native) this.attach(true);
    else this.hls?.startLoad(-1);
    this.play();
  }

  destroy(): void {
    this.dead = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.watchTimer !== null) clearInterval(this.watchTimer);
    this.video.removeEventListener('playing', this.onPlaying);
    this.video.removeEventListener('error', this.onVideoError);
    this.hls?.destroy();
    this.hls = null;
    this.video.removeAttribute('src');
    this.video.load();
  }

  private play(): void {
    this.video.play().catch(() => {}); // muted autoplay can still be refused (low power mode); the user can tap
  }

  private attach(bust: boolean): void {
    this.lastTime = -1;
    this.lastAdvance = Date.now();
    if (this.native) {
      this.video.src = bust ? `${this.url}?r=${Date.now()}` : this.url;
      this.play();
      return;
    }
    const H = this.Hls;
    if (!H) return;
    this.hls?.destroy();
    const hls = new H(HLS_CONFIG);
    hls.on(H.Events.ERROR, (_e, data) => this.onHlsError(data));
    hls.on(H.Events.MANIFEST_PARSED, () => this.play());
    hls.loadSource(this.url);
    hls.attachMedia(this.video);
    this.hls = hls;
  }

  private onHlsError(data: ErrorData): void {
    const H = this.Hls;
    if (!H || this.dead) return;
    const chunklist404 = data.details === H.ErrorDetails.LEVEL_LOAD_ERROR && data.response?.code === 404;
    if (!data.fatal && !chunklist404) return;
    if (data.type === H.ErrorTypes.MEDIA_ERROR && Date.now() - this.lastMediaRecover >= MEDIA_RECOVER_GAP_MS) {
      this.lastMediaRecover = Date.now();
      this.hls?.recoverMediaError();
      return;
    }
    this.fail(); // network error, chunklist 404, a second media error within 60 s, or anything else fatal
  }

  private onVideoError = (): void => {
    if (this.native && !this.dead) this.fail();
  };

  private onPlaying = (): void => {
    this.playingSince = Date.now();
    this.onState('playing');
  };

  private watch = (): void => {
    if (this.dead || this.paused || this.retryTimer !== null) return;
    const now = Date.now();
    const t = this.video.currentTime;
    if (t !== this.lastTime) {
      this.lastTime = t;
      this.lastAdvance = now;
      if (this.playingSince && now - this.playingSince >= STEADY_MS) this.attempts = 0;
      return;
    }
    if (!this.video.paused && now - this.lastAdvance >= STALL_MS) this.fail();
  };

  private fail(): void {
    if (this.dead || this.retryTimer !== null) return;
    this.playingSince = 0;
    if (!this.unlimited && this.attempts >= MAX_ATTEMPTS) {
      this.onState('failed');
      return;
    }
    const wait = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)] ?? 60_000;
    this.attempts += 1;
    this.hls?.destroy();
    this.hls = null;
    this.onState('retrying');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.dead) this.attach(true);
    }, wait);
  }
}
