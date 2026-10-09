import { useLayoutEffect, type RefObject } from "react";

/** Grow a textarea with its text (up to its CSS max-height), and shrink back when cleared. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}
