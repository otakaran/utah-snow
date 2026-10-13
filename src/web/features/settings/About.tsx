// About (spec §8.5 item 8): build ids, repo, license, source links. Tapping the build id 5 times toggles the
// hidden Admin panel, which lists the YouTube titles no slot regex matched (`unmapped` from /api/cams, §11).
import { useEffect, useRef } from 'preact/hooks';
import { RESORTS } from '../../../../config/resorts.ts';
import { camsStatus, ensureCams, unmappedVideos } from '../../data/cams.ts';
import { CLIENT_BUILD, health } from '../../data/health.ts';
import { admin, setAdmin } from '../../data/settings.ts';
import { CREDITS, REPO_URL } from '../../ui/Attribution.tsx';

const STATUS_NOTE = {
  idle: 'Loading…',
  error: 'Unavailable: /api/cams failed; retrying.',
} as const;

function AdminPanel() {
  useEffect(() => ensureCams(), []);
  const status = camsStatus.value;
  const list = unmappedVideos.value;
  return (
    <div class="admin" data-testid="settings-admin">
      <h3>Admin: unmapped YouTube titles</h3>
      {status !== 'ok' && list.length === 0 ? (
        <p class="field-note">{STATUS_NOTE[status]}</p>
      ) : list.length === 0 ? (
        <p class="field-note">None. Every live title matches a cam slot.</p>
      ) : (
        <ul class="plain-list">
          {list.map((u) => (
            <li key={u.videoId}>
              <a href={`https://www.youtube.com/watch?v=${u.videoId}`} target="_blank" rel="noreferrer">
                {u.title}
              </a>{' '}
              <span class="dim">({u.channel})</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="btn" onClick={() => setAdmin(false)}>
        Hide admin
      </button>
    </div>
  );
}

export function About() {
  const taps = useRef(0);
  const onBuildTap = () => {
    taps.current += 1;
    if (taps.current >= 5) {
      taps.current = 0;
      setAdmin(!admin.value);
    }
  };
  return (
    <div class="about">
      <dl class="facts">
        <dt class="field-label">Build</dt>
        <dd>
          <button type="button" class="link-btn build-id num" onClick={onBuildTap} data-testid="about-build">
            web {CLIENT_BUILD}
          </button>{' '}
          · api <span class="num">{health.value?.version ?? '…'}</span>
        </dd>
        <dt class="field-label">Code</dt>
        <dd>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>{' '}
          ·{' '}
          <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            MIT license
          </a>
        </dd>
      </dl>
      <div class="about-lists">
        <div>
          <h3>Data sources</h3>
          <ul class="plain-list">
            {CREDITS.map((c) => (
              <li key={c.name}>
                <a href={c.href} target="_blank" rel="noreferrer">
                  {c.name}
                </a>{' '}
                <span class="dim">· {c.what}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Resorts</h3>
          <ul class="plain-list">
            {Object.values(RESORTS).map((r) => (
              <li key={r.name}>
                <a href={r.links.conditions} target="_blank" rel="noreferrer">
                  {r.name}
                </a>{' '}
                <span class="dim">· Snow report, lifts and cams</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {admin.value ? <AdminPanel /> : null}
    </div>
  );
}
