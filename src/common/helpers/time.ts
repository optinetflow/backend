export function isRecentlyConnected(date: Date) {
  const diffMs = Math.abs(Date.now() - date.getTime());

  // Check if the difference is less than 1.5 minutes (1.5 * 60 * 1000 milliseconds)
  return diffMs < 1.5 * 60 * 1000;
}
