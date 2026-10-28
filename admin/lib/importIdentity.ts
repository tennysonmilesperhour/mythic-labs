export type ImportIdentity = { id: string } | undefined;

/** Only skip a keyed row after both it and its resolved target exist in the same project. */
export function sameResolvedOwner(owner: ImportIdentity, target: ImportIdentity): boolean {
  return !!owner && !!target && owner.id === target.id;
}

/** A name fallback cannot override an explicitly supplied but different repository identity. */
export function nameMatchCompatible(
  owner: string | null | undefined,
  repo: string | null | undefined,
  existingOwner: string | null,
  existingRepo: string | null
): boolean {
  if (!owner && !repo) return true;
  return !!owner && !!repo && existingOwner?.toLowerCase() === owner.toLowerCase() && existingRepo?.toLowerCase() === repo.toLowerCase();
}

export function validImportProjectKey(sourceKey: unknown, name: unknown): sourceKey is string {
  return typeof sourceKey === "string" && !!sourceKey.trim() && sourceKey === sourceKey.trim() && typeof name === "string" && !!name.trim();
}
