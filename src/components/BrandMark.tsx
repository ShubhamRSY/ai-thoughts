interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <path
        d="M15 51.5C15 40.7 22.6 33 32 33C41.4 33 49 40.7 49 51.5C49 53.4 47.4 55 45.5 55H18.5C16.6 55 15 53.4 15 51.5Z"
        fill="#faf9f7"
      />
      <circle cx="32" cy="22" r="11" fill="#faf9f7" />
      <g stroke="#1f4d45" strokeWidth="1.6" strokeLinecap="round">
        <line x1="27" y1="19.5" x2="36.5" y2="21" />
        <line x1="27" y1="19.5" x2="30.5" y2="26" />
        <line x1="36.5" y1="21" x2="30.5" y2="26" />
      </g>
      <circle cx="27" cy="19.5" r="2" fill="#1f4d45" />
      <circle cx="36.5" cy="21" r="2" fill="#1f4d45" />
      <circle cx="30.5" cy="26" r="2" fill="#1f4d45" />
    </svg>
  );
}
