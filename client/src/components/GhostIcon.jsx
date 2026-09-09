export default function GhostIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 20V11a6 6 0 0 1 12 0v9l-2.2-1.6L14 20l-2-1.6L10 20l-1.8-1.6L6 20Z" />
      <circle cx="9.6" cy="10.6" r=".9" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="10.6" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}
