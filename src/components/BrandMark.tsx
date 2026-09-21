import { useId } from "react";

interface BrandMarkProps {
  className?: string;
}

/** Glyph of public/icons/app-icon.svg (drawn in its 512-space) — sits on the accent tile. */
export default function BrandMark({ className }: BrandMarkProps) {
  const id = useId();
  const feel = `${id}-feel`;
  const cut = `${id}-cut`;
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id={feel} gradientUnits="userSpaceOnUse" x1="190" y1="0" x2="322" y2="0">
          <stop offset="0" stopColor="#3a7266" />
          <stop offset=".5" stopColor="#1f4d45" />
          <stop offset="1" stopColor="#163832" />
        </linearGradient>
        <mask id={cut}>
          <rect width="512" height="512" fill="#fff" />
          <circle cx="256" cy="176" r="102" fill="#000" />
        </mask>
      </defs>
      <g transform="translate(32 32) scale(.125) translate(-256 -264)">
        <path
          mask={`url(#${cut})`}
          d="M120 412C120 325.6 180.8 264 256 264C331.2 264 392 325.6 392 412C392 427.2 379.2 440 364 440H148C132.8 440 120 427.2 120 412Z"
          fill="#faf9f7"
        />
        <circle cx="256" cy="176" r="88" fill="#faf9f7" />
        <g stroke={`url(#${feel})`} strokeWidth="14" strokeLinecap="round" fill={`url(#${feel})`}>
          <line x1="256" y1="176" x2="198" y2="142" />
          <line x1="256" y1="176" x2="316" y2="144" />
          <line x1="256" y1="176" x2="226" y2="222" />
          <line x1="256" y1="176" x2="302" y2="217" />
          <circle cx="198" cy="142" r="16" stroke="none" />
          <circle cx="316" cy="144" r="16" stroke="none" />
          <circle cx="226" cy="222" r="13" stroke="none" />
          <circle cx="302" cy="217" r="13" stroke="none" />
          <circle cx="256" cy="176" r="26" stroke="none" />
        </g>
        <circle cx="256" cy="176" r="10" fill="#faf9f7" />
      </g>
    </svg>
  );
}
