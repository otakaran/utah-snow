// Custom base form (spec §8.5, §4.6): name, lat, lon, [Use my location] and a pasted Google Maps link; no geocoder.
// Saving validates through checkCustomBase (Wasatch bounds, 1-30 char name, 3 dp). Drive times then come from
// GET /api/drive (data/drive.ts); until they arrive, or when it fails, the nearest preset's row shows as "≈".
import { useState } from 'preact/hooks';
import { CUSTOM_BOUNDS, GEO_OPTIONS } from '../../../../config/bases.ts';
import { roundPoint } from '../../../shared/geo.ts';
import { type DriveStatus, driveStatus } from '../../data/drive.ts';
import { base, checkCustomBase, labelOk, setBase } from '../../data/settings.ts';
import { parseMapsLink } from './parse-maps-link.ts';

const OUTSIDE = 'Outside the Wasatch area';
const [MIN_NAME, MAX_NAME] = CUSTOM_BOUNDS.labelLen;
const STATUS: Record<DriveStatus, string> = {
  idle: '',
  loading: 'Computing drive times (about 10 seconds). Until then: ≈ the nearest preset.',
  ok: 'Drive times computed for this point (OSRM, free-flow).',
  partial: 'Some resorts could not be routed; they show ≈ the nearest preset.',
  'rate-limited': 'The daily drive-time limit is used up; ≈ the nearest preset until tomorrow.',
  error: 'Drive times are unavailable right now; ≈ the nearest preset.',
};

export function CustomBase() {
  const b = base.value;
  const cur = 'custom' in b ? b.custom : null;
  const [label, setLabel] = useState(cur?.label ?? '');
  const [lat, setLat] = useState(cur ? String(cur.lat) : '');
  const [lon, setLon] = useState(cur ? String(cur.lon) : '');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const fill = (p: { lat: number; lon: number }) => {
    const r = roundPoint(p);
    setLat(String(r.lat));
    setLon(String(r.lon));
    setMsg(null);
  };

  const onLink = (text: string) => {
    setLink(text);
    if (!text.trim()) return setMsg(null);
    const r = parseMapsLink(text);
    if ('error' in r) setMsg(r.error);
    else fill(r);
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return setMsg('Location is not available in this browser');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        fill({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLabel((l) => l.trim() || 'My location');
      },
      (err) => {
        setLocating(false);
        setMsg(err.code === err.PERMISSION_DENIED ? 'Location permission was denied' : 'Location is unavailable');
      },
      GEO_OPTIONS,
    );
  };

  const save = (e: Event) => {
    e.preventDefault();
    const ok = checkCustomBase(Number(lat), Number(lon), label); // an empty field is 0, outside the bounds
    if (!ok) return setMsg(labelOk(label) ? OUTSIDE : `Name the base (${MIN_NAME}-${MAX_NAME} characters)`);
    setMsg(null);
    setLat(String(ok.lat));
    setLon(String(ok.lon));
    setBase({ custom: ok });
  };

  return (
    <form class={`base-custom${cur ? ' is-on' : ''}`} onSubmit={save} noValidate data-testid="base-custom">
      <p class="base-name">Custom base</p>
      {cur ? (
        <p class="base-drive" data-testid="base-custom-active">
          In use: {cur.label} ({cur.lat}, {cur.lon})
        </p>
      ) : null}
      <div class="field-grid">
        <label class="field field-wide">
          <span class="field-label">Name</span>
          <input
            type="text"
            maxLength={MAX_NAME}
            placeholder="Hotel, cabin…"
            value={label}
            onInput={(e) => setLabel(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field-label">Latitude</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="40.620"
            value={lat}
            onInput={(e) => setLat(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field-label">Longitude</span>
          <input
            type="text"
            autoComplete="off"
            placeholder="-111.810"
            value={lon}
            onInput={(e) => setLon(e.currentTarget.value)}
          />
        </label>
        <label class="field field-wide">
          <span class="field-label">Paste Google Maps link</span>
          <input
            type="url"
            placeholder="https://www.google.com/maps/…"
            value={link}
            onInput={(e) => onLink(e.currentTarget.value)}
          />
        </label>
      </div>
      <div class="base-custom-actions">
        <button type="button" class="btn" onClick={locate} disabled={locating}>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <button type="submit" class="btn btn-primary">
          Use this base
        </button>
      </div>
      {msg ? (
        <p class="base-custom-error" role="alert" data-testid="base-custom-error">
          <span aria-hidden="true">▲ </span>
          {msg}
        </p>
      ) : null}
      {cur && STATUS[driveStatus.value] ? (
        <p class="field-note" data-testid="drive-status">
          {STATUS[driveStatus.value]}
        </p>
      ) : null}
      <p class="field-note">
        No address search: use your location, paste a full Google Maps link, or type the coordinates. Wasatch Front and
        Back only (lat {CUSTOM_BOUNDS.lat.join('–')}, lon {CUSTOM_BOUNDS.lon.join(' to ')}).
      </p>
    </form>
  );
}
