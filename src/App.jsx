import { useEffect, useMemo, useRef, useState } from "react";
import { initTelegram, getUser, isTg, tgAlert, tgPopup } from "./tg";
import { loadUserState, saveUserState } from "./store";






//Вынеси useLongPress за пределы App

function useLongPress(onLongPress, onClick, delay = 450) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = (e) => {
    firedRef.current = false;
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress(e);
    }, delay);
  };

  const end = (e) => {
    clear();
    if (!firedRef.current) onClick(e);
  };

  const cancel = () => clear();

  return { start, end, cancel };
}
//Создай компонент UserTrackRow (тоже вне App)

//Добавь универсальный компонент TrackRowPressable (вне App)
function TrackRowPressable({
  t,
  idx,
  playlistId,
  title,
  artist,
  rightText = "—:—",
  menuIcon = "⋯",
  onShortTap,
  onLongPress,
}) {
  const lp = useLongPress(
    () => onLongPress?.(t, idx),
    () => onShortTap?.(t, idx)
  );

  return (
    <button
      className="trackRow trackRow--btn"
      onPointerDown={(e) => { e.preventDefault(); lp.start(e); }}
      onPointerUp={(e) => { e.preventDefault(); lp.end(e); }}
      onPointerCancel={lp.cancel}
      onPointerLeave={lp.cancel}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(t, idx); }} // ПК: правый клик = меню
      title="Tap to play • Hold for actions"
    >
      <div className="trackIdx">{idx + 1}</div>

      <div className="trackMain">
        <div className="trackTitle">{title ?? t.title}</div>
        <div className="trackArtist">{artist ?? t.artist}</div>
      </div>

      <div className="trackDur">{rightText}</div>
      <div className="trackMenuIcon">{menuIcon}</div>
    </button>
  );
}


function UserTrackRow({
  t,
  idx,
  playlistId,
  userPlaylistTracks,
  setQueue,
  setCurrentIndex,
  openTrackMenu,
}) {
  const lp = useLongPress(
    () => openTrackMenu(playlistId, t.id), // long press
    () => {
      setQueue(userPlaylistTracks);
      setCurrentIndex(idx);
    } // short tap
  );

  return (
    <button
      className="trackRow trackRow--btn"
      onPointerDown={(e) => { e.preventDefault(); lp.start(e); }}
      onPointerUp={(e) => { e.preventDefault(); lp.end(e); }}
      onPointerCancel={lp.cancel}
      onPointerLeave={lp.cancel}
      onContextMenu={(e) => { e.preventDefault(); openTrackMenu(playlistId, t.id); }}
      title="Tap to play • Hold for actions"
    >
      <div className="trackIdx">{idx + 1}</div>

      <div className="trackMain">
        <div className="trackTitle">{t.title}</div>
        <div className="trackArtist">{t.artist}</div>
      </div>

      <div className="trackDur">—:—</div>
      <div className="trackMenuIcon">⋯</div>
    </button>
  );
}
//--------------------------------------------------------------------


const playlists = [
  { id: "p1", title: "Избранное", isPublic: false },
  { id: "p2", title: "Bass Night (из группы)", isPublic: true },
  { id: "p3", title: "Для бега", isPublic: true },
];

// ТЕСТОВЫЕ ТРЕКИ (позже заменим на телеграм-треки)
const tracksByPlaylistId = {
  p1: [
    {
      id: "t1",
      title: "Test Track 1",
      artist: "Demo",
      durationSec: 0,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },
    {
      id: "t2",
      title: "Test Track 2",
      artist: "Demo",
      durationSec: 0,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
  ],
  p2: [
    {
      id: "t3",
      title: "Test Track 3",
      artist: "Demo",
      durationSec: 0,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    },
  ],
  p3: [
    {
      id: "t4",
      title: "Test Track 4",
      artist: "Demo",
      durationSec: 0,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    },
  ],
};

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const DEFAULT_USER_STATE = {
  library: [],
  playlists: {},
};

////////////////////////////////////////////////////////////////////
// Приводим любые старые версии к новой структуре
function normalizeUserState(raw) {
  // если пусто/битое
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_USER_STATE);

  const next = {
    library: Array.isArray(raw.library) ? raw.library : [],
    playlists: raw.playlists && typeof raw.playlists === "object" ? raw.playlists : {},
  };

  // ---- МИГРАЦИЯ старого формата (если у тебя было tracks / плейлисты хранили tracks:[]) ----
  // 1) если раньше было raw.tracks как объект { [trackId]: trackObj }
  //    перенесём в library (уникально)
  if (raw.tracks && typeof raw.tracks === "object") {
    const fromTracksObj = Object.values(raw.tracks).filter(Boolean);
    next.library = mergeUniqueTracks(next.library, fromTracksObj);
  }

  // 2) если в плейлистах раньше было поле tracks: [trackId] или [trackObj]
  for (const pl of Object.values(next.playlists)) {
    if (!pl || typeof pl !== "object") continue;

    // гарантируем базовые поля
    if (!pl.id) pl.id = crypto.randomUUID?.() ?? `pl_${Date.now()}`;
    if (!pl.title) pl.title = "Untitled";
    if (typeof pl.isPublic !== "boolean") pl.isPublic = false;

    // trackIds — новый стандарт
    if (!Array.isArray(pl.trackIds)) pl.trackIds = [];

    // если было старое поле tracks
    if (Array.isArray(pl.tracks)) {
      // tracks мог быть массивом id или объектов
      const ids = [];
      const objs = [];

      for (const t of pl.tracks) {
        if (!t) continue;
        if (typeof t === "string") ids.push(t);
        else if (typeof t === "object" && t.id) {
          ids.push(t.id);
          objs.push(t);
        }
      }

      // добавим объекты в library
      next.library = mergeUniqueTracks(next.library, objs);

      // добавим ids в trackIds
      pl.trackIds = uniqueStrings([...pl.trackIds, ...ids]);

      // удалим старое поле, чтобы больше не путаться
      delete pl.tracks;
    }
  }

  return next;
}

function uniqueStrings(arr) {
  return Array.from(new Set(arr.filter((x) => typeof x === "string" && x.trim())));
}

function mergeUniqueTracks(existing, incoming) {
  const map = new Map();
  for (const t of existing) if (t?.id) map.set(String(t.id), t);
  for (const t of incoming) if (t?.id) map.set(String(t.id), t);
  return Array.from(map.values());
}
////////////////////////////////////////////////////////////////////

//========================================================================================================function App================================//
export default function App() {
  const [tgUser, setTgUser] = useState(null);
  const userId = tgUser?.id ? String(tgUser.id) : "guest";
  //const [userState, setUserState] = useState({
  // playlists: {},
  // tracks: {},
  // library: [], // порядок треков в My library
  //});
  const [userState, setUserState] = useState(DEFAULT_USER_STATE);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  //const userPlaylists = Object.values(userState.playlists);
  const userPlaylists = userState ? Object.values(userState.playlists) : [];
  const libraryCount = userState.library.length;
  //вычисление libraryTracks
  const libraryTracks = useMemo(() => {
    if (!userState?.tracks) return [];
    return Object.values(userState.tracks);
  }, [userState]);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [targetPlaylistId, setTargetPlaylistId] = useState("");

  //1) Добавь состояния для контекстного меню
  const [trackMenu, setTrackMenu] = useState({
  open: false,
  playlistId: null,   // откуда вызвали (user playlist)
  trackId: null,
});
const otherUserPlaylists = useMemo(() => {
  const all = Object.values(userState?.playlists ?? {});
  return all.filter((p) => p?.id && p.id !== trackMenu.playlistId);
}, [userState, trackMenu.playlistId]);
const [pickTarget, setPickTarget] = useState({
  open: false,
  mode: null,         // "add" | "move"
  fromPlaylistId: null,
  trackId: null,
  targetPlaylistId: "",
});
//----------------------------------------------------------

  //========================================================================================================useEffect================================//
  useEffect(() => {
    if (!tgUser?.id) return;
  //2
    const saved = loadUserState(tgUser.id);
    if (saved) {
      setUserState(saved);
    } else {
      // первичная инициализация
      const initial = {
        playlists: {},
        tracks: {},
      };
      setUserState(initial);
      saveUserState(tgUser.id, initial);
    }
  }, [tgUser]);

  useEffect(() => {
    if (!tgUser?.id || !userState) return;
    saveUserState(tgUser.id, userState);
  }, [userState, tgUser]);

  useEffect(() => {
    const saved = localStorage.getItem(`mini-music:${userId}`);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);

      setUserState({
        playlists: parsed.playlists ?? {},
        tracks: parsed.tracks ?? {},
        library: parsed.library ?? [],
      });
    } catch (e) {
      console.error("Failed to parse local state", e);
    }
  }, [userId]);

  //========================================================================================================useEffect================================//
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`mini-music:${userId}`);
      const parsed = saved ? JSON.parse(saved) : null;
      const normalized = normalizeUserState(parsed);
      setUserState(normalized);

      // важно: сразу же сохраняем нормализованную версию обратно,
      // чтобы дальше всегда работало в новом формате
      localStorage.setItem(`mini-music:${userId}`, JSON.stringify(normalized));
    } catch (e) {
      console.error("Failed to load userState:", e);
      setUserState(structuredClone(DEFAULT_USER_STATE));
    }
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(`mini-music:${userId}`, JSON.stringify(userState));
    } catch (e) {
      console.error("Failed to save userState:", e);
    }
  }, [userState, userId]);

    //useEffect(() => {
      //if (!userState) return;

    // localStorage.setItem(
      // `mini-music:${userId}`,
      //  JSON.stringify(userState)
      //);
    //}, [userState, userId]);

  useEffect(() => {
    initTelegram();
    setTgUser(getUser());
  }, []);

  // page: {name:'list'} | {name:'playlist', playlistId:'p1'}
  const [page, setPage] = useState({ name: "list" });
  const selectedPlaylist = useMemo(() => {
    if (page.name !== "playlist") return null;
    return playlists.find((p) => p.id === page.playlistId) ?? null;
  }, [page]);
  const selectedUserPlaylist =
  page.name === "userPlaylist" && userState?.playlists?.[page.playlistId]
    ? userState.playlists[page.playlistId]
    : null;
  const userPlaylistTracks = useMemo(() => {
    if (!selectedUserPlaylist || !userState) return [];
    return (selectedUserPlaylist.trackIds || [])
      .map((id) => userState.tracks?.[id])
      .filter(Boolean);
  }, [selectedUserPlaylist, userState]);
  const tracks = useMemo(() => {
    if (!selectedPlaylist) return [];
    return tracksByPlaylistId[selectedPlaylist.id] ?? [];
  }, [selectedPlaylist]);
  // ===== Player state =====
  const audioRef = useRef(null);
  const [queue, setQueue] = useState([]); // текущая очередь треков
  const [currentIndex, setCurrentIndex] = useState(-1);
  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  const [isPlaying, setIsPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);

  // загрузка трека в audio при смене currentTrack
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setIsPlaying(false);
      setCurTime(0);
      setDuration(0);
      return;
    }

    audio.src = currentTrack.url;
    audio.load();

    // Авто-старт, если мы ожидаем играть
    // (нажатие пользователем было, поэтому браузер обычно разрешает)
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [currentTrack]);

  // события audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurTime(audio.currentTime || 0);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      // Автопереход на следующий
      if (currentIndex + 1 < queue.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsPlaying(false);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [queue.length, currentIndex]);

  function startPlaylistFrom(index) {
    // ставим очередь = треки плейлиста
    setQueue(tracks);
    setCurrentIndex(index);
  }
//----------------------------------------------Menu Tracs-----------------------------------------
//2) Функции: открыть меню + выполнить действия
  function openTrackMenu(playlistId, trackId) {
    setTrackMenu({ open: true, playlistId, trackId });
  }

  function closeTrackMenu() {
    setTrackMenu({ open: false, playlistId: null, trackId: null });
  }

  function removeTrackFromUserPlaylist(playlistId, trackId) {
    setUserState((prev) => {
      if (!prev?.playlists?.[playlistId]) return prev;

      const next = structuredClone(prev);
      const p = next.playlists[playlistId];
      p.trackIds = (p.trackIds || []).filter((id) => id !== trackId);
      return next; // tracks/library не трогаем
    });
  }

  function addTrackToUserPlaylist(targetPlaylistId, trackId) {
    setUserState((prev) => {
      if (!prev?.playlists?.[targetPlaylistId]) return prev;

      const next = structuredClone(prev);
      const p = next.playlists[targetPlaylistId];
      const setIds = new Set(p.trackIds || []);
      setIds.add(trackId);
      p.trackIds = Array.from(setIds);
      return next;
    });
  }

  function moveTrackBetweenUserPlaylists(fromPlaylistId, toPlaylistId, trackId) {
    setUserState((prev) => {
      if (!prev?.playlists?.[fromPlaylistId] || !prev?.playlists?.[toPlaylistId]) return prev;

      const next = structuredClone(prev);
      const from = next.playlists[fromPlaylistId];
      const to = next.playlists[toPlaylistId];

      from.trackIds = (from.trackIds || []).filter((id) => id !== trackId);

      const setIds = new Set(to.trackIds || []);
      setIds.add(trackId);
      to.trackIds = Array.from(setIds);

//-


      return next;
    });
  }
//---------------------------------------------------------------------------------------------------
//-------------------------------useLongPress---------------------------------------------------
//3) Long-press хендлер (удержание 450 мс)
  function useLongPress(onLongPress, onClick, delay = 450) {
    const timerRef = useRef(null);
    const firedRef = useRef(false);

    function clear() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function start(e) {
      firedRef.current = false;
      clear();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress(e);
      }, delay);
    }

    function end(e) {
      clear();
      // если longPress не сработал — это обычный клик
      if (!firedRef.current) onClick(e);
    }

    function cancel() {
      clear();
    }

    return { start, end, cancel };
  }
//---------------------------------------------------------------------------------------------------

  function createPlaylistWithTitle() 
  {
    const title = newPlaylistTitle.trim();

    if (!title) {
      tgAlert?.("Введите название плейлиста"); // если в Telegram
      return;
    }

    if (title.length > 40) {
      tgAlert?.("Слишком длинное название (до 40 символов)");
      return;
    }

    const id = `u-${Date.now()}`;

    setUserState((prev) => ({
      ...prev,
      playlists: {
        ...prev.playlists,
        [id]: {
          id,
          title,
          isPublic: false,
          tracks: [],
        },
      },
    }));

    setIsCreateOpen(false);
  }

  function createPlaylist() {
    const title = String(newPlaylistTitle ?? "").trim();
    if (!title) {
      tgAlert("Enter playlist name");
      return;
    }
    setUserState((prev) => {
      const next = structuredClone(prev);
      const id = crypto.randomUUID();
      next.playlists[id] = {
        id,
        title,          // ✅ ВСЕГДА строка
        trackIds: [],   // библиотека пустая
        isPublic: false,
      };
      return next;
    });
    setIsCreateOpen(false);
    setNewPlaylistTitle("");
  }

  function deletePlaylist(playlistId) {
  setUserState((prev) => {
    if (!prev?.playlists?.[playlistId]) return prev;

    const next = structuredClone(prev);
    delete next.playlists[playlistId];

    // треки не удаляем — они остаются в Library
    return next;
  });
  }

  function requestDeletePlaylist(playlistId) {
  const p = userState?.playlists?.[playlistId];
  const title = p?.title ?? "this playlist";

  // Если ты в Telegram и есть tgPopup — пробуем его
  try {
    if (isTg?.() && tgPopup) {
      tgPopup({
        title: "Delete playlist?",
        message: `Delete "${title}"?`,
        buttons: [
          { id: "cancel", type: "cancel", text: "Cancel" },
          { id: "delete", type: "destructive", text: "Delete" },
        ],
      }).then((btnId) => {
        if (btnId === "delete") deletePlaylist(playlistId);
      });

      return;
    }
  } catch {
    // падаем дальше на confirm
  }

  // Фолбэк для браузера / если метод недоступен
  if (window.confirm(`Delete "${title}"?`)) {
    deletePlaylist(playlistId);
  }
  }

  function addDemoTrackToLibrary() {
    const id = `trk_${Date.now()}`;
    const demo = {
      id,
      title: `Demo Track ${new Date().toLocaleTimeString()}`,
      artist: "Mini Music",
      durationSec: 0,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    };
    setUserState((prev) => {
      const base = prev ?? { playlists: {}, tracks: {} };
      return {
        ...base,
        tracks: {
          ...base.tracks,
          [id]: demo,
        },
      };
    });
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrack) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function prev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  function next() {
    if (currentIndex + 1 < queue.length) setCurrentIndex((i) => i + 1);
  }

  function seekTo(ratio01) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const t = clamp(ratio01, 0, 1) * duration;
    audio.currentTime = t;
    setCurTime(t);
  }

    function toggleSelectedTrack(id) {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="page">
   <
      Header
      title={
      page.name === "list"
        ? "Playlists"
        : page.name === "library"
        ? "My library"
        : page.name === "userPlaylist"
        ? (selectedUserPlaylist?.title ?? "My playlist")
        : (selectedPlaylist?.title ?? "Playlist")
        } 
      onBack={
      page.name === "playlist" || page.name === "library" || page.name === "userPlaylist"
        ? () => setPage({ name: "list" })
        : null
      }
      />

      <div className="content content--withPlayer">
              <div className="contentInner">

                  {page.name === "list" && (
                    <>
                    {tgUser && (
                      <div className="muted" style={{ marginBottom: 10 }}>
                        Telegram: id={tgUser.id} @{tgUser.username ?? "no_username"} {isTg() ? "(TWA)" : "(browser)"}
                      </div>
                    )}
                    {!tgUser && (
                      <div className="muted" style={{ marginBottom: 10 }}>
                        Telegram user: нет (скорее всего открыт в браузере)
                      </div>
                    )}
                        <div className="listHeader">
                          <h1 className="h1">Мои плейлисты</h1>
                            <button
                              className="primary"
                              onClick={() => {
                                setNewPlaylistTitle("");
                                setIsCreateOpen(true);
                              }}
                              >
                               + Create playlist
                            </button>
                          <div className="grid">
                            {/* 0. БИБЛИОТЕКА */}
                            <button
                              className="card"
                              onClick={() => setPage({ name: "library" })}
                              >
                              <div className="card__title">My library</div>
                              <div className="card__meta">
                                <span className="badge badge--private">Системный</span>
                                <span className="muted">
                                  {userState ? Object.keys(userState.tracks ?? {}).length : 0} songs
                                </span>
                                </div>
                              </button>
                            {/* 1. СИСТЕМНЫЕ (демо) */}
                            {playlists.map((p) => (
                            <button
                              key={p.id}
                              className="card"
                              onClick={() => setPage({ name: "playlist", playlistId: p.id })}
                              >
                              <div className="card__title">{p.title}</div>
                              <div className="card__meta">
                                  <span className={"badge " + (p.isPublic ? "badge--public" : "badge--private")}>
                                    {p.isPublic ? "Публичный" : "Приватный"}
                                  </span>
                                  <span className="muted">
                                    {(tracksByPlaylistId[p.id] ?? []).length} треков
                                  </span>
                                </div>
                              </button>
                            ))}
                            {/* 2. ПОЛЬЗОВАТЕЛЬСКИЕ */}
                            {userPlaylists.map((p) => (
                            <button
                              key={p.id}
                              className="card"
                              onClick={() => setPage({ name: "userPlaylist", playlistId: p.id })}
                            >
                              <div className="card__titleRow">
                                <div className="card__title">{p.title}</div>
                                <button
                                  type="button"
                                  className="deleteBtn"
                                  aria-label="Delete playlist"
                                  onClick={(e) => {
                                    e.stopPropagation();        // важно: чтобы не открывался плейлист
                                    requestDeletePlaylist(p.id);
                                  }}
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="card__meta">
                                <span className="badge badge--private">My</span>
                                <span className="muted">{(p.trackIds ?? []).length} songs</span>
                              </div>
                            </button>
                            ))}
                            </div>
                          </div>
                      </>
                    )}

                  {page.name === "playlist" && selectedPlaylist && (
                    <>
                      <div className="playlistTop">
                        <div className="muted">
                          {selectedPlaylist.isPublic ? "🌍 Публичный" : "🔒 Приватный"} · {tracks.length} треков
                        </div>

                        <div className="playlistActions">
                          <button lassName="secondary"
                            onClick={() => {
                              if (!tgUser || !userState) return;
                              setUserState((prev) => {
                                const next = structuredClone(prev);
                                const srcPlaylist = selectedPlaylist;
                                if (!srcPlaylist) return prev;
                                const newPlaylistId = `copy-${srcPlaylist.id}`;
                                if (next.playlists[newPlaylistId]) {
                                  return prev; // уже сохранён
                                }
                                next.playlists[newPlaylistId] = {
                                  id: newPlaylistId,
                                  title: srcPlaylist.title,
                                  isPublic: false,
                                  tracks: tracks.map((t) => t.id),
                                };
                                tracks.forEach((t) => {
                                  next.tracks[t.id] = t;
                                });
                                return next;
                              });
                            }}
                          >
                            Сохранить к себе
                          </button>
                        </div>
                      </div>

                      <div className="tracksBox">
                        {tracks.map((t, idx) => (
                          <TrackRowPressable
                            key={t.id}
                            t={t}
                            idx={idx}
                            rightText={duration && currentTrack?.id === t.id ? fmt(duration) : "—:—"}
                            menuIcon="▶"
                            onShortTap={() => startPlaylistFrom(idx)}
                            onLongPress={() => openTrackMenu(page.playlistId, t.id)}
                          />
                        ))}
                      </div>


                      <div className="bottom">
                        <button className="primary wide" onClick={() => startPlaylistFrom(0)}>
                          ▶ Воспроизвести
                        </button>
                      </div>
                    </>
                  )}
              </div>

          {page.name === "userPlaylist" && selectedUserPlaylist && (
            <>
              <div className="playlistTop">
                <div className="muted">My playlist · {userPlaylistTracks.length} songs</div>
              </div>

              <div className="tracksBox">
                {userPlaylistTracks.map((t, idx) => (
                  <TrackRowPressable
                    key={t.id}
                    t={t}
                    idx={idx}
                    playlistId={page.playlistId}
                    onShortTap={() => {
                      setQueue(userPlaylistTracks);
                      setCurrentIndex(idx);
                    }}
                    onLongPress={() => openTrackMenu(page.playlistId, t.id)}
                  />
                ))}
              </div>


              
              <div className="bottom">
                <button
                  className="primary wide"
                  disabled={!userPlaylistTracks.length}
                  onClick={() => {
                    setQueue(userPlaylistTracks);
                    setCurrentIndex(0);
                  }}
                >
                  ▶ Play
                </button>
              </div>
            </>
          )}

          {page.name === "library" && (
          <>
            <div className="playlistTop">
              <div className="muted">
                System · {userState ? Object.keys(userState.tracks ?? {}).length : 0} songs
                  </div>
                    <div className="playlistActions">
                      <button className="secondary" onClick={() => tgAlert("Upload/Forward later")}>
                        How to add music
                      </button>
                    </div>
                  </div>

                  <div className="tracksBox">
                    {libraryTracks.map((t, idx) => (
                      <TrackRowPressable
                        key={t.id}
                        t={t}
                        idx={idx}
                        onShortTap={() => {
                          setQueue(libraryTracks);
                          setCurrentIndex(idx);
                        }}
                        onLongPress={() => tgAlert("Меню для Library сделаем позже")}
                        menuIcon="▶"
                      />
                    ))}
                  </div>

                  <div className="bottom">
                    <button className="primary wide" onClick={addDemoTrackToLibrary}>
                      + Add demo track
                    </button>
                  </div>
                  <button className="secondary"//----------Add to playlist---------------------------------------------------------
                    disabled={!libraryTracks.length || !Object.keys(userState?.playlists ?? {}).length}
                    onClick={() => {
                    setSelectedTrackIds(new Set());
                    setTargetPlaylistId("");
                    setIsAddToPlaylistOpen(true);
                    }}
                  >
                    Add to playlist
                  </button> 
                </>
          )}

    {/* Скрытый audio */}
    <audio ref={audioRef} />

    {/* Нижняя панель плеера */}
    <PlayerBar
      track={currentTrack}
      isPlaying={isPlaying}
      curTime={curTime}
      duration={duration}
      onTogglePlay={togglePlay}
      onPrev={prev}
      onNext={next}
      onSeek={seekTo}
      onOpenFull={() => setIsFullPlayerOpen(true)}
    />

        {isCreateOpen && (
          <div
            onClick={() => {
              console.log("OVERLAY CLICK");
              setIsCreateOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 999999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
          <div
            onClick={(e) => {
                console.log("MODAL CLICK");
                e.stopPropagation();
            }}
            style={{
              width: "min(520px, 100%)",
              background: "#111",
              color: "#fff",
              borderRadius: 16,
              padding: 16,
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Новый плейлист</div>
                
            {/* ЯВНАЯ КНОПКА ЗАКРЫТЬ */}
              <button
                onClick={() => {
                console.log("CLOSE BTN");
                setIsCreateOpen(false);
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  cursor: "pointer",
                  }}
              >
                ✕
              </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <input
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              placeholder="Название плейлиста"
              autoFocus
              style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(0,0,0,0.35)",
                    color: "#fff",
                    outline: "none",
                    fontSize: 16,
                  }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer",
                  }}
                >
                  Отмена
                </button>

                <button
                  onClick={createPlaylist}
                  disabled={!String(newPlaylistTitle ?? "").trim()}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    background: newPlaylistTitle.trim() ? "rgba(120,180,255,0.25)" : "rgba(255,255,255,0.06)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.12)",
                    cursor: newPlaylistTitle.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Создать
                </button>
              </div>
            </div>
          </div>
        )}

        {isAddToPlaylistOpen && (
          <div className="overlay" onClick={() => setIsAddToPlaylistOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Add tracks to playlist</h2>
              <div className="muted" style={{ marginTop: 6 }}>
                Choose playlist and select tracks from your library
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Playlist</div>
                <select
                  className="input"
                  value={targetPlaylistId}
                  onChange={(e) => setTargetPlaylistId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {Object.values(userState?.playlists ?? {}).map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Tracks</div>

                <div style={{ maxHeight: 260, overflow: "auto", borderRadius: 12 }}>
                  {libraryTracks.map((t) => (
                    <label
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 6px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTrackIds.has(t.id)}
                        onChange={() => toggleSelectedTrack(t.id)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{t.title}</div>
                        <div className="muted">{t.artist}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className="secondary" onClick={() => setIsAddToPlaylistOpen(false)}>
                  Cancel
                </button>

                <button
                  className="primary"
                  disabled={!targetPlaylistId || selectedTrackIds.size === 0}
                  onClick={() => {
                    const idsToAdd = Array.from(selectedTrackIds);

                    setUserState((prev) => {
                      if (!prev) return prev;
                      const next = structuredClone(prev);

                      const pl = next.playlists?.[targetPlaylistId];
                      if (!pl) return prev;

                      const existing = new Set(pl.trackIds || []);
                      idsToAdd.forEach((id) => existing.add(id));

                      pl.trackIds = Array.from(existing);
                      return next;
                    });

                    setIsAddToPlaylistOpen(false);
                  }}
                >
                  Add selected
                </button>
              </div>
            </div>
          </div>
        )}
        
        {trackMenu.open && (
          <div className="overlay" onClick={closeTrackMenu}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheetTitle">Track actions</div>

              <button
                className="sheetBtn sheetBtn--danger"
                onClick={() => {
                  removeTrackFromUserPlaylist(trackMenu.playlistId, trackMenu.trackId);
                  closeTrackMenu();
                }}
              >
                Remove from this playlist
              </button>

              {otherUserPlaylists.length > 0 && (
                <>
                  <button
                    className="sheetBtn"
                    onClick={() => {
                      setPickTarget({
                        open: true,
                        mode: "move",
                        fromPlaylistId: trackMenu.playlistId,
                        trackId: trackMenu.trackId,
                        targetPlaylistId: "",
                      });
                      closeTrackMenu();
                    }}
                  >
                    Move to another playlist…
                  </button>

                  <button
                    className="sheetBtn"
                    onClick={() => {
                      setPickTarget({
                        open: true,
                        mode: "add",
                        fromPlaylistId: trackMenu.playlistId,
                        trackId: trackMenu.trackId,
                        targetPlaylistId: "",
                      });
                      closeTrackMenu();
                    }}
                  >
                    Add to another playlist…
                  </button>
                </>
              )}

              <button className="sheetBtn sheetBtn--muted" onClick={closeTrackMenu}>
                Cancel
              </button>
            </div>
          </div>
        )}


        {pickTarget.open && (
          <div
            className="overlay"
            onClick={() => setPickTarget((p) => ({ ...p, open: false }))}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modalTop">
                <div className="modalTitle">
                  {pickTarget.mode === "move" ? "Move to playlist" : "Add to playlist"}
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Choose playlist</div>

                <select
                  className="input"
                  value={pickTarget.targetPlaylistId}
                  onChange={(e) =>
                    setPickTarget((p) => ({ ...p, targetPlaylistId: e.target.value }))
                  }
                >
                  <option value="">— Select —</option>
                  {Object.values(userState?.playlists ?? {})
                    .filter((p) => p?.id && p.id !== pickTarget.fromPlaylistId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  className="secondary"
                  onClick={() => setPickTarget((p) => ({ ...p, open: false }))}
                >
                  Cancel
                </button>

                <button
                  className="primary"
                  disabled={!pickTarget.targetPlaylistId}
                  onClick={() => {
                    const to = pickTarget.targetPlaylistId;
                    const from = pickTarget.fromPlaylistId;
                    const tid = pickTarget.trackId;

                    if (pickTarget.mode === "move") {
                      moveTrackBetweenUserPlaylists(from, to, tid);
                    } else {
                      addTrackToUserPlaylist(to, tid);
                    }

                    setPickTarget((p) => ({ ...p, open: false }));
                  }}
                >
                  {pickTarget.mode === "move" ? "Move" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  </div>
);

}

function Header({ title, onBack }) {
  return (
    <header className="header header--row">
      {onBack ? (
        <button className="back" onClick={onBack} aria-label="Назад">
          ←
        </button>
      ) : (
        <div className="backSpacer" />
      )}

      <div className="header__title header__title--center">{title}</div>
      <div className="backSpacer" />
    </header>
  );
}

function PlayerBar({ track, isPlaying, curTime, duration, onTogglePlay, onPrev, onNext, onSeek, onOpenFull }) {
  if (!track) return null;

  const ratio = duration ? curTime / duration : 0;

  return (
    <div className="playerBar">
      <div className="playerShell" onClick={onOpenFull} role="button" tabIndex={0}>
        <div className="playerTop">
          <div>
            <div className="playerTitle">{track.title}</div>
            <div className="playerArtist">{track.artist}</div>
          </div>

          <button className="likeBtn" onClick={(e) => { e.stopPropagation(); tgAlert("Лайки позже"); }} aria-label="Лайк">
            ❤️
          </button>
        </div>

        <div className="playerProgress" onClick={(e) => e.stopPropagation()}>
          <div className="time">{fmt(curTime)}</div>

          <input
            className="range"
            type="range"
            min="0"
            max="1000"
            value={Math.floor(ratio * 1000)}
            onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          />

          <div className="time">{fmt(duration)}</div>
        </div>

        <div className="playerControls" onClick={(e) => e.stopPropagation()}>
          <button className="ctl" onClick={onPrev} aria-label="Предыдущий">⏮</button>
          <button className="ctl ctl--play" onClick={onTogglePlay} aria-label="Play/Pause">
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="ctl" onClick={onNext} aria-label="Следующий">⏭</button>
          <button className="ctl" onClick={() => tgAlert("Shuffle позже")} aria-label="Shuffle">🔀</button>
          <button className="ctl" onClick={() => tgAlert("Repeat позже")} aria-label="Repeat">🔁</button>
        </div>
      </div>
    </div>
  );
}
function FullPlayer({ track, isPlaying, curTime, duration, onTogglePlay, onPrev, onNext, onSeek, onClose }) {
  const ratio = duration ? curTime / duration : 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalTop">
          <button className="iconBtn" onClick={onClose} aria-label="Закрыть">⬇</button>
          <div className="modalTitle">Сейчас играет</div>
          <button className="iconBtn" onClick={() => tgAlert("Опции позже")} aria-label="Опции">⋯</button>
        </div>

        <div className="art" />

        <div className="bigTitle">{track.title}</div>
        <div className="bigArtist">{track.artist}</div>

        <div className="playerProgress" style={{ marginTop: 14 }}>
          <div className="time">{fmt(curTime)}</div>

          <input
            className="range"
            type="range"
            min="0"
            max="1000"
            value={Math.floor(ratio * 1000)}
            onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          />

          <div className="time">{fmt(duration)}</div>
        </div>

        <div className="bigControls">
          <button className="iconBtn" onClick={() => tgAlert("Shuffle позже")} aria-label="Shuffle">🔀</button>
          <button className="iconBtn" onClick={onPrev} aria-label="Предыдущий">⏮</button>

          <button className="bigPlay" onClick={onTogglePlay} aria-label="Play/Pause">
            {isPlaying ? "⏸" : "▶"}
          </button>

          <button className="iconBtn" onClick={onNext} aria-label="Следующий">⏭</button>
          <button className="iconBtn" onClick={() => tgAlert("Лайк позже")} aria-label="Лайк">❤️</button>
        </div>
      </div>
    </div>  
  );
  
}