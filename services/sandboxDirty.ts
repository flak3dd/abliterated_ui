const dirty = new Map<string, Set<string>>();
const deleted = new Map<string, Set<string>>();
const replaceAll = new Set<string>();

export function markFileDirty(envId: string, path: string) {
  if (!envId || !path) return;
  deleted.get(envId)?.delete(path);
  let set = dirty.get(envId);
  if (!set) {
    set = new Set();
    dirty.set(envId, set);
  }
  set.add(path);
}

export function markFileDeleted(envId: string, path: string) {
  if (!envId || !path) return;
  dirty.get(envId)?.delete(path);
  let set = deleted.get(envId);
  if (!set) {
    set = new Set();
    deleted.set(envId, set);
  }
  set.add(path);
}

export function markEnvReplaceAll(envId: string) {
  if (!envId) return;
  replaceAll.add(envId);
  dirty.delete(envId);
  deleted.delete(envId);
}

export function markEnvAllDirty(envId: string, paths: string[]) {
  if (!envId) return;
  replaceAll.delete(envId);
  deleted.delete(envId);
  dirty.set(envId, new Set(paths));
}

export function hasSandboxWork(envId: string): boolean {
  if (replaceAll.has(envId)) return true;
  if ((dirty.get(envId)?.size || 0) > 0) return true;
  if ((deleted.get(envId)?.size || 0) > 0) return true;
  return false;
}

export function consumeSandboxWork(envId: string): {
  paths: string[];
  deleted: string[];
  replaceAll: boolean;
} {
  const full = replaceAll.has(envId);
  replaceAll.delete(envId);
  const paths = [...(dirty.get(envId) || [])];
  const removed = [...(deleted.get(envId) || [])];
  dirty.delete(envId);
  deleted.delete(envId);
  return { paths, deleted: removed, replaceAll: full };
}

export function restoreSandboxWork(
  envId: string,
  work: { paths: string[]; deleted: string[]; replaceAll: boolean }
) {
  if (work.replaceAll) {
    markEnvReplaceAll(envId);
    return;
  }
  for (const p of work.paths) markFileDirty(envId, p);
  for (const p of work.deleted) markFileDeleted(envId, p);
}
