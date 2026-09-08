// Grows a textarea to fit its content, up to a ceiling, then scrolls.
// One job: stop a fixed-height box from hiding what someone just wrote.
//
// Attach the returned ref to a <textarea> and pass the controlled value.
// The measurement runs in a layout effect so the resize happens before the
// browser paints — no flicker, no one-frame jump on every keystroke.
//
// Why height is reset to 'auto' first: scrollHeight only reports the full
// content height when the element isn't already constrained by an explicit
// height. Without the reset, the box grows but never shrinks back.

import { useLayoutEffect, useRef } from 'react';

const DEFAULT_MAX_ROWS = 12;
// Fallback if line-height computes to 'normal' (no numeric px value).
const FALLBACK_LINE_HEIGHT = 20;

export function useAutosizeTextarea<T extends HTMLTextAreaElement>(
  value: string,
  maxRows: number = DEFAULT_MAX_ROWS
) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const styles = window.getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight) || FALLBACK_LINE_HEIGHT;
    const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) || 0;
    const maxHeight = lineHeight * maxRows + verticalPadding;

    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    // Only scroll once the content actually exceeds the ceiling, so short
    // messages never show a scrollbar.
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, maxRows]);

  return ref;
}
