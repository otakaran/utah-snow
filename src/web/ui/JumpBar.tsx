// In-page jump row: one button per target `id`, a tap scrolls it to the top (smooth unless reduced motion).
// <JumpBar items={[{ id, label, accent?, star? }]} sticky? /> sticks to the viewport top by default (sticky={false}
// keeps it in flow); targets that are `.section`s keep clear of it via scroll-margin-top: var(--jump-h, 48px).
import './jumpbar.css';

export interface JumpItem {
  id: string;
  label: string;
  /** Accent ink and edge, e.g. the pick resort. */
  accent?: boolean;
  /** A ★ before the label, e.g. the pick resort. */
  star?: boolean;
}

function jump(id: string): void {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}

export function JumpBar({ items, sticky = true }: { items: JumpItem[]; sticky?: boolean }) {
  if (items.length === 0) return null;
  return (
    <nav class={sticky ? 'jumpbar jumpbar-sticky' : 'jumpbar'} aria-label="Jump to section" data-testid="jumpbar">
      {items.map((it) => (
        <button key={it.id} type="button" class={it.accent ? 'jump jump-accent' : 'jump'} onClick={() => jump(it.id)}>
          {it.star ? (
            <span class="jump-star" aria-hidden="true">
              ★
            </span>
          ) : null}
          {it.label}
        </button>
      ))}
    </nav>
  );
}
