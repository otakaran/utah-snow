// The person's crew-color mark: a short vertical bar before the name (a bar, so it never reads as a status glyph).
// Decorative: the name beside it carries the meaning.
export function CrewMark({ crew }: { crew: string | undefined }) {
  return crew ? <i class={`trk-mark ${crew}`} aria-hidden="true" /> : null;
}
