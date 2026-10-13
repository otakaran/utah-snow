// Page section with the B "map legend" heading: optional index number, title, dashed rule, sub-line on the right.
// Every briefing/resort/settings section root carries the data-testid the spec names, also as its id (a JumpBar
// target; .section keeps it clear of the sticky bar). Presentational only.
import type { ComponentChildren } from 'preact';

interface Props {
  testid: string;
  title: string;
  /** Small accent number before the title, e.g. '02'. */
  index?: string;
  /** Right-aligned note in the heading, e.g. 'UDOT · 4 min ago'. */
  sub?: ComponentChildren;
  class?: string;
  children: ComponentChildren;
}

export function Section({ testid, title, index, sub, class: cls, children }: Props) {
  const id = `${testid}-title`;
  return (
    <section id={testid} data-testid={testid} class={cls ? `section ${cls}` : 'section'} aria-labelledby={id}>
      <h2 class="sec-h" id={id}>
        {index ? <span class="sec-no">{index}</span> : null}
        <span class="sec-title">{title}</span>
        {sub ? <span class="sec-sub">{sub}</span> : null}
      </h2>
      {children}
    </section>
  );
}
