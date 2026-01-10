// src/store.js

export function getUserKey(userId) {
  return `mini-music:user:${userId}`;
}

export function loadUserState(userId) {
  try {
    const raw = localStorage.getItem(getUserKey(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveUserState(userId, state) {
  localStorage.setItem(getUserKey(userId), JSON.stringify(state));
}
