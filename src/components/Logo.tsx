export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path
        d="M16 1.5l2.6 2.2 3.4-.5 1.4 3.1 3.1 1.4-.5 3.4 2.2 2.6-2.2 2.6.5 3.4-3.1 1.4-1.4 3.1-3.4-.5L16 30.5l-2.6-2.2-3.4.5-1.4-3.1-3.1-1.4.5-3.4L3.8 16 6 13.4l-.5-3.4 3.1-1.4L10 5.5l3.4.5z"
        fill="var(--wax)"
      />
      <path
        d="M20.4 11.4a6 6 0 1 0 0 9.2"
        fill="none"
        stroke="var(--wax-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
