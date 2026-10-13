// Status plate (tokens.css rule: shape + word + color, same on phone and wall). Presentational only.
// `stale` turns any status into the dashed off plate reading "LAST KNOWN: OPEN?", never a solid OPEN.
import type { ComponentChildren } from 'preact';
import { lastKnown, type Tone } from './status.ts';

interface Props {
  tone: Tone;
  /** The status word ('Open', 'Closed', 'Hold' ...); rendered upper-case by CSS. */
  word: string;
  /** Data is past its freshness window: dashed off plate, word becomes "Last known: {word}?". */
  stale?: boolean;
  size?: 'sm' | 'lg';
  /** Optional extra after the word, e.g. an ETO time. */
  children?: ComponentChildren;
  title?: string;
}

export function StatusChip({ tone, word, stale = false, size = 'sm', children, title }: Props) {
  const shown = stale ? 'off' : tone;
  return (
    <span class={`chip chip-${shown}${size === 'lg' ? ' chip-lg' : ''}`} data-tone={shown} title={title}>
      <Glyph tone={shown} />
      <span class="chip-word">{stale ? lastKnown(word) : word}</span>
      {children}
    </span>
  );
}

/** The bare status shape (circle / triangle / diamond / dashed ring) in currentColor. */
export function Glyph({ tone }: { tone: Tone }) {
  return <i class={`glyph glyph-${tone}`} aria-hidden="true" />;
}
