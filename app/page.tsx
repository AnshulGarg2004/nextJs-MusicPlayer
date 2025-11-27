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
  const [skipSuggestions, setSkipSuggestions] = useState(false);

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
      setSuggestions([]);
      showToast(`Found ${tracks.length} result${tracks.length === 1 ? "" : "s"}`, "info");
    } catch {
      showToast("Unable to fetch results", "error");
    } finally {
      setSearching(false);
    }
  }, [fetchSongs, searchQuery, showToast]);

  const handleSuggestionClick = useCallback(
    (suggestion: Track) => {
      const newQuery = `${suggestion.title} ${suggestion.artist}`.trim();
      setSuggestions([]);
      setSearching(true);
      setActivePage("search");
      (async () => {
        try {
          const tracks = await fetchSongs(newQuery, 24);
          setSearchResults(tracks);
          setSearchQuery(newQuery);
          showToast(`Found ${tracks.length} result${tracks.length === 1 ? "" : "s"}`, "info");
        } catch {
          showToast("Unable to fetch results", "error");
        } finally {
          setSearching(false);
        }
      })();
    },
    [fetchSongs, showToast]
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
    if (searching || skipSuggestions) return;
    let cancelled = false;
    (async () => {
      const tracks = await fetchSongs(debouncedQuery.trim(), 5);
      if (!cancelled && !searching && !skipSuggestions) setSuggestions(tracks);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, fetchSongs, searching, skipSuggestions]);

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
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#0a0b14] via-[#0b0c18] to-[#0c0d15] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <header className="sticky top-0 z-40 flex flex-col gap-4 bg-gradient-to-r from-[#0a0b14]/95 via-[#0b0c18]/95 to-[#0c0d15]/95 backdrop-blur-xl border-b border-emerald-500/20 relative shadow-2xl px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none"></div>
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <motion.button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="rounded-full bg-white/10 p-2 transition hover:bg-white/20 flex items-center justify-center"
              aria-label="Toggle menu"
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                <motion.div 
                  className="absolute bg-white rounded-full"
                  animate={{
                    width: sidebarCollapsed ? "20px" : "2px",
                    height: sidebarCollapsed ? "2px" : "16px",
                    x: sidebarCollapsed ? 0 : -4,
                    y: sidebarCollapsed ? -4 : 0
                  }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                />
                <motion.div 
                  className="absolute bg-white rounded-full"
                  animate={{
                    width: sidebarCollapsed ? "20px" : "2px",
                    height: sidebarCollapsed ? "2px" : "16px",
                    y: sidebarCollapsed ? 0 : 0
                  }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                />
                <motion.div 
                  className="absolute bg-white rounded-full"
                  animate={{
                    width: sidebarCollapsed ? "20px" : "2px",
                    height: sidebarCollapsed ? "2px" : "16px",
                    x: sidebarCollapsed ? 0 : 4,
                    y: sidebarCollapsed ? 4 : 0
                  }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                />
              </div>
            </motion.button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 animate-pulse"></div>
                <p className="text-xs uppercase tracking-[0.2em] bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent font-semibold">Music Player</p>
              </div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-lg">Zync</h1>
            </div>
          </div>

          <motion.button
            onClick={() => setActivePage("playlist")}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="relative rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-2.5 text-sm font-semibold text-black transition-all duration-300 shadow-lg hover:shadow-emerald-500/25"
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-300 to-teal-300 opacity-0 hover:opacity-20 transition-opacity"></div>
            <span className="relative z-10">My Playlists</span>
          </motion.button>
        </div>

        <div className="relative z-10">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative flex items-center gap-3 rounded-2xl bg-gradient-to-r from-white/10 via-white/5 to-white/10 px-5 py-4 text-sm ring-1 ring-white/10 backdrop-blur-sm">
              <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                placeholder="Search songs, albums, artists..."
                className="w-full bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none focus:placeholder:text-white/60"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSuggestions([]);
                    setSearchResults([]);
                  }}
                  className="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white/60 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || searching}
                className="rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-emerald-500/25"
              >
                {searching ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin"></div>
                    <span>Searching</span>
                  </div>
                ) : (
                  "Search"
                )}
              </button>
            </div>
          </div>
          <AnimatePresence>
            {suggestions.length > 0 && activePage !== "search" && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute left-0 right-0 top-16 z-30 rounded-2xl border border-white/20 bg-gradient-to-b from-[#111224]/95 to-[#0f1022]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none"></div>
                <div className="relative max-h-80 overflow-y-auto">
                  {suggestions.map((item, index) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleSuggestionClick(item)}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/10 transition-colors group"
                    >
                      <div className="relative">
                        <img
                          src={item.artwork}
                          alt={item.title}
                          className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10 group-hover:ring-emerald-400/30 transition-all"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-100 transition-colors">{item.title}</p>
                        <p className="text-xs text-white/60 truncate group-hover:text-white/80 transition-colors">{item.artist}</p>
                      </div>
                      <svg className="w-4 h-4 text-white/30 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-10 pb-24">
        <aside
          className={`${
            sidebarCollapsed ? "w-20" : "w-72"
          } hidden flex-col gap-6 border-r border-emerald-500/20 bg-gradient-to-b from-[#0a0b14]/95 via-[#0b0c18]/95 to-[#0c0d15]/95 backdrop-blur-2xl ${sidebarCollapsed ? "px-4 py-6" : "px-8 py-8"} transition-all duration-300 lg:flex relative shadow-2xl`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none"></div>
          <nav className="space-y-1 relative z-10">
            {[
              { 
                id: "home", 
                label: "Home", 
                icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>
              },
              { 
                id: "library", 
                label: "Library", 
                icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>
              },
              { 
                id: "playlist", 
                label: "Playlists", 
                icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M17.721 1.599a.75.75 0 01.279.584v11.29a2.25 2.25 0 01-1.774 2.198l-2.041.442a2.216 2.216 0 01-2.634-2.174V9.321a.75.75 0 01.279-.584l4.172-3.306a.75.75 0 011.719.168zm-5.951 8.4a.75.75 0 00-.279-.584L7.279 6.109a.75.75 0 00-1.719.168v11.29a2.25 2.25 0 001.774 2.198l2.041.442a2.216 2.216 0 002.634-2.174V9.999z" clipRule="evenodd"/></svg>
              },
              { 
                id: "search", 
                label: "Search", 
                icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/></svg>
              },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id as PageView);
                  setSuggestions([]);
                  if (item.id !== "search") {
                    setSearchQuery("");
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition ${
                  activePage === item.id
                    ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                    : "text-white/70 hover:bg-emerald-500/10 hover:text-emerald-200"
                }`}
              >
                <motion.span 
                  className={`text-lg ${sidebarCollapsed ? "drop-shadow-lg" : ""}`}
                  animate={{
                    scale: sidebarCollapsed ? 1.1 : 1,
                    filter: sidebarCollapsed ? "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" : "drop-shadow(0 0 0px rgba(0,0,0,0))"
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {item.icon}
                </motion.span>
                {!sidebarCollapsed && item.label}
              </button>
            ))}
          </nav>

          <div className="relative z-10">
            {!sidebarCollapsed && <p className="text-xs uppercase tracking-wider text-white/40">Upload</p>}
            <label className={`${sidebarCollapsed ? "" : "mt-2"} flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 ${sidebarCollapsed ? "p-2" : "p-4"} text-center text-sm text-white/70 hover:border-white/40`}>
              <motion.span 
                className={sidebarCollapsed ? "text-xs" : ""}
                animate={{
                  scale: sidebarCollapsed ? 1.2 : 1,
                  filter: sidebarCollapsed ? "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" : "none"
                }}
                transition={{ duration: 0.2 }}
              >
                {sidebarCollapsed ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z"/></svg> : "Upload local files"}
              </motion.span>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto relative z-10">
            {!sidebarCollapsed && <p className="text-xs uppercase tracking-wider text-white/40">Library</p>}
            {uploadedSongs.length === 0 ? (
              !sidebarCollapsed && <p className="text-sm text-white/50">No uploads yet</p>
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

        <main className="flex-1 overflow-y-auto px-6 py-8 md:px-10 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 via-transparent to-teal-500/3 pointer-events-none"></div>
          <div className="relative z-10">
          {activePage === "home" && (
            <div className="space-y-10">
              <div className="relative">
                <p className="text-sm uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent font-semibold">
                  Trending now
                </p>
                <h2 className="text-3xl font-bold relative">
                  <span className="absolute inset-0 bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent blur-sm">Good evening</span>
                  <span className="relative bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-lg">Good evening</span>
                </h2>
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
                        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
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
                        className="rounded-3xl bg-gradient-to-br from-white/5 to-white/0 p-5 ring-1 ring-white/10"
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
          </div>
        </main>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[#0a0b14] via-[#0b0c18]/98 to-[#0c0d15]/95 backdrop-blur-2xl border-t border-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none"></div>
        <div className="relative px-10 py-8">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-5 min-w-0 flex-1">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <img
                  src={currentSong?.artwork}
                  alt={currentSong?.title}
                  className="relative h-16 w-16 rounded-xl object-cover shadow-2xl ring-2 ring-white/20 group-hover:ring-emerald-400/30 transition-all"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-white truncate bg-gradient-to-r from-white to-white/90 bg-clip-text">{currentSong?.title}</p>
                <p className="text-sm text-white/60 truncate font-medium">{currentSong?.artist}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-4 flex-1 max-w-lg">
              <div className="flex items-center gap-8">
                <motion.button 
                  onClick={goToPrev} 
                  whileHover={{ scale: 1.15, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all duration-200 hover:shadow-lg"
                  aria-label="Previous song"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z"/>
                  </svg>
                </motion.button>
                
                <motion.button
                  onClick={togglePlayPause}
                  whileHover={{ scale: 1.08, y: -3 }}
                  whileTap={{ scale: 0.92 }}
                  className="relative rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 p-4 text-black shadow-2xl hover:shadow-emerald-500/40 transition-all duration-300"
                  aria-label="Toggle play"
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-300 to-teal-300 opacity-0 hover:opacity-20 transition-opacity"></div>
                  {isPlaying ? (
                    <svg className="w-6 h-6 relative z-10" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 relative z-10" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
                    </svg>
                  )}
                </motion.button>
                
                <motion.button 
                  onClick={goToNext} 
                  whileHover={{ scale: 1.15, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all duration-200 hover:shadow-lg"
                  aria-label="Next song"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798l-5.445-3.63z"/>
                  </svg>
                </motion.button>
              </div>
              
              <div className="flex w-full items-center gap-4 text-sm text-white/60">
                <span className="font-mono text-xs bg-white/5 px-2 py-1 rounded-md">{formatClock(currentTime)}</span>
                <div className="flex-1 relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
                  <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full shadow-lg shadow-emerald-500/50 transition-all duration-75 ease-linear"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={progress}
                    onChange={(event) => handleSeek(Number(event.target.value))}
                    className="absolute inset-0 w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer slider z-10"
                  />
                  <style jsx>{`
                    .slider::-webkit-slider-thumb {
                      appearance: none;
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #10b981, #14b8a6, #06b6d4);
                      cursor: pointer;
                      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5), 0 0 0 2px rgba(255,255,255,0.1);
                      transition: all 0.2s ease;
                    }
                    .slider:hover::-webkit-slider-thumb {
                      transform: scale(1.2);
                      box-shadow: 0 6px 16px rgba(16, 185, 129, 0.7), 0 0 0 3px rgba(255,255,255,0.2);
                    }
                    .slider::-moz-range-thumb {
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #10b981, #14b8a6, #06b6d4);
                      cursor: pointer;
                      border: none;
                      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5), 0 0 0 2px rgba(255,255,255,0.1);
                    }
                  `}</style>
                </div>
                <span className="font-mono text-xs bg-white/5 px-2 py-1 rounded-md">{formatClock(duration)}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 flex-1 justify-end">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-3 bg-white/5 rounded-full px-4 py-2 backdrop-blur-sm"
              >
                <svg className="w-5 h-5 text-white/60" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0A9.972 9.972 0 0119 12a9.972 9.972 0 01-1.929 5.657 1 1 0 11-1.414-1.414A7.971 7.971 0 0017 12c0-2.21-.896-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 12a5.983 5.983 0 01-.757 2.829 1 1 0 11-1.415-1.414A3.987 3.987 0 0013.5 12a3.987 3.987 0 00-.672-1.415 1 1 0 010-1.414z" clipRule="evenodd"/>
                </svg>
                <div className="relative w-28 h-2">
                  <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full shadow-lg shadow-emerald-500/50 transition-all duration-200"
                      style={{ width: `${volume * 100}%` }}
                    ></div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(event) => handleVolume(Number(event.target.value))}
                    className="absolute inset-0 w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer volume-slider z-10"
                  />
                </div>
                <style jsx>{`
                  .volume-slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6b7280, #9ca3af);
                    cursor: pointer;
                    box-shadow: 0 2px 6px rgba(107, 114, 128, 0.4);
                    transition: all 0.2s ease;
                  }
                  .volume-slider:hover::-webkit-slider-thumb {
                    transform: scale(1.1);
                    background: linear-gradient(135deg, #9ca3af, #d1d5db);
                  }
                  .volume-slider::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6b7280, #9ca3af);
                    cursor: pointer;
                    border: none;
                    box-shadow: 0 2px 6px rgba(107, 114, 128, 0.4);
                  }
                `}</style>
              </motion.div>
            </div>
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
                    <span className="text-sm text-emerald-400">Add <span className="text-emerald-400">➕</span></span>
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
            className={`fixed right-6 top-32 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl ${
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
    className="group relative rounded-3xl bg-white/5 backdrop-blur-sm p-3 ring-1 ring-emerald-500/20 hover:ring-emerald-400/40 transition-all hover:bg-white/10 shadow-lg hover:shadow-emerald-500/25"
  >
    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition-opacity -z-10"></div>
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <img
        src={track.artwork}
        alt={track.title}
        className={`w-full rounded-2xl object-cover ${dense ? "h-40" : "h-32"} relative z-10`}
      />
      <button
        onClick={onPlay}
        className="absolute bottom-3 right-3 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-2 text-sm font-semibold text-black opacity-0 transition-all group-hover:opacity-100 shadow-lg hover:shadow-emerald-500/25 z-20"
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
      className="mt-3 w-full rounded-2xl border border-emerald-500/30 py-2 text-sm text-emerald-300 transition-all hover:border-emerald-400/50 hover:text-emerald-200 hover:bg-emerald-500/10"
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
      className="relative max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-gradient-to-br from-[#0a0b14] via-[#0b0c18] to-[#0c0d15] p-6 shadow-2xl ring-1 ring-emerald-500/20 backdrop-blur-xl"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none rounded-3xl"></div>
      <div className="relative z-10">
        {children}
      </div>
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