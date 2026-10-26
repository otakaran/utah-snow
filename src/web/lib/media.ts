// useMediaQuery: a CSS media query as a boolean that re-renders on change. Read synchronously on the first render
// (a one-frame wrong answer could mount what the query holds back, e.g. a closed resort card's hero still).
// False without matchMedia.
import { useEffect, useState } from 'preact/hooks';

const list = (query: string): MediaQueryList | null => (typeof matchMedia === 'function' ? matchMedia(query) : null);

export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => list(query)?.matches ?? false);
  useEffect(() => {
    const mq = list(query);
    if (!mq) return;
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}
