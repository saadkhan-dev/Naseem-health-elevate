/** Bell badge label: hidden at 0, exact up to 9, then "9+". */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count >= 10 ? "9+" : String(count);
}
