import type { LocalDraft } from '../types/domain';

const memoryFallbackStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key);
    }
  } catch {
    // fallback to memory
  }
  return memoryFallbackStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback to memory
  }
  memoryFallbackStore.set(key, value);
}

export function clearAllDraftStorage(): void {
  memoryFallbackStore.clear();
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
  } catch {
    // ignore
  }
}

function getUserEventStorageKey(userUid: string, eventId: string): string {
  return `drone_comp_drafts__${userUid}__${eventId}`;
}

export function loadUserDraftsForEvent(
  userUid: string | null | undefined,
  eventId: string | null | undefined
): Record<string, LocalDraft> {
  if (!userUid || !eventId) return {};
  try {
    const raw = getStorageItem(getUserEventStorageKey(userUid, eventId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalDraft>;
    const filtered: Record<string, LocalDraft> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.userUid === userUid && v.eventId === eventId) {
        filtered[k] = v;
      }
    }
    return filtered;
  } catch {
    return {};
  }
}

export function saveUserDraft(draft: LocalDraft): void {
  if (!draft.userUid || !draft.eventId) return;
  const current = loadUserDraftsForEvent(draft.userUid, draft.eventId);
  const slotKey = `${draft.participantId}__${draft.testId}`;
  current[slotKey] = {
    ...draft,
    key: `${draft.userUid}__${draft.eventId}__${slotKey}`,
    savedAt: Date.now(),
  };
  setStorageItem(
    getUserEventStorageKey(draft.userUid, draft.eventId),
    JSON.stringify(current)
  );
}

export function removeUserDraft(
  userUid: string | null | undefined,
  eventId: string | null | undefined,
  participantId: string,
  testId: string
): void {
  if (!userUid || !eventId) return;
  const current = loadUserDraftsForEvent(userUid, eventId);
  const slotKey = `${participantId}__${testId}`;
  if (current[slotKey]) {
    delete current[slotKey];
    setStorageItem(
      getUserEventStorageKey(userUid, eventId),
      JSON.stringify(current)
    );
  }
}
