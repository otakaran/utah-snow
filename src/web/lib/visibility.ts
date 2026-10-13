// Visibility scheduler (spec §8.3): one setInterval(5000) loop drives every cam tile's refresh, and one shared
// IntersectionObserver (25% threshold) tells tiles and players whether they are on screen. A job runs when it is
// due, its element is at least 25% visible and the page is visible; `always` jobs (the TV wall) skip both checks.
import { signal } from '@preact/signals';

const TICK_MS = 5000;
const THRESHOLD = 0.25;

export interface Job {
  el: Element | null;
  /** Local epoch ms the job wants to run at; checked every tick. */
  dueAt: () => number;
  run: () => void;
  always?: boolean;
}

const pageIsVisible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';

/** document.visibilityState === 'visible', kept current. */
export const pageVisible = signal(pageIsVisible());

const jobs = new Set<Job>();
const inView = new WeakMap<Element, boolean>();
const watchers = new Map<Element, Set<(visible: boolean) => void>>();
let observer: IntersectionObserver | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let listening = false;

function tick(): void {
  const now = Date.now();
  const page = pageIsVisible();
  for (const job of jobs) {
    if (now < job.dueAt()) continue;
    if (!job.always && (!page || !(job.el && inView.get(job.el)))) continue;
    job.run();
  }
}

function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    pageVisible.value = pageIsVisible();
    if (pageVisible.value) tick(); // catch up right away instead of waiting up to 5 s
  });
}

function getObserver(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const visible = e.isIntersecting && e.intersectionRatio >= THRESHOLD;
        const was = inView.get(e.target);
        inView.set(e.target, visible);
        if (was !== visible) for (const cb of watchers.get(e.target) ?? []) cb(visible);
      }
    },
    { threshold: [0, THRESHOLD] },
  );
  return observer;
}

/** Tracks whether `el` is at least 25% on screen; `cb` fires on every change. Returns the unsubscribe. */
export function watchInView(el: Element, cb: (visible: boolean) => void): () => void {
  listen();
  const obs = getObserver();
  if (!obs) {
    inView.set(el, true); // no IntersectionObserver: treat everything as visible
    cb(true);
    return () => {};
  }
  let set = watchers.get(el);
  if (!set) {
    set = new Set();
    watchers.set(el, set);
    obs.observe(el);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size > 0) return;
    watchers.delete(el);
    obs.unobserve(el);
  };
}

/** True when `el` was last reported at least 25% visible. */
export const isInView = (el: Element): boolean => inView.get(el) === true;

/** Adds a job to the 5 s loop (its element is observed while scheduled). Returns the unschedule. */
export function schedule(job: Job): () => void {
  listen();
  const unwatch = job.el ? watchInView(job.el, () => {}) : () => {};
  jobs.add(job);
  timer ??= setInterval(tick, TICK_MS);
  return () => {
    jobs.delete(job);
    unwatch();
    if (jobs.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Calls `cb` on every page visibility change (true = visible). Returns the unsubscribe. */
export function onPageVisibility(cb: (visible: boolean) => void): () => void {
  listen();
  const handler = () => cb(pageIsVisible());
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
