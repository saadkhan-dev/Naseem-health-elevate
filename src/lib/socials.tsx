import type { ComponentType } from "react";

/**
 * Public links for the clinic's pages. Google is still a placeholder until the
 * real business listing is available; YouTube now points to the clinic channel.
 */
export const GOOGLE_PLACEHOLDER = "#";
export const YOUTUBE_PLACEHOLDER = "https://youtube.com/@naseemkhan-u2t?si=jAG4ZZk8AkuP1Dcn";

/** Icons used by the social link groups (single source of truth for both the Home hero and footer). */
export type SocialIcon = ComponentType<{ className?: string }>;

/** Recognizable four-color Google "G" mark (inline SVG, matches lucide's 1em sizing). */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      width="1em"
      height="1em"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.883 30.621 30.304 33 24 33c-4.966 0-9-4.034-9-9s4.034-9 9-9c2.31 0 4.417.879 6.036 2.307l5.657-5.657C33.667 8.438 29.1 6 24 6 14.059 6 6 14.059 6 24s8.059 18 18 18 18-8.059 18-18c0-1.319-.113-2.601-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c2.31 0 4.417.879 6.036 2.307l5.657-5.657C33.667 6.438 29.1 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.319-.113-2.601-.389-3.917z"
      />
    </svg>
  );
}
