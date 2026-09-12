import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { scrollToHash } from "@/lib/scroll";

interface SectionLinkProps {
  hash: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
  onNavigate?: (hash: string) => void;
}

export function SectionLink({
  hash,
  className,
  ariaLabel,
  children,
  onNavigate,
}: SectionLinkProps) {
  const router = useRouter();

  function handleClick(e: MouseEvent) {
    e.preventDefault();

    onNavigate?.(hash);

    if (window.location.pathname !== "/") {
      void router.navigate({ to: "/", hash });
      return;
    }

    // ONE scroll call only
    scrollToHash(hash);
  }

  return (
    <a href={`/${hash}`} onClick={handleClick} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
