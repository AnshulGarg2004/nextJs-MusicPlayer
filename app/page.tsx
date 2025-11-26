"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type CategoryKey =
  | "hindi"
  | "english"
  | "ninety"
  | "twoThousands"
  | "love"
  | "lofi";

type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  audio: string;
  isLocal?: boolean;
  origin?: string;
};

type Playlist = {
  name: string;
  description?: string;
  songs: Track[];
  createdAt: string;
  updatedAt: string;
};

type PageView = "home" | "library" | "playlist" | "search";

const MUSIC_CATEGORIES: Record<CategoryKey, { label: string; terms: string[] }> = {
  hindi: {
    label: "Hindi Songs",
    terms: [
      "arijit singh",
      "jubin nautiyal",
      "atif aslam",
      "darshan raval",
      "shreya ghoshal",
    ],
  },
  english: {
    label: "English Songs",
    terms: [
      "taylor swift",
      "ed sheeran",
      "billie eilish",
      "dua lipa",
      "imagine dragons",
    ],
  },
  ninety: {
    label: "1990s Hits",
    terms: [
      "kumar sanu",
      "udit narayan",
      "alka yagnik",
      "abhijeet bhattacharya",
    ],
  },
  twoThousands: {
    label: "2000s Hits",
    terms: ["sonu nigam", "kk singer", "shaan singer", "sunidhi chauhan"],
  },
  love: {
    label: "Love Songs",
    terms: [
      "bollywood romantic",
      "love songs hindi",
      "tum hi ho",
      "raabta arijit singh",
    ],
  },
  lofi: {
    label: "Lofi Songs",
    terms: [
      "lofi bollywood",
      "acoustic hindi",
      "arijit singh lofi",
      "hindi chill",
    ],
  },
};

const DEFAULT_ARTWORK = "https://placehold.co/300x300?text=Sargam";
const DEFAULT_AUDIO = "https://samplelib.com/lib/preview/mp3/sample-3s.mp3";

const FALLBACK_TRACK: Track = {
  id: "demo-track",
  title: "Raabta (Demo)",
  artist: "Arijit Singh",
  artwork: DEFAULT_ARTWORK,
  audio: DEFAULT_AUDIO,
};

const STORAGE_KEYS = {
  playlists: "sargam_playlists",
  queue: "sargam_queue_state",
};

const formatClock = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const randomId = () => Math.random().toString(36).slice(2, 9);

const mapItunesTrack = (item: Record<string, any>): Track => ({
  id: String(item.trackId || item.collectionId || randomId()),
  title: item.trackName || item.collectionName || "Unknown Title",
  artist: item.artistName || "Unknown Artist",
  artwork: item.artworkUrl100?.replace("100x100bb", "300x300bb") || DEFAULT_ARTWORK,
  audio: item.previewUrl || "",
  origin: "itunes",
});

const findIndexOrFallback = (list: Track[], trackId: string) => {
  const idx = list.findIndex((track) => track.id === trackId);
  return idx >= 0 ? idx : list.length - 1;
};

const useDebounce = (value: string, delay = 350) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);

  return debounced;
};

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activePage, setActivePage] = useState<PageView>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [categorySongs, setCategorySongs] = useState<Record<CategoryKey, Track[]>>({
    hindi: [],
    english: [],
    ninety: [],
    twoThousands: [],
    love: [],
    lofi: [],
  });
  const [categoryLoading, setCategoryLoading] = useState<Record<CategoryKey, boolean>>({
    hindi: true,
    english: true,
    ninety: true,
    twoThousands: true,
    love: true,
    lofi: true,
  });
  const [categoryModal, setCategoryModal] = useState<{
    open: boolean;
    category?: CategoryKey;
    tracks?: Track[];
  }>({ open: false });

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 350);
  const [suggestions, setSuggestions] = useState<Track[]>([]);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  const [queue, setQueue] = useState<Track[]>(() => {
    if (typeof window === "undefined") return [FALLBACK_TRACK];
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.queue);
      if (stored) {
        const parsed = JSON.parse(stored) as { queue: Track[] };
        if (parsed.queue?.length) return parsed.queue;
      }
    } catch {
      /* empty */
    }
    return [FALLBACK_TRACK];
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.queue);
      if (stored) {
        const parsed = JSON.parse(stored) as { index?: number };
        return parsed.index ?? 0;
      }
    } catch {
      /* ignore */
    }
    return 0;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const [uploadedSongs, setUploadedSongs] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Record<string, Playlist>>({});
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [addToPlaylistState, setAddToPlaylistState] = useState<{ open: boolean; song?: Track }>({
    open: false,
  });

  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "info" } | null>(null);

  const currentSong = queue[currentIndex] ?? queue[0] ?? FALLBACK_TRACK;
  const playlistArray = useMemo(() => Object.values(playlists), [playlists]);

  const showToast = useCallback((message: string, tone: "success" | "error" | "info" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const persistQueue = useCallback(
    (nextQueue: Track[], nextIndex: number) => {
      setQueue(nextQueue);
      setCurrentIndex(nextIndex);
      try {
        localStorage.setItem(
          STORAGE_KEYS.queue,
          JSON.stringify({
            queue: nextQueue,
            index: nextIndex,
          })
        );
      } catch {
        /* ignore storage failures */
      }
    },
    []
  );

  const loadPlaylistsFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.playlists);
      if (stored) {
        setPlaylists(JSON.parse(stored));
      }
    } catch {
      setPlaylists({});
    }
  }, []);

  const persistPlaylists = useCallback((next: Record<string, Playlist>) => {
    setPlaylists(next);
    try {
      localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchSongs = useCallback(async (term: string, limit = 10): Promise<Track[]> => {
    if (!term) return [];
    const endpoint = `https://itunes.apple.com/search?term=${encodeURIComponent(
      term
    )}&entity=song&limit=${limit}&country=IN`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).map(mapItunesTrack).filter((track: Track) => track.audio);
  }, []);

  const fetchCategorySongs = useCallback(
    async (category: CategoryKey, limit = 5) => {
      const pool = MUSIC_CATEGORIES[category].terms;
      const randomTerm = pool[Math.floor(Math.random() * pool.length)];
      const tracks = await fetchSongs(randomTerm, limit);
      setCategorySongs((prev) => ({ ...prev, [category]: tracks }));
      setCategoryLoading((prev) => ({ ...prev, [category]: false }));
    },
    [fetchSongs]
  );

  const handlePlaySong = useCallback(
    (song: Track, sourceList?: Track[]) => {
      const nextQueue = sourceList?.length ? [...sourceList] : [...queue];
      const index = nextQueue.findIndex((item) => item.id === song.id);
      const nextIndex = index >= 0 ? index : 0;
      persistQueue(nextQueue, nextIndex);
      setIsPlaying(true);
    },
    [persistQueue, queue]
  );

  const handleAppendToQueue = useCallback(
    (song: Track) => {
      const exists = queue.some((item) => item.id === song.id);
      const updated = exists ? queue : [...queue, song];
      persistQueue(updated, findIndexOrFallback(updated, song.id));
      showToast("Added to queue");
    },
    [queue, persistQueue, showToast]
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setActivePage("search");
    try {
      const tracks = await fetchSongs(searchQuery.trim(), 24);
      setSearchResults(tracks);
      showToast(`Found ${tracks.length} result${tracks.length === 1 ? "" : "s"}`, "info");
    } catch {
      showToast("Unable to fetch results", "error");
    } finally {
      setSearching(false);
    }
  }, [fetchSongs, searchQuery, showToast]);

  const handleSuggestionClick = useCallback(
    (suggestion: Track) => {
      setSearchQuery(`${suggestion.title} ${suggestion.artist}`.trim());
      setSuggestions([]);
      handleSearch();
    },
    [handleSearch]
  );

  const handleUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;
      const uploads: Track[] = [];
      Array.from(files).forEach((file) => {
        const objectUrl = URL.createObjectURL(file);
        uploads.push({
          id: `${file.name}-${file.size}-${randomId()}`,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: "Local Upload",
          artwork: DEFAULT_ARTWORK,
          audio: objectUrl,
          isLocal: true,
          origin: "upload",
        });
      });
      setUploadedSongs((prev) => [...uploads, ...prev]);
      persistQueue([...uploads, ...queue], 0);
      setIsPlaying(true);
      showToast(`Uploaded ${uploads.length} file${uploads.length > 1 ? "s" : ""}`);
      event.target.value = "";
    },
    [persistQueue, queue, showToast]
  );

  const createPlaylist = useCallback(
    (name: string, description?: string) => {
      if (!name) {
        showToast("Playlist name required", "error");
        return;
      }
      if (playlists[name]) {
        showToast("Playlist already exists", "error");
        return;
      }
      const next: Record<string, Playlist> = {
        ...playlists,
        [name]: {
          name,
          description,
          songs: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      persistPlaylists(next);
      showToast(`Created "${name}"`);
      setCreatePlaylistOpen(false);
    },
    [persistPlaylists, playlists, showToast]
  );

  const addSongToPlaylist = useCallback(
    (song: Track, targetName: string) => {
      const playlist = playlists[targetName];
      if (!playlist) return;
      const exists = playlist.songs.some((item) => item.id === song.id);
      if (exists) {
        showToast("Song already in playlist", "info");
        return;
      }
      const updated: Record<string, Playlist> = {
        ...playlists,
        [targetName]: {
          ...playlist,
          songs: [...playlist.songs, song],
          updatedAt: new Date().toISOString(),
        },
      };
      persistPlaylists(updated);
      showToast(`Added to "${targetName}"`);
      setAddToPlaylistState({ open: false });
    },
    [persistPlaylists, playlists, showToast]
  );

  const deletePlaylist = useCallback(
    (name: string) => {
      const { [name]: _removed, ...rest } = playlists;
      persistPlaylists(rest);
      setSelectedPlaylist(null);
      showToast(`Deleted "${name}"`, "info");
    },
    [persistPlaylists, playlists, showToast]
  );

  const playPlaylist = useCallback(
    (playlist: Playlist) => {
      if (!playlist.songs.length) {
        showToast("Playlist is empty", "info");
        return;
      }
      persistQueue(playlist.songs, 0);
      setIsPlaying(true);
      setActivePage("playlist");
      showToast(`Playing "${playlist.name}"`);
    },
    [persistQueue, showToast]
  );

  useEffect(() => {
    loadPlaylistsFromStorage();
  }, [loadPlaylistsFromStorage]);

  useEffect(() => {
    (Object.keys(MUSIC_CATEGORIES) as CategoryKey[]).forEach((key) => {
      fetchCategorySongs(key, 6);
    });
  }, [fetchCategorySongs]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const tracks = await fetchSongs(debouncedQuery.trim(), 5);
      if (!cancelled) setSuggestions(tracks);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, fetchSongs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => setDuration(audio.duration || 0);
    const handleTime = () => {
      setCurrentTime(audio.currentTime || 0);
      const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      setProgress(percent || 0);
    };
    const handleEnd = () => {
      const nextIndex = (currentIndex + 1) % queue.length;
      persistQueue(queue, nextIndex);
      setIsPlaying(true);
    };

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("timeupdate", handleTime);
    audio.addEventListener("ended", handleEnd);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("timeupdate", handleTime);
      audio.removeEventListener("ended", handleEnd);
    };
  }, [currentIndex, persistQueue, queue]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    audio.src = currentSong.audio;
    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false));
    }
  }, [currentSong, isPlaying]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = (value / 100) * audio.duration;
    setProgress(value);
  };

  const handleVolume = (value: number) => {
    const vol = Math.min(Math.max(value, 0), 1);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    setVolume(vol);
  };

  const goToPrev = () => {
    const nextIndex = currentIndex === 0 ? queue.length - 1 : currentIndex - 1;
    persistQueue(queue, nextIndex);
    setIsPlaying(true);
  };

  const goToNext = () => {
    const nextIndex = (currentIndex + 1) % queue.length;
    persistQueue(queue, nextIndex);
    setIsPlaying(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#08090e] text-white">
      <header className="sticky top-0 z-40 flex flex-col gap-4 bg-[#0c0d15]/95 px-4 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="rounded-full bg-white/10 p-2 text-lg transition hover:bg-white/20"
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/60">Music Player</p>
              <h1 className="text-2xl font-semibold text-white">Sargam</h1>
            </div>
          </div>

          <button
            onClick={() => setActivePage("playlist")}
            className="rounded-full bg-linear-to-r from-emerald-400 to-green-500 px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            My Playlists
          </button>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm ring-1 ring-white/5">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search songs, albums, artists..."
              className="w-full bg-transparent text-base text-white placeholder:text-white/50 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/30"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute left-0 right-0 top-14 z-30 rounded-2xl border border-white/10 bg-[#111224] shadow-2xl"
              >
                {suggestions.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSuggestionClick(item)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                  >
                    <img
                      src={item.artwork}
                      alt={item.title}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-xs text-white/60">{item.artist}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`${
            sidebarCollapsed ? "w-20" : "w-72"
          } hidden flex-col gap-6 border-r border-white/5 bg-[#0b0c18] p-4 transition-all duration-300 lg:flex`}
        >
          <nav className="space-y-1">
            {[
              { id: "home", label: "Home", icon: "🏠" },
              { id: "library", label: "Library", icon: "📚" },
              { id: "playlist", label: "Playlists", icon: "🎵" },
              { id: "search", label: "Search", icon: "🔍" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id as PageView)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition ${
                  activePage === item.id
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {!sidebarCollapsed && item.label}
              </button>
            ))}
          </nav>

          <div>
            <p className="text-xs uppercase tracking-wider text-white/40">Upload</p>
            <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 p-4 text-center text-sm text-white/70 hover:border-white/40">
              <span>Upload local files</span>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            <p className="text-xs uppercase tracking-wider text-white/40">Library</p>
            {uploadedSongs.length === 0 ? (
              <p className="text-sm text-white/50">No uploads yet</p>
            ) : (
              uploadedSongs.map((song) => (
                <button
                  key={song.id}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                  onClick={() => handlePlaySong(song, uploadedSongs)}
                >
                  <img src={song.artwork} className="h-10 w-10 rounded-lg object-cover" />
                  {!sidebarCollapsed && (
                    <div>
                      <p className="text-sm font-semibold text-white">{song.title}</p>
                      <p className="text-xs text-white/60">{song.artist}</p>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {activePage === "home" && (
            <div className="space-y-10">
              <div>
                <p className="text-sm uppercase tracking-widest text-white/50">
                  Trending now
                </p>
                <h2 className="text-3xl font-semibold text-white">Good evening</h2>
              </div>

              {(Object.keys(MUSIC_CATEGORIES) as CategoryKey[]).map((categoryKey) => {
                const data = MUSIC_CATEGORIES[categoryKey];
                const tracks = categorySongs[categoryKey];
                return (
                  <section key={categoryKey} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-semibold">{data.label}</h3>
                      <button
                        onClick={() =>
                          setCategoryModal({
                            open: true,
                            category: categoryKey,
                            tracks,
                          })
                        }
                        className="text-sm text-emerald-400 hover:text-emerald-300"
                      >
                        Show all
                      </button>
                    </div>
                    {categoryLoading[categoryKey] ? (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <div key={idx} className="h-40 animate-pulse rounded-2xl bg-white/5" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                        {tracks.map((track) => (
                          <SongCard
                            key={track.id}
                            track={track}
                            onPlay={() => handlePlaySong(track, tracks)}
                            onAdd={() => setAddToPlaylistState({ open: true, song: track })}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {activePage === "library" && (
            <div className="space-y-8">
              <section>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-white/40">
                      Your playlists
                    </p>
                    <h2 className="text-2xl font-semibold text-white">Custom Playlists</h2>
                  </div>
                  <button
                    onClick={() => setCreatePlaylistOpen(true)}
                    className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
                  >
                    Create Playlist
                  </button>
                </div>
                {playlistArray.length === 0 ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-white/20 p-8 text-center text-white/60">
                    Start by creating your first playlist
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {playlistArray.map((playlist) => (
                      <motion.div
                        key={playlist.name}
                        whileHover={{ scale: 1.01 }}
                        className="rounded-3xl bg-linear-to-br from-white/5 to-white/0 p-5 ring-1 ring-white/10"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-white">{playlist.name}</h3>
                          <div className="space-x-2 text-sm text-white/60">
                            <button onClick={() => setSelectedPlaylist(playlist)}>View</button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-white/60">
                          {playlist.description || "No description"}
                        </p>
                        <p className="mt-3 text-xs uppercase tracking-widest text-white/40">
                          {playlist.songs.length} songs
                        </p>
                        <div className="mt-4 flex gap-3 text-sm">
                          <button
                            onClick={() => playPlaylist(playlist)}
                            className="flex-1 rounded-2xl bg-emerald-500/80 py-2 font-semibold text-black"
                          >
                            Play
                          </button>
                          <button
                            onClick={() => deletePlaylist(playlist.name)}
                            className="rounded-2xl border border-white/20 px-4 py-2 text-white/60 hover:text-white"
                          >
                            Delete
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-white">Uploaded Songs</h2>
                  <p className="text-sm text-white/60">{uploadedSongs.length} total</p>
                </div>
                {uploadedSongs.length === 0 ? (
                  <div className="mt-4 rounded-3xl border border-dashed border-white/10 p-6 text-center text-white/60">
                    Upload songs from the sidebar to see them here.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {uploadedSongs.map((song) => (
                      <div
                        key={song.id}
                        className="flex items-center gap-4 rounded-2xl bg-white/5 p-4"
                      >
                        <img
                          src={song.artwork}
                          alt={song.title}
                          className="h-16 w-16 rounded-xl object-cover"
                        />
                        <div className="flex-1">
                          <p className="font-semibold text-white">{song.title}</p>
                          <p className="text-sm text-white/60">{song.artist}</p>
                        </div>
                        <button
                          onClick={() => handlePlaySong(song, uploadedSongs)}
                          className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
                        >
                          Play
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activePage === "playlist" && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.4em] text-white/40">Queue</p>
                  <h2 className="text-2xl font-semibold text-white">Current Queue</h2>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCreatePlaylistOpen(true)}
                    className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
                  >
                    New Playlist
                  </button>
                  <button
                    onClick={() => handleAppendToQueue(currentSong)}
                    className="rounded-full bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-black"
                  >
                    Add current
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {queue.map((song, index) => (
                  <div
                    key={song.id}
                    className={`flex items-center gap-4 rounded-3xl border border-white/5 p-4 ${
                      index === currentIndex ? "bg-white/10" : "bg-white/0"
                    }`}
                  >
                    <div className="text-sm text-white/50">{index + 1}</div>
                    <img src={song.artwork} className="h-16 w-16 rounded-xl object-cover" />
                    <div className="flex-1">
                      <p className="font-semibold text-white">{song.title}</p>
                      <p className="text-sm text-white/60">{song.artist}</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          persistQueue(queue, index);
                          setIsPlaying(true);
                        }}
                        className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
                      >
                        Play
                      </button>
                      <button
                        onClick={() => setAddToPlaylistState({ open: true, song })}
                        className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/70 hover:text-white"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePage === "search" && (
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <p className="text-sm uppercase tracking-[0.4em] text-white/40">Search</p>
                <h2 className="text-3xl font-semibold text-white">
                  Results for "{searchQuery || "—"}"
                </h2>
                <p className="text-white/60">{searchResults.length} matches</p>
              </div>
              {searchResults.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/50">
                  Start typing in the search bar to discover new tracks.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {searchResults.map((track) => (
                    <SongCard
                      key={track.id}
                      track={track}
                      onPlay={() => handlePlaySong(track, searchResults)}
                      onAdd={() => setAddToPlaylistState({ open: true, song: track })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <footer className="sticky bottom-0 z-40 border-t border-white/5 bg-[#0b0c18]/95 px-4 py-4 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
          <div className="flex flex-1 items-center gap-4">
            <img
              src={currentSong?.artwork}
              alt={currentSong?.title}
              className="h-16 w-16 rounded-2xl object-cover"
            />
            <div>
              <p className="text-lg font-semibold">{currentSong?.title}</p>
              <p className="text-sm text-white/60">{currentSong?.artist}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center gap-2">
            <div className="flex items-center gap-4 text-2xl">
              <button onClick={goToPrev} aria-label="Previous song">
                ⏮️
              </button>
              <button
                onClick={togglePlayPause}
                className="rounded-full bg-white px-4 py-1 text-black"
                aria-label="Toggle play"
              >
                {isPlaying ? "⏸️" : "▶️"}
              </button>
              <button onClick={goToNext} aria-label="Next song">
                ⏭️
              </button>
            </div>
            <div className="flex w-full items-center gap-3 text-xs text-white/60">
              <span>{formatClock(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(event) => handleSeek(Number(event.target.value))}
                className="h-1 flex-1 cursor-pointer accent-emerald-400"
              />
              <span>{formatClock(duration)}</span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 text-sm text-white/60">
            <span>🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => handleVolume(Number(event.target.value))}
              className="h-1 w-32 cursor-pointer accent-emerald-400"
            />
          </div>
        </div>
      </footer>

      <audio ref={audioRef} className="hidden" />

      <AnimatePresence>
        {categoryModal.open && (
          <Modal onClose={() => setCategoryModal({ open: false })}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-white/40">Category</p>
                <h3 className="text-2xl font-semibold text-white">
                  {categoryModal.category
                    ? MUSIC_CATEGORIES[categoryModal.category].label
                    : "Category"}
                </h3>
              </div>
              <button
                onClick={() => setCategoryModal({ open: false })}
                className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/20"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(categoryModal.tracks || []).map((track) => (
                <SongCard
                  key={track.id}
                  track={track}
                  dense
                  onPlay={() =>
                    handlePlaySong(track, categorySongs[categoryModal.category ?? "hindi"])
                  }
                  onAdd={() => setAddToPlaylistState({ open: true, song: track })}
                />
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createPlaylistOpen && (
          <Modal onClose={() => setCreatePlaylistOpen(false)}>
            <h3 className="text-2xl font-semibold text-white">Create Playlist</h3>
            <PlaylistForm onSubmit={createPlaylist} />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addToPlaylistState.open && (
          <Modal onClose={() => setAddToPlaylistState({ open: false })}>
            <h3 className="text-2xl font-semibold text-white">Add to Playlist</h3>
            {playlistArray.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-white/60">
                Create a playlist first
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {playlistArray.map((playlist) => (
                  <button
                    key={playlist.name}
                    onClick={() =>
                      addSongToPlaylist(addToPlaylistState.song as Track, playlist.name)
                    }
                    className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-left hover:bg-white/10"
                  >
                    <div>
                      <p className="font-semibold text-white">{playlist.name}</p>
                      <p className="text-xs text-white/60">{playlist.songs.length} songs</p>
                    </div>
                    <span className="text-sm text-emerald-400">Add ➕</span>
                  </button>
                ))}
              </div>
            )}
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlaylist && (
          <Modal onClose={() => setSelectedPlaylist(null)}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-white/40">Playlist</p>
                <h3 className="text-2xl font-semibold text-white">{selectedPlaylist.name}</h3>
                <p className="text-sm text-white/60">
                  {selectedPlaylist.description || "No description"}
                </p>
              </div>
              <button
                onClick={() => playPlaylist(selectedPlaylist)}
                className="rounded-full bg-emerald-500 px-4 py-2 font-semibold text-black"
              >
                Play
              </button>
            </div>
            {selectedPlaylist.songs.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6 text-center text-white/60">
                Empty playlist. Add songs from cards via "Add".
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {selectedPlaylist.songs.map((song, index) => (
                  <div
                    key={song.id}
                    className="flex items-center gap-4 rounded-2xl bg-white/5 p-4"
                  >
                    <span className="text-sm text-white/40">{index + 1}</span>
                    <img src={song.artwork} className="h-14 w-14 rounded-xl object-cover" />
                    <div className="flex-1">
                      <p className="font-semibold text-white">{song.title}</p>
                      <p className="text-sm text-white/60">{song.artist}</p>
                    </div>
                    <button
                      onClick={() => handlePlaySong(song, selectedPlaylist.songs)}
                      className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
                    >
                      Play
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={`fixed right-6 top-24 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl ${
              toast.tone === "error"
                ? "bg-rose-500 text-white"
                : toast.tone === "info"
                ? "bg-white/10 text-white"
                : "bg-emerald-500 text-black"
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type SongCardProps = {
  track: Track;
  onPlay: () => void;
  onAdd: () => void;
  dense?: boolean;
};

const SongCard = ({ track, onPlay, onAdd, dense = false }: SongCardProps) => (
  <motion.div
    whileHover={{ y: -4 }}
    className="group rounded-3xl bg-white/5 p-3"
  >
    <div className="relative">
      <img
        src={track.artwork}
        alt={track.title}
        className={`w-full rounded-2xl object-cover ${dense ? "h-40" : "h-32"}`}
      />
      <button
        onClick={onPlay}
        className="absolute bottom-3 right-3 rounded-full bg-emerald-500 px-3 py-2 text-sm font-semibold text-black opacity-0 transition group-hover:opacity-100"
      >
        Play
      </button>
    </div>
    <div className="mt-3 space-y-1">
      <p className="font-semibold text-white">{track.title}</p>
      <p className="text-sm text-white/60">{track.artist}</p>
    </div>
    <button
      onClick={onAdd}
      className="mt-3 w-full rounded-2xl border border-white/10 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
    >
      Add to playlist
    </button>
  </motion.div>
);

const Modal = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    onClick={onClose}
  >
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-[#0f1022] p-6 shadow-2xl ring-1 ring-white/10"
    >
      {children}
    </motion.div>
  </motion.div>
);

const PlaylistForm = ({ onSubmit }: { onSubmit: (name: string, description?: string) => void }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(name.trim(), description.trim());
    setName("");
    setDescription("");
  };

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm text-white/60">Playlist name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full rounded-2xl bg-white/5 px-4 py-3 text-white ring-1 ring-white/10 focus:outline-none focus:ring-emerald-400/40"
          placeholder="Evening Vibes"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm text-white/60">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-2xl bg-white/5 px-4 py-3 text-white ring-1 ring-white/10 focus:outline-none focus:ring-emerald-400/40"
          placeholder="Optional"
        />
      </label>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setName("");
            setDescription("");
          }}
          className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/70 hover:text-white"
        >
          Clear
        </button>
        <button
          type="submit"
          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
        >
          Create
        </button>
      </div>
    </form>
  );
};
