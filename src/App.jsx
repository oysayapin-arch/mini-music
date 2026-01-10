import { useEffect, useMemo, useRef, useState } from "react";
import { initTelegram, getUser, isTg, tgAlert, tgPopup } from "./tg";


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

export default function App() {
    const [tgUser, setTgUser] = useState(null);

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

  return (
    <div className="page">
      <Header
        title={page.name === "list" ? "Плейлисты" : selectedPlaylist?.title ?? "Плейлист"}
        onBack={page.name === "playlist" ? () => setPage({ name: "list" }) : null}
      />

      <div className="content content--withPlayer">
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
            <h1 className="h1">Мои плейлисты</h1>

            <div className="grid">
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
                    <span className="muted">{(tracksByPlaylistId[p.id] ?? []).length} треков</span>
                  </div>
                </button>
              ))}
            </div>

            <button className="primary" onClick={() => tgAlert("Создание плейлиста позже")}>
              + Создать плейлист
            </button>
          </>
        )}

        {page.name === "playlist" && selectedPlaylist && (
          <>
            <div className="playlistTop">
              <div className="muted">
                {selectedPlaylist.isPublic ? "🌍 Публичный" : "🔒 Приватный"} · {tracks.length} треков
              </div>

              <div className="playlistActions">
                <button className="secondary" onClick={() => tgAlert("Поделиться позже")}>
                  Поделиться
                </button>
                <button className="secondary" onClick={() => tgAlert("Сохранить к себе позже")}>
                  Сохранить к себе
                </button>
              </div>
            </div>

            <div className="tracksBox">
              {tracks.map((t, idx) => (
                <button
                  className="trackRow trackRow--btn"
                  key={t.id}
                  onClick={() => startPlaylistFrom(idx)}
                  title="Нажми, чтобы воспроизвести"
                >
                  <div className="trackIdx">{idx + 1}</div>

                  <div className="trackMain">
                    <div className="trackTitle">{t.title}</div>
                    <div className="trackArtist">{t.artist}</div>
                  </div>

                  <div className="trackDur">
                    {duration && currentTrack?.id === t.id ? fmt(duration) : "—:—"}
                  </div>
                  <div className="trackMenuIcon">▶</div>
                </button>
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

      {isFullPlayerOpen && currentTrack && (
        <FullPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          curTime={curTime}
          duration={duration}
          onTogglePlay={togglePlay}
          onPrev={prev}
          onNext={next}
          onSeek={seekTo}
          onClose={() => setIsFullPlayerOpen(false)}
        />
      )}
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

