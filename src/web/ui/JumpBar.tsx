// In-page jump row: one button per target `id`, a tap scrolls it to the top (smooth unless reduced motion); an item
// with an `href` is a link instead (the resort page's other resorts). Targets are section roots (ui/Section sets
// id = testid); `.section` keeps them clear of the bar via scroll-margin-top: var(--jump-h).
// <JumpBar items={[{ id, label, accent?, star?, href?, current?, rule? }]} sticky? label? /> sticks to the viewport
// top by default (sticky={false} keeps it in flow).
import { Fragment } from 'preact';
import './jumpbar.css';

export interface JumpItem {
  /** The target element's id; only a key for an `href` item. */
  id: string;
  label: string;
  /** A link instead of a jump button. */
  href?: string;
  /** The page the link points at (aria-current). */
  current?: boolean;
  /** Accent ink and edge, e.g. the pick resort. */
  accent?: boolean;
  /** A ★ before the label: today's pick. */
  star?: boolean;
  /** A thin rule after it, ending a group. */
  rule?: boolean;
}

function jump(id: string): void {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}

function Label({ it }: { it: JumpItem }) {
  return (
    <>
      {it.star ? (
        <>
          <span class="jump-star" aria-hidden="true">
            ★
          </span>
          <span class="sr-only">Today's pick: </span>
        </>
      ) : null}
      {it.label}
    </>
  );
}

interface Props {
  items: JumpItem[];
  sticky?: boolean;
  /** The nav's accessible name. */
  label?: string;
}

export function JumpBar({ items, sticky = true, label = 'Jump to section' }: Props) {
  if (items.length === 0) return null;
  return (
    <nav class={sticky ? 'jumpbar jumpbar-sticky' : 'jumpbar'} aria-label={label} data-testid="jumpbar">
      {items.map((it) => {
        const cls = it.accent ? 'jump jump-accent' : 'jump';
        return (
          <Fragment key={it.id}>
            {it.href ? (
              <a class={cls} href={it.href} aria-current={it.current ? 'page' : undefined}>
                <Label it={it} />
              </a>
            ) : (
              <button type="button" class={cls} onClick={() => jump(it.id)}>
                <Label it={it} />
              </button>
            )}
            {it.rule ? <span class="jump-rule" aria-hidden="true" /> : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
