// Probe allowlist seed (spec §7, Appendix B): hosts no registered adapter probes yet, data only.
// /api/debug/probe uses the union of registered adapters' `probes` and this list (an adapter's entry wins on hostId).
// Delete an entry once an adapter in sources/index.ts covers its host.

export const PROBE_SEED: readonly { hostId: string; url: string }[] = [
  // Cams the browser loads directly (Prism GCS stills, Snowbird Roundshot structure).
  { hostId: 'prism-gcs', url: 'https://storage.googleapis.com/prism-cam-00065/00065_current.txt' },
  { hostId: 'roundshot-snowbird', url: 'https://snowbird.roundshot.com/structure.json' },
  // OSRM (SLC downtown -> Alta) for drive times.
  {
    hostId: 'osrm',
    url: 'https://router.project-osrm.org/route/v1/driving/-111.891,40.761;-111.638,40.590?overview=false',
  },
];
