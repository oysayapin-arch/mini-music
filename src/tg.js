import WebApp from "@twa-dev/sdk";

export const tg = WebApp;

// true, когда реально открыто внутри Telegram
export function isTg() {
  return Boolean(tg?.initDataUnsafe?.user);
}

// Аккуратно достаём пользователя
export function getUser() {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;

  return {
    id: u.id,
    username: u.username ?? null,
    firstName: u.first_name ?? "",
    lastName: u.last_name ?? "",
  };
}

// UI вместо alert (с фолбэком для браузера)
export function tgAlert(message) {
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}

export function tgConfirm(message, onOk) {
  if (tg?.showConfirm) tg.showConfirm(message, (ok) => ok && onOk?.());
  else if (window.confirm(message)) onOk?.();
}

export function tgPopup(title, message) {
  if (tg?.showPopup) {
    tg.showPopup({
      title,
      message,
      buttons: [{ id: "ok", type: "ok", text: "Ок" }],
    });
  } else {
    window.alert(`${title}\n\n${message}`);
  }
}

// Применяем тему Telegram к CSS-переменным
export function applyTelegramTheme() {
  const root = document.documentElement;

  // Telegram даёт colorScheme: "dark" | "light"
  const scheme = tg?.colorScheme || "dark";
  const p = tg?.themeParams || {};

  // Telegram themeParams: bg_color, text_color, hint_color, button_color, secondary_bg_color...
  // Делаем мягкий маппинг в наши переменные
  root.style.setProperty("--bg", p.bg_color || (scheme === "dark" ? "#0b0b0b" : "#f2f2f2"));
  root.style.setProperty("--text", p.text_color || (scheme === "dark" ? "#ffffff" : "#111111"));
  root.style.setProperty("--muted", p.hint_color || (scheme === "dark" ? "rgba(255,255,255,0.70)" : "#666666"));
  root.style.setProperty("--surface", p.secondary_bg_color || (scheme === "dark" ? "rgba(255,255,255,0.08)" : "#ffffff"));
  root.style.setProperty("--line", scheme === "dark" ? "rgba(255,255,255,0.14)" : "#e3e3e3");

  // Опционально: просим Telegram покрасить фон/шапку (если доступно)
  try {
    if (tg?.setBackgroundColor && p.bg_color) tg.setBackgroundColor(p.bg_color);
    if (tg?.setHeaderColor) tg.setHeaderColor(scheme === "dark" ? "#000000" : "#ffffff");
  } catch (_) {}
}

// Инициализация (ready/expand + подписка на смену темы)
export function initTelegram() {
  // Эти методы безопасно вызываются и в браузере (если tg есть — сработают)
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch (_) {}

  applyTelegramTheme();

  // Telegram умеет присылать смену темы
  try {
    tg?.onEvent?.("themeChanged", applyTelegramTheme);
  } catch (_) {}
}
