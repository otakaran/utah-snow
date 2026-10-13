// Labelled 5-segment NAC danger scale (tokens.css rule): every segment carries its level word, colors come from
// --nac-* only, and the current level is marked by a taller outlined bar plus aria-current, never by color alone.
import { NAC_SCALE, type NacLevel } from './avy-view.ts';

export function DangerScale({ level }: { level: NacLevel | null }) {
  const label = level === null ? 'Danger scale: no rating' : `Danger ${level} of 5`;
  return (
    <ol class={`cond-scale${level === null ? ' is-none' : ''}`} aria-label={label}>
      {NAC_SCALE.map((s) => (
        <li
          key={s.level}
          class={`cond-seg cond-nac-${s.key}${s.level === level ? ' is-on' : ''}`}
          aria-current={s.level === level ? 'true' : undefined}
        >
          <span class="cond-seg-bar" aria-hidden="true" />
          <span class="cond-seg-long">{s.word}</span>
          <span class="cond-seg-short" aria-hidden="true">
            {s.short}
          </span>
        </li>
      ))}
    </ol>
  );
}
