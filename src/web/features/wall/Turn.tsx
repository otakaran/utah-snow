// The wall's rotation bar: fills along its parent's bottom edge over one `s`-second turn, CSS only (wall/grid.css
// .wall-turn). The caller keys it per turn to restart the fill and leaves it out while paused. Used by the rotating
// grid cells, the featured YouTube cell and the weather page.
export function Turn({ s }: { s: number }) {
  return <i class="wall-turn" style={{ '--turn': `${s}s` }} data-testid="wall-turn" aria-hidden="true" />;
}
