export function isExpiredUtc(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return Date.now() >= expiresAt.getTime();
}

/** Mutations blocked when expired, except PATCH that clears or extends expiresAt. */
export function tableMutationBlocked(
  expiresAt: Date | null | undefined,
  patch?: { expiresAt?: string | null }
): boolean {
  if (!isExpiredUtc(expiresAt)) return false;
  if (!patch || !("expiresAt" in patch)) return true;
  if (patch.expiresAt === null) return false;
  if (patch.expiresAt === undefined) return true;
  const next = new Date(patch.expiresAt);
  if (Number.isNaN(next.getTime())) return true;
  return next.getTime() <= Date.now();
}
