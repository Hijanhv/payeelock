import type { SVGProps } from 'react';

/** A payment path folds back into a closed destination. Original vector mark. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path d="M5 35V5h19c7 0 11 4 11 11s-4 11-11 11H15v8H5Z" fill="currentColor" />
      <path d="M15 14h8a3 3 0 0 1 0 6h-8v-6Z" fill="var(--canvas, white)" />
      <path d="M21 27v8h14V21" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
