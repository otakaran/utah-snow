// Modal viewer for a cam image, player or scrubber (spec §8.3). Native <dialog>: focus trap, Esc and the
// top layer come from the browser. Children mount only while open, so players stop when it closes.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accessible name and visible title, e.g. "Alta – Mount Baldy webcam". */
  label: string;
  children: ComponentChildren;
  testid?: string;
}

export function Lightbox({ open, onClose, label, children, testid = 'lightbox' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // A click whose target is the dialog itself landed on the backdrop (the body fills the dialog box).
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes a modal <dialog> natively; the click is backdrop-only.
    <dialog ref={ref} class="lightbox" aria-label={label} data-testid={testid} onClose={onClose} onClick={onBackdrop}>
      <div class="lightbox-bar">
        <p class="lightbox-title">{label}</p>
        <button type="button" class="btn-icon" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div class="lightbox-body">{open ? children : null}</div>
    </dialog>
  );
}
