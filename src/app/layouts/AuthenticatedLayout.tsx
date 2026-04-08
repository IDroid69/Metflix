import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../components/Header";
import { MovieCard, Movie } from "../components/MovieCard";
import { MovieModal } from "../components/MovieModal";
import { FeaturedMovie } from "../components/FeaturedMovie";
import api from "../../services/api";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Card } from "../components/ui/card";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import {
  Calendar,
  Maximize,
  Minimize,
  Pause,
  Pencil,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Star,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";
import { getStoredToken, getStoredUserRaw } from "../../services/auth";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Hls from "hls.js";

type Episode = {
  id: number;
  series_id: number;
  season: number;
  episode_number: number;
  title: string;
  duration: string;
  video_url?: string;
  video_url_ptbr?: string;
  video_url_en?: string;
  credits_start_time?: number;
};

type SeriesSummary = {
  id: number;
  title: string;
  genre: string;
  year: number;
  rating: number;
  image: string;
  description: string;
  creator?: string;
  cast?: string[];
  episodes_count?: number;
  seasons_count?: number;
};

type SeriesDetail = SeriesSummary & {
  episodes: Episode[];
};

type PlayingItem = {
  kind: "movie" | "episode";
  title: string;
  src: string | null;
  sources?: { key: string; label: string; src: string }[];
  sourceKey?: string;
  poster?: string;
  movieId?: number;
  seriesId?: number;
  episodeId?: number;
  initialTimeSeconds?: number;
  creditsStartTime?: number;
  nextEpisode?: Episode;
};

function InlineVideoPlayer({
  src,
  sources,
  sourceKey,
  onSelectSource,
  poster,
  title,
  onError,
  initialTimeSeconds,
  onPersist,
  preferredLanguage,
  onNextEpisode,
  creditsStartTime,
  subtitlesFor,
  thumbnailUrlTemplate,
}: {
  src: string;
  sources?: { key: string; label: string; src: string }[];
  sourceKey?: string;
  onSelectSource?: (key: string, timeSeconds: number) => void;
  poster?: string;
  title: string;
  onError: () => void;
  initialTimeSeconds?: number;
  onPersist?: (positionSeconds: number, durationSeconds: number, ended: boolean) => void;
  preferredLanguage?: string;
  onNextEpisode?: () => void;
  creditsStartTime?: number;
  subtitlesFor?: { kind: "movie"; id: number } | { kind: "episode"; seriesId: number; episodeId: number };
  thumbnailUrlTemplate?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVolumeRef = useRef(1);
  const didInitialSeekRef = useRef(false);
  const didSelectAudioLanguageRef = useRef(false);
  const lastPersistAtRef = useRef(0);
  const [subtitleSources, setSubtitleSources] = useState<{ src: string; label: string; lang: string; id: string }[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [audioTracks, setAudioTracks] = useState<
    { id: number; label: string; language?: string; enabled: boolean }[]
  >([]);
  const [textTracksList, setTextTracksList] = useState<
    { index: number; label: string; language?: string; mode: string }[]
  >([]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const maybePersist = (posSeconds: number, ended: boolean) => {
      if (!onPersist) return;
      const now = Date.now();
      if (!ended && now - lastPersistAtRef.current < 5000) return;
      lastPersistAtRef.current = now;
      onPersist(posSeconds, video.duration || 0, ended);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      maybePersist(video.currentTime, false);
    };
    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setIsLoading(false);
      if (!didInitialSeekRef.current) {
        if (initialTimeSeconds && initialTimeSeconds > 0) {
          const safeTime = Math.min(
            initialTimeSeconds,
            Math.max(0, (video.duration || 0) - 1)
          );
          if (safeTime > 0) {
            video.currentTime = safeTime;
            setCurrentTime(safeTime);
          }
        }
        didInitialSeekRef.current = true;
        // Autoplay logic
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }

      const list = (video as any).audioTracks;
      if (list && typeof list.length === "number") {
        const normalize = (v: unknown) =>
          String(v || "")
            .trim()
            .toLowerCase()
            .replace("_", "-");

        if (!didSelectAudioLanguageRef.current && preferredLanguage) {
          const pref = normalize(preferredLanguage);
          let selectedIndex: number | null = null;

          for (let i = 0; i < list.length; i++) {
            const t = list[i];
            const lang = normalize(t?.language);
            if (!lang) continue;
            const match =
              pref === lang ||
              pref.startsWith(`${lang}-`) ||
              lang.startsWith(`${pref}-`) ||
              (pref.startsWith("pt") && lang.startsWith("pt")) ||
              (pref.startsWith("en") && lang.startsWith("en")) ||
              (pref.startsWith("pt") && (lang === "por" || lang === "ptb")) ||
              (pref.startsWith("en") && lang === "eng");
            if (match) {
              selectedIndex = i;
              break;
            }
          }

          if (selectedIndex !== null) {
            for (let i = 0; i < list.length; i++) {
              list[i].enabled = i === selectedIndex;
            }
          }
          didSelectAudioLanguageRef.current = true;
        }

        const tracks = Array.from({ length: list.length }, (_, i) => {
          const t = list[i];
          return {
            id: i,
            label: String(t?.label || t?.language || `Faixa ${i + 1}`),
            language: t?.language ? String(t.language) : undefined,
            enabled: !!t?.enabled,
          };
        });
        setAudioTracks(tracks);
      } else {
        setAudioTracks([]);
      }

      const textTracks = (video as any).textTracks as TextTrackList | undefined;
      if (textTracks && typeof textTracks.length === "number") {
        const normalize = (v: unknown) =>
          String(v || "")
            .trim()
            .toLowerCase()
            .replace("_", "-");
        const pref = preferredLanguage ? normalize(preferredLanguage) : "";
        let selectedIndex: number | null = null;
        for (let i = 0; i < textTracks.length; i++) {
          const t = textTracks[i];
          const lang = normalize((t as any)?.language);
          if (!lang) continue;
          const match =
            pref === lang ||
            (pref && (pref.startsWith("pt") && lang.startsWith("pt"))) ||
            (pref && (pref.startsWith("en") && lang.startsWith("en")));
          if (match) {
            selectedIndex = i;
            break;
          }
        }
        for (let i = 0; i < textTracks.length; i++) {
          textTracks[i].mode = selectedIndex === null ? "disabled" : i === selectedIndex ? "showing" : "disabled";
        }
        if (selectedIndex === null && textTracks.length > 0) {
          textTracks[0].mode = "showing";
        }
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      maybePersist(video.currentTime, true);
    };

    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
    };
  }, [initialTimeSeconds, onPersist]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTextTracks = () => {
      const tracks = video.textTracks;
      if (!tracks) return;
      const list = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        list.push({
          index: i,
          label: t.label || t.language || `Legenda ${i + 1}`,
          language: t.language,
          mode: t.mode,
        });
      }
      setTextTracksList(list);
    };

    updateTextTracks();

    const tracks = video.textTracks;
    if (tracks) {
      tracks.addEventListener("addtrack", updateTextTracks);
      tracks.addEventListener("removetrack", updateTextTracks);
      tracks.addEventListener("change", updateTextTracks);
    }

    return () => {
      if (tracks) {
        tracks.removeEventListener("addtrack", updateTextTracks);
        tracks.removeEventListener("removetrack", updateTextTracks);
        tracks.removeEventListener("change", updateTextTracks);
      }
    };
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" ? getStoredToken() || "" : "";
    const apiBaseLocal = ((api as any).defaults?.baseURL || "") as string;
    const fetchSubs = async () => {
      if (!subtitlesFor) {
        setSubtitleSources([]);
        return;
      }
      try {
        if (subtitlesFor.kind === "movie") {
          const res = await api.get(`/movies/${subtitlesFor.id}/subtitles`);
          const tracks = (res.data?.tracks || []) as { id: string; lang: string; label: string }[];
          setSubtitleSources(
            tracks.map((t) => ({
              id: t.id,
              lang: t.lang,
              label: t.label,
              src: `${apiBaseLocal}/movies/${subtitlesFor.id}/subtitle/${encodeURIComponent(t.id)}.vtt?token=${token}`,
            }))
          );
        } else {
          const res = await api.get(`/series/${subtitlesFor.seriesId}/episodes/${subtitlesFor.episodeId}/subtitles`);
          const tracks = (res.data?.tracks || []) as { id: string; lang: string; label: string }[];
          setSubtitleSources(
            tracks.map((t) => ({
              id: t.id,
              lang: t.lang,
              label: t.label,
              src: `${apiBaseLocal}/series/${subtitlesFor.seriesId}/episodes/${subtitlesFor.episodeId}/subtitle/${encodeURIComponent(t.id)}.vtt?token=${token}`,
            }))
          );
        }
      } catch {
        setSubtitleSources([]);
      }
    };
    fetchSubs();
  }, [subtitlesFor]);

  useEffect(() => {
    const handleFsChange = () => {
      const container = containerRef.current;
      setIsFullscreen(!!container && document.fullscreenElement === container);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsPlaying(false);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);
    setShowControls(true);
    setShowSettings(false);
    didInitialSeekRef.current = false;
    didSelectAudioLanguageRef.current = false;
    lastPersistAtRef.current = 0;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (src.endsWith(".m3u8")) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          fetchSetup: (context, initParams) => {
            const token = getStoredToken() || "";
            const headers = new Headers(initParams?.headers || {});
            if (token) headers.set("Authorization", `Bearer ${token}`);
            return new Request(context.url, { ...initParams, headers });
          },
          xhrSetup: (xhr, url) => {
            const token = getStoredToken() || "";
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          },
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        const token = getStoredToken() || "";
        // iOS Safari: append token via query param since fetchSetup não se aplica
        const url = token ? (src.includes("?") ? `${src}&token=${encodeURIComponent(token)}` : `${src}?token=${encodeURIComponent(token)}`) : src;
        video.src = url;
      }
    } else {
      video.src = src;
      video.load();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  useEffect(() => {
    if (!showControls) setShowSettings(false);
  }, [showControls]);

  const scheduleHideControls = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (!isPlaying) return;
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) scheduleHideControls();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (!video || !onPersist) return;
      onPersist(video.currentTime, video.duration || duration, false);
    };
  }, [duration, onPersist, src]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const video = videoRef.current;
      const container = containerRef.current;
      if (!video) return;

      // Show controls on interaction
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          if (video.paused) {
            try {
              await video.play();
            } catch {}
            setIsPlaying(true);
          } else {
            video.pause();
            setIsPlaying(false);
            if (onPersist) onPersist(video.currentTime, video.duration || 0, false);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (!container) return;
          try {
            if (document.fullscreenElement === container) {
              await document.exitFullscreen();
            } else {
              await container.requestFullscreen();
            }
          } catch {}
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((prev) => {
            const v = Math.min(1, prev + 0.1);
            video.volume = v;
            lastVolumeRef.current = v > 0 ? v : lastVolumeRef.current;
            const muted = v === 0;
            setIsMuted(muted);
            video.muted = muted;
            return v;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((prev) => {
            const v = Math.max(0, prev - 0.1);
            video.volume = v;
            lastVolumeRef.current = v > 0 ? v : lastVolumeRef.current;
            const muted = v === 0;
            setIsMuted(muted);
            video.muted = muted;
            return v;
          });
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onPersist]);

  const togglePlayPause = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) {
        await video.play();
      } else {
        video.pause();
      }
      setIsPlaying(!video.paused);
      if (video.paused && onPersist) {
        onPersist(video.currentTime, duration, false);
      }
    } catch {
      setIsPlaying(!video.paused);
    }
  };

  const thumbTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);
  const [hoverThumbUrl, setHoverThumbUrl] = useState<string | null>(null);

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const time = Math.max(0, Math.min(pos * duration, duration));
    setHoverTime(time);
    setHoverPos(e.clientX - rect.left);

    if (thumbnailUrlTemplate) {
      if (thumbTimeoutRef.current) clearTimeout(thumbTimeoutRef.current);
      thumbTimeoutRef.current = setTimeout(() => {
        setHoverThumbUrl(thumbnailUrlTemplate.replace("{time}", time.toFixed(0)));
      }, 150);
    }
  };

  const handleProgressMouseLeave = () => {
    setHoverTime(null);
    setHoverPos(null);
    setHoverThumbUrl(null);
    if (thumbTimeoutRef.current) {
      clearTimeout(thumbTimeoutRef.current);
      thumbTimeoutRef.current = null;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = Math.max(0, Math.min(pos * duration, duration));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    video.volume = newVolume;
    if (newVolume > 0) lastVolumeRef.current = newVolume;
    const muted = newVolume === 0;
    setIsMuted(muted);
    video.muted = muted;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || isMuted || volume === 0) {
      const v = lastVolumeRef.current || 0.5;
      video.muted = false;
      video.volume = v;
      setVolume(v);
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      return;
    }
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
  };

  const formatTime = (time: number) => {
    const total = Number.isFinite(time) ? time : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = Math.floor(total % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progressPct = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black overflow-hidden group ${
        isFullscreen ? "flex items-center justify-center" : ""
      } ${isFullscreen && !showControls ? "cursor-none" : ""}`}
      onMouseEnter={() => {
        setShowControls(true);
        scheduleHideControls();
      }}
      onMouseMove={() => {
        setShowControls(true);
        scheduleHideControls();
      }}
      onTouchStart={() => {
        setShowControls(true);
        scheduleHideControls();
      }}
      onMouseLeave={() => {
        if (!isPlaying) return;
        setShowControls(false);
      }}
    >
      <video
        ref={videoRef}
        poster={poster}
        className={`w-full ${isFullscreen ? "h-full max-h-screen object-contain" : "aspect-video"}`}
        playsInline
        autoPlay
        onClick={togglePlayPause}
        onError={onError}
      >
        {subtitleSources.map((t) => (
          <track key={t.id} kind="subtitles" srcLang={t.lang} label={t.label} src={t.src} />
        ))}
      </video>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/30 border-t-red-600 rounded-full animate-spin" />
        </div>
      )}

      {onNextEpisode && creditsStartTime && currentTime >= creditsStartTime && (
        <button
          onClick={onNextEpisode}
          className="absolute bottom-16 right-4 md:bottom-24 md:right-6 z-50 bg-white text-black font-bold px-4 py-2 md:px-6 md:py-3 text-sm md:text-base rounded-lg shadow-lg hover:scale-105 transition-transform flex items-center gap-2"
        >
          <SkipForward className="w-4 h-4 md:w-5 md:h-5" />
          Próximo Episódio
        </button>
      )}

      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      />

      {!isPlaying && (
        <button
          onClick={togglePlayPause}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 border-2 border-white/40"
        >
          <Play className="w-10 h-10 text-white ml-1" fill="white" />
        </button>
      )}

      <div
        className={`absolute bottom-0 left-0 right-0 px-6 pb-4 transition-all duration-300 ${
          showControls ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        } ${isFullscreen ? "pb-8" : ""}`}
      >
        <div className="mb-3">
          <h3 className="text-white font-semibold">{title}</h3>
        </div>

        <div
          className="w-full h-1.5 bg-white/30 rounded-full cursor-pointer mb-4 group/progress hover:h-2 transition-all relative"
          onClick={handleProgressClick}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          <div
            className="h-full bg-red-600 rounded-full relative group-hover/progress:bg-red-500 transition-colors"
            style={{ width: `${progressPct}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-red-600 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>

          {hoverTime !== null && hoverPos !== null && (
            <div
              className="absolute bottom-6 transform -translate-x-1/2 pointer-events-none flex flex-col items-center z-50"
              style={{ left: hoverPos }}
            >
              {hoverThumbUrl && (
                <div className="mb-2 w-40 aspect-video bg-black border border-white/20 rounded overflow-hidden shadow-lg relative">
                   <img 
                     src={hoverThumbUrl} 
                     alt="Thumbnail" 
                     className="w-full h-full object-cover"
                     onError={(e) => {
                       e.currentTarget.style.display = 'none';
                     }}
                   />
                   {/* Gradient overlay for better text visibility */}
                   <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent" />
                </div>
              )}
              <div className="bg-black/80 text-white text-xs px-2 py-1 rounded border border-white/10 shadow-sm backdrop-blur-sm font-medium tracking-wide">
                {formatTime(hoverTime)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={togglePlayPause} className="text-white hover:text-red-500 transition-colors">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>

            <button onClick={() => skip(-10)} className="text-white hover:text-red-500 transition-colors">
              <SkipBack className="w-5 h-5" />
            </button>
            <button onClick={() => skip(10)} className="text-white hover:text-red-500 transition-colors">
              <SkipForward className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 group/volume">
              <button onClick={toggleMute} className="text-white hover:text-red-500 transition-colors">
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 opacity-0 group-hover/volume:w-20 group-hover/volume:opacity-100 transition-all h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
              />
            </div>

            <span className="text-white text-sm font-medium">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="text-white hover:text-red-500 transition-colors"
              onClick={() => {
                setShowSettings((v) => !v);
                setShowControls(true);
                scheduleHideControls();
              }}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={toggleFullscreen} className="text-white hover:text-red-500 transition-colors">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {showControls && (
        <div
          className={`absolute bottom-20 right-6 w-[260px] rounded-lg border border-white/10 bg-black/80 backdrop-blur-sm p-3 transition-opacity ${
            showSettings ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="text-white text-sm font-semibold mb-2">Configurações</div>
          <div className="space-y-3">
            {sources && sources.length > 1 && (
              <div className="space-y-2">
                <div className="text-zinc-300 text-xs">Idioma do vídeo</div>
                <select
                  className="w-full bg-black/60 border border-white/10 text-white text-sm rounded-md px-2 py-2"
                  value={sourceKey ?? sources[0]?.key}
                  onChange={(e) => {
                    const selectedKey = String(e.target.value);
                    onSelectSource?.(selectedKey, currentTime);
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-zinc-300 text-xs">Legendas</div>
              <select
                className="w-full bg-black/60 border border-white/10 text-white text-sm rounded-md px-2 py-2"
                value={textTracksList.find((t) => t.mode === "showing")?.index ?? -1}
                onChange={(e) => {
                  const video = videoRef.current;
                  if (!video) return;
                  const selectedIndex = Number(e.target.value);
                  const tracks = video.textTracks;
                  for (let i = 0; i < tracks.length; i++) {
                    tracks[i].mode = i === selectedIndex ? "showing" : "disabled";
                  }
                }}
              >
                <option value={-1}>Sem legenda</option>
                {textTracksList.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-zinc-300 text-xs">Idioma do áudio</div>
              {audioTracks.length > 0 ? (
                <select
                  className="w-full bg-black/60 border border-white/10 text-white text-sm rounded-md px-2 py-2"
                  value={audioTracks.find((t) => t.enabled)?.id ?? 0}
                  onChange={(e) => {
                    const video = videoRef.current as any;
                    const list = video?.audioTracks;
                    const selectedId = Number(e.target.value);
                    if (list && typeof list.length === "number") {
                      for (let i = 0; i < list.length; i++) {
                        list[i].enabled = i === selectedId;
                      }
                      setAudioTracks((prev) =>
                        prev.map((t) => ({ ...t, enabled: t.id === selectedId }))
                      );
                    }
                  }}
                >
                  {audioTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-zinc-400 text-sm">Indisponível para este vídeo.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableMovieCard({
  movie,
  onClick,
  onDelete,
  disabled,
}: {
  movie: Movie;
  onClick: () => void;
  onDelete: (id: number) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: movie.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
    position: "relative" as "relative",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <MovieCard movie={movie} onClick={onClick} onDelete={onDelete} />
    </div>
  );
}

function SortableSeriesCard({
  series,
  onClick,
  onDelete,
  disabled,
}: {
  series: SeriesSummary;
  onClick: () => void;
  onDelete: (id: number) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: series.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
    position: "relative" as "relative",
  };

  const rating = Number(series.rating ?? 0);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="group relative cursor-pointer overflow-hidden bg-zinc-900 border-zinc-800 hover:border-red-600 transition-all duration-300 hover:scale-105"
        onClick={onClick}
      >
        {disabled ? null : (
          <>
            <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-transparent group-hover:border-red-600/50" />
          </>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(series.id);
            }}
            className="absolute top-3 left-3 z-10 bg-black/70 hover:bg-red-600 p-2 rounded-full"
          >
            <Trash2 size={16} className="text-white" />
          </button>
        )}

        <div className="relative aspect-[2/3] overflow-hidden">
          <ImageWithFallback
            src={series.image}
            alt={series.title}
            className="w-full h-full object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
                <Play className="w-8 h-8 text-white ml-1" fill="white" />
              </div>
            </div>
          </div>

          <div className="absolute top-3 right-3 bg-black/80 rounded-full px-2 py-1 flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-500" fill="currentColor" />
            <span className="text-sm text-white">{rating.toFixed(1)}</span>
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-white mb-2 line-clamp-1">{series.title}</h3>
          <div className="flex items-center justify-between text-sm text-zinc-400">
            <span className="text-red-500">{series.genre}</span>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{series.year}</span>
            </div>
          </div>
          <p className="text-zinc-500 text-sm mt-1">
            {series.seasons_count || 0} temporadas • {series.episodes_count || 0} episódios
          </p>
        </div>
      </Card>
    </div>
  );
}

type LastWatchedEpisode = {
  episode_id: number;
  position_seconds: number;
  duration_seconds: number | null;
  updated_at: string;
};

export default function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<SeriesDetail | null>(null);
  const [lastWatched, setLastWatched] = useState<LastWatchedEpisode | null>(null);
  const [contentType, setContentType] = useState<"movies" | "series">("movies");
  const [playing, setPlaying] = useState<PlayingItem | null>(null);
  const [videoError, setVideoError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("Todos");
  const userRaw = typeof window !== "undefined" ? getStoredUserRaw() : null;
  const user = userRaw ? JSON.parse(userRaw) : null;
  const isAdmin = !!user?.is_admin;
  const token = typeof window !== "undefined" ? getStoredToken() || "" : "";
  const apiBase = ((api as any).defaults?.baseURL || "") as string;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setMovies((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over?.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        const ids = newItems.map((m) => m.id);
        api.post("/movies/reorder", { ids }).catch(console.error);

        return newItems;
      });
    }
  };

  const handleSeriesDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSeries((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      const newItems = arrayMove(items, oldIndex, newIndex);

      const ids = newItems.map((s) => s.id);
      api.post("/series/reorder", { ids }).catch(console.error);

      return newItems;
    });
  };

  const isReorderEnabled = isAdmin && selectedGenre === "Todos" && !searchQuery;

  const preferredLanguage =
    typeof window !== "undefined"
      ? document?.documentElement?.lang || navigator.language || "pt-BR"
      : "pt-BR";

  const normalizeLang = (lang: string) =>
    String(lang || "")
      .trim()
      .toLowerCase()
      .replace("_", "-");

  const isHttpUrl = (url: string) => /^https?:\/\//.test(url);

  const buildMovieSources = (m: Movie) => {
    const candidates: { key: string; label: string; url?: string; langParam?: string }[] = [
      { key: "pt-BR", label: "Português (Brasil)", url: m.video_url_ptbr || undefined, langParam: "pt-BR" },
      { key: "en", label: "Inglês", url: m.video_url_en || undefined, langParam: "en" },
      { key: "default", label: "Padrão", url: m.video_url || undefined },
    ];

    const sources: { key: string; label: string; src: string }[] = [];
    for (const c of candidates) {
      if (!c.url) continue;
      const src = isHttpUrl(c.url)
        ? c.url
        : c.url.endsWith(".m3u8")
          ? (() => {
              const parts = c.url.split(/[\\/]/);
              const playlist = parts[parts.length - 1] || "master.m3u8";
              return `${apiBase}/movies/${m.id}/video/${encodeURIComponent(playlist)}?token=${token}${c.langParam ? `&lang=${encodeURIComponent(c.langParam)}` : ""}`;
            })()
          : `${apiBase}/movies/${m.id}/video?token=${token}${c.langParam ? `&lang=${encodeURIComponent(c.langParam)}` : ""}`;
      if (!sources.some((s) => s.src === src)) {
        sources.push({ key: c.key, label: c.label, src });
      }
    }

    const pref = normalizeLang(preferredLanguage);
    const preferredKey =
      pref.startsWith("pt") ? "pt-BR" : pref.startsWith("en") ? "en" : "default";
    const defaultKey =
      sources.some((s) => s.key === preferredKey)
        ? preferredKey
        : sources.some((s) => s.key === "default")
          ? "default"
          : sources[0]?.key;

    const src = defaultKey ? sources.find((s) => s.key === defaultKey)?.src || null : null;
    return { sources, defaultKey, src };
  };

  const buildEpisodeSources = (seriesId: number, e: Episode) => {
    const candidates: { key: string; label: string; url?: string; langParam?: string }[] = [
      { key: "pt-BR", label: "Português (Brasil)", url: e.video_url_ptbr || undefined, langParam: "pt-BR" },
      { key: "en", label: "Inglês", url: e.video_url_en || undefined, langParam: "en" },
      { key: "default", label: "Padrão", url: e.video_url || undefined },
    ];

    const sources: { key: string; label: string; src: string }[] = [];
    for (const c of candidates) {
      if (!c.url) continue;
      const src = isHttpUrl(c.url)
        ? c.url
        : c.url.endsWith(".m3u8")
          ? (() => {
              const parts = c.url.split(/[\\/]/);
              const playlist = parts[parts.length - 1] || "master.m3u8";
              return `${apiBase}/series/${seriesId}/episodes/${e.id}/video/${encodeURIComponent(playlist)}?token=${token}${c.langParam ? `&lang=${encodeURIComponent(c.langParam)}` : ""}`;
            })()
          : `${apiBase}/series/${seriesId}/episodes/${e.id}/video?token=${token}${c.langParam ? `&lang=${encodeURIComponent(c.langParam)}` : ""}`;
      if (!sources.some((s) => s.src === src)) {
        sources.push({ key: c.key, label: c.label, src });
      }
    }

    const pref = normalizeLang(preferredLanguage);
    const preferredKey =
      pref.startsWith("pt") ? "pt-BR" : pref.startsWith("en") ? "en" : "default";
    const defaultKey =
      sources.some((s) => s.key === preferredKey)
        ? preferredKey
        : sources.some((s) => s.key === "default")
          ? "default"
          : sources[0]?.key;

    const src = defaultKey ? sources.find((s) => s.key === defaultKey)?.src || null : null;
    return { sources, defaultKey, src };
  };

  const isSamePlayingKey = (a: PlayingItem | null, b: PlayingItem) => {
    if (!a) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === "movie") return a.movieId === b.movieId;
    return a.seriesId === b.seriesId && a.episodeId === b.episodeId;
  };

  const fetchProgressSeconds = async (item: PlayingItem) => {
    try {
      if (item.kind === "movie" && item.movieId) {
        const res = await api.get(`/progress/movie/${item.movieId}`);
        return Number(res.data?.position_seconds || 0);
      }
      if (item.kind === "episode" && item.seriesId && item.episodeId) {
        const res = await api.get(
          `/progress/series/${item.seriesId}/episodes/${item.episodeId}`
        );
        return Number(res.data?.position_seconds || 0);
      }
      return 0;
    } catch {
      return 0;
    }
  };

  const openPlayerWithProgress = async (item: PlayingItem) => {
    setPlaying({ ...item, initialTimeSeconds: 0 });
    setVideoError("");
    if (!item.src) return;

    const pos = await fetchProgressSeconds(item);
    if (pos > 0) {
      setPlaying((prev) => (isSamePlayingKey(prev, item) ? { ...prev, initialTimeSeconds: pos } : prev));
    }
  };

  const playEpisode = (s: SeriesDetail, e: Episode, initialTime: number = 0) => {
    const built = buildEpisodeSources(s.id, e);
    if (!built?.src) return;

    const allEpisodes = [...s.episodes].sort((a, b) =>
      a.season !== b.season
        ? a.season - b.season
        : a.episode_number !== b.episode_number
          ? a.episode_number - b.episode_number
          : a.id - b.id
    );
    const idx = allEpisodes.findIndex((ep) => ep.id === e.id);
    const nextEp = idx >= 0 && idx < allEpisodes.length - 1 ? allEpisodes[idx + 1] : undefined;

    openPlayerWithProgress({
      kind: "episode",
      title: `${s.title} • T${e.season}E${e.episode_number} • ${e.title}`,
      src: built.src,
      sources: built.sources,
      sourceKey: built.defaultKey,
      poster: s.image,
      seriesId: s.id,
      episodeId: e.id,
      initialTimeSeconds: initialTime,
      creditsStartTime: e.credits_start_time,
      nextEpisode: nextEp,
    });
  };

  const handlePlayNextEpisode = async (nextEp: Episode) => {
    if (!playing?.seriesId) return;

    let s = selectedSeries;
    if (!s || s.id !== playing.seriesId) {
      try {
        const res = await api.get<SeriesDetail>(`/series/${playing.seriesId}`);
        s = res.data;
      } catch {
        return;
      }
    }

    if (s) {
      playEpisode(s, nextEp);
    }
  };

  const persistProgress = async (
    item: PlayingItem,
    positionSeconds: number,
    durationSeconds: number,
    ended: boolean
  ) => {
    if (!item.src) return;
    if (!durationSeconds || durationSeconds <= 0) return;

    let pos = Number(positionSeconds || 0);
    const dur = Number(durationSeconds || 0);
    if (!Number.isFinite(pos) || pos < 0) pos = 0;

    if (ended || pos > Math.max(0, dur - 10)) {
      pos = 0;
    }

    try {
      const payload = { position_seconds: pos, duration_seconds: dur };
      if (item.kind === "movie" && item.movieId) {
        await api.put(`/progress/movie/${item.movieId}`, payload);
      } else if (item.kind === "episode" && item.seriesId && item.episodeId) {
        await api.put(`/progress/series/${item.seriesId}/episodes/${item.episodeId}`, payload);
      }
    } catch {
      return;
    }
  };

  const loadMovies = async () => {
    try {
      const response = await api.get<Movie[]>("/movies/");
      setMovies(response.data);
    } catch (error) {
      console.error("Erro ao carregar filmes:", error);
    }
  };

  const loadSeries = async () => {
    try {
      const response = await api.get<SeriesSummary[]>("/series/");
      setSeries(response.data);
    } catch (error) {
      console.error("Erro ao carregar séries:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Deseja excluir este filme?")) return;
    try {
      await api.delete(`/movies/${id}`);
      setMovies((prev) => prev.filter((movie) => movie.id !== id));
    } catch (error) {
      console.error("Erro ao deletar filme:", error);
    }
  };

  const handleDeleteSeries = async (id: number) => {
    if (!confirm("Deseja excluir esta série?")) return;
    try {
      await api.delete(`/series/${id}`);
      setSeries((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Erro ao deletar série:", error);
    }
  };

  const openSeries = async (id: number) => {
    try {
      const token = getStoredToken();
      const [seriesRes, progressRes] = await Promise.all([
        api.get<SeriesDetail>(`/series/${id}`),
        token
          ? api
              .get<LastWatchedEpisode | null>(`/progress/series/${id}/last_watched`)
              .catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      setSelectedSeries(seriesRes.data);
      setLastWatched(progressRes.data);
    } catch (error) {
      console.error("Erro ao carregar série:", error);
    }
  };

  useEffect(() => {
    loadMovies();
    loadSeries();
  }, []);

  const featuredMovie =
    movies.length > 0
      ? [...movies].sort((a, b) => b.rating - a.rating)[0]
      : null;

  const featuredSeries =
    series.length > 0
      ? [...series].sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0))[0]
      : null;

  const playFirstEpisodeFromSeries = async (seriesId: number) => {
    try {
      const res = await api.get<SeriesDetail>(`/series/${seriesId}`);
      const s = res.data;
      const first = [...(s.episodes || [])].sort((a, b) =>
        a.season !== b.season
          ? a.season - b.season
          : a.episode_number !== b.episode_number
            ? a.episode_number - b.episode_number
            : a.id - b.id
      )[0];

      const built = first ? buildEpisodeSources(s.id, first) : null;
      if (built?.src) {
        playEpisode(s, first);
        return;
      }

      setSelectedSeries(s);
    } catch (error) {
      console.error("Erro ao carregar série:", error);
    }
  };

  const episodesBySeason = useMemo(() => {
    const s = selectedSeries;
    if (!s?.episodes) return [];
    const map = new Map<number, Episode[]>();
    for (const e of s.episodes) {
      if (!map.has(e.season)) map.set(e.season, []);
      map.get(e.season)!.push(e);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([season, eps]) => ({
        season,
        episodes: [...eps].sort((a, b) =>
          a.episode_number !== b.episode_number
            ? a.episode_number - b.episode_number
            : a.id - b.id
        ),
      }));
  }, [selectedSeries]);

  return (
    <div className="bg-black min-h-screen text-white">
      <Header
        onSearch={setSearchQuery}
        onGenreChange={setSelectedGenre}
        selectedGenre={selectedGenre}
      />

      <>
        {contentType === "movies" && featuredMovie && (
          <FeaturedMovie
            movie={featuredMovie}
            onPlayClick={() => {
              const built = buildMovieSources(featuredMovie);
              openPlayerWithProgress({
                kind: "movie",
                title: featuredMovie.title,
                src: built.src,
                sources: built.sources,
                sourceKey: built.defaultKey,
                poster: featuredMovie.image,
                movieId: featuredMovie.id,
              });
            }}
            onInfoClick={() => setSelectedMovie(featuredMovie)}
          />
        )}
        {contentType === "series" && featuredSeries && (
          <div className="relative w-full h-[70vh] overflow-hidden">
            <ImageWithFallback
              src={featuredSeries.image}
              alt={featuredSeries.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
            <div className="absolute inset-0 flex items-end">
              <div className="container mx-auto px-4 pb-12">
                <div className="max-w-2xl">
                  <div className="inline-block px-3 py-1 bg-red-600 text-white text-sm rounded-full mb-4">
                    EM DESTAQUE
                  </div>
                  <h1 className="text-white text-5xl md:text-6xl mb-4">
                    {featuredSeries.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 mb-6 text-zinc-300">
                    <div className="flex items-center gap-1">
                      <Star className="w-5 h-5 text-yellow-500" fill="currentColor" />
                      <span className="text-lg">
                        {Number(featuredSeries.rating ?? 0).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-5 h-5" />
                      <span>{featuredSeries.year}</span>
                    </div>
                    <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full">
                      {featuredSeries.genre}
                    </span>
                    <span className="text-zinc-400">
                      {featuredSeries.seasons_count || 0} temporadas •{" "}
                      {featuredSeries.episodes_count || 0} episódios
                    </span>
                  </div>
                  <p className="text-zinc-300 text-lg mb-8 line-clamp-3">
                    {featuredSeries.description}
                  </p>
                  <div className="flex gap-4">
                    <Button
                      size="lg"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => {
                        setVideoError("");
                        playFirstEpisodeFromSeries(featuredSeries.id);
                      }}
                    >
                      <Play className="w-5 h-5 mr-2" fill="white" />
                      Assistir Agora
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                      onClick={() => openSeries(featuredSeries.id)}
                    >
                      Mais Informações
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-2 mb-8">
            <button
              className={`px-4 py-2 rounded-full text-sm transition-colors ${
                contentType === "movies"
                  ? "bg-red-600 text-white"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
              onClick={() => setContentType("movies")}
            >
              Filmes
            </button>
            <button
              className={`px-4 py-2 rounded-full text-sm transition-colors ${
                contentType === "series"
                  ? "bg-red-600 text-white"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
              onClick={() => setContentType("series")}
            >
              Séries
            </button>
          </div>

          {contentType === "movies" ? (
            movies.length === 0 ? (
              <div className="text-center py-20 text-zinc-400">
                Nenhum filme cadastrado
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={movies.map((m) => m.id)}
                  strategy={rectSortingStrategy}
                  disabled={!isReorderEnabled}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {movies
                      .filter((movie) =>
                        (selectedGenre === "Todos" || movie.genre === selectedGenre) &&
                        movie.title.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((movie) => (
                        <SortableMovieCard
                          key={movie.id}
                          movie={movie}
                          onClick={() => setSelectedMovie(movie)}
                          onDelete={handleDelete}
                          disabled={!isReorderEnabled}
                        />
                      ))}
                  </div>
                </SortableContext>
              </DndContext>
            )
          ) : series.length === 0 ? (
            <div className="text-center py-20 text-zinc-400">
              Nenhuma série cadastrada
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSeriesDragEnd}
            >
              <SortableContext
                items={series.map((s) => s.id)}
                strategy={rectSortingStrategy}
                disabled={!isReorderEnabled}
              >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {series
                    .filter(
                      (s) =>
                        (selectedGenre === "Todos" || s.genre === selectedGenre) &&
                        s.title.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((s) => (
                      <SortableSeriesCard
                        key={s.id}
                        series={s}
                        onClick={() => openSeries(s.id)}
                        onDelete={handleDeleteSeries}
                        disabled={!isReorderEnabled}
                      />
                    ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </main>

        <MovieModal
          movie={selectedMovie}
          open={!!selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onPlay={(m) => {
            const built = buildMovieSources(m);
            openPlayerWithProgress({
              kind: "movie",
              title: m.title,
              src: built.src,
              sources: built.sources,
              sourceKey: built.defaultKey,
              poster: m.image,
              movieId: m.id,
            });
            setSelectedMovie(null);
          }}
        />

        <Dialog
          open={!!selectedSeries}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedSeries(null);
            }
          }}
        >
          <DialogContent className="max-w-5xl p-0 bg-zinc-950 border-zinc-800 overflow-hidden text-white max-h-[90vh] flex flex-col">
            <DialogTitle className="sr-only">{selectedSeries?.title}</DialogTitle>
            <div className="relative w-full h-[30vh] md:h-[34vh] overflow-hidden shrink-0">
              <ImageWithFallback
                src={selectedSeries?.image || ""}
                alt={selectedSeries?.title || "Série"}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <h2 className="text-white text-3xl mb-2">{selectedSeries?.title}</h2>
                <div className="flex flex-wrap items-center gap-4 text-zinc-300">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-yellow-500" fill="currentColor" />
                    <span className="text-lg">{Number(selectedSeries?.rating ?? 0).toFixed(1)}/10</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-5 h-5" />
                    <span>{selectedSeries?.year}</span>
                  </div>
                  <span className="px-3 py-1 bg-red-600/20 text-red-500 rounded-full text-sm">
                    {selectedSeries?.genre}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-zinc-400">
                  {(selectedSeries?.seasons_count || 0)} temporadas • {(selectedSeries?.episodes?.length || selectedSeries?.episodes_count || 0)} episódios
                </div>
                {isAdmin && selectedSeries && (
                  <Button
                    variant="outline"
                    className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                    onClick={() => {
                      setSelectedSeries(null);
                      navigate(`/edit-series/${selectedSeries.id}`);
                    }}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Editar Série
                  </Button>
                )}
              </div>

              {lastWatched && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="text-red-400 text-sm font-medium mb-1">
                      Continuar Assistindo
                    </div>
                    <div className="text-white font-medium">
                      {(() => {
                        const ep = selectedSeries?.episodes.find(
                          (e) => e.id === lastWatched.episode_id
                        );
                        if (!ep) return "Episódio anterior";
                        return `T${ep.season}E${ep.episode_number} - ${ep.title}`;
                      })()}
                    </div>
                    <div className="text-zinc-400 text-xs mt-1">
                      Restam{" "}
                      {(() => {
                        if (!lastWatched.duration_seconds) return "";
                        const left =
                          lastWatched.duration_seconds - lastWatched.position_seconds;
                        if (left < 60) return "menos de 1 min";
                        return Math.round(left / 60) + " min";
                      })()}
                    </div>
                  </div>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => {
                      const ep = selectedSeries?.episodes.find(
                        (e) => e.id === lastWatched.episode_id
                      );
                      if (ep && selectedSeries) {
                        playEpisode(selectedSeries, ep, lastWatched.position_seconds);
                        setSelectedSeries(null);
                      }
                    }}
                  >
                    <Play className="w-4 h-4 mr-2" fill="white" />
                    Continuar
                  </Button>
                </div>
              )}

              <div>
                <h3 className="text-white mb-2">Sinopse</h3>
                <p className="text-zinc-400 leading-relaxed">{selectedSeries?.description}</p>
              </div>

              {episodesBySeason.length === 0 ? (
                <div className="text-center text-zinc-400">Nenhum episódio cadastrado</div>
              ) : (
                <div className="space-y-6">
                  {episodesBySeason.map((section) => (
                    <div key={section.season} className="space-y-3">
                      <h3 className="text-white text-lg font-bold">Temporada {section.season}</h3>
                      <div className="space-y-2">
                        {section.episodes.map((e) => {
                          const built = selectedSeries ? buildEpisodeSources(selectedSeries.id, e) : null;
                          const src = built?.src || null;
                          return (
                            <div
                              key={e.id}
                              className="flex items-center justify-between gap-4 bg-black/40 border border-zinc-800 rounded-lg px-4 py-3"
                            >
                              <div className="text-zinc-200">
                                E{e.episode_number} • {e.title} <span className="text-zinc-500">({e.duration})</span>
                              </div>
                              <Button
                                className="bg-red-600 hover:bg-red-700 text-white"
                                disabled={!src}
                                onClick={() => {
                                  if (selectedSeries) {
                                    playEpisode(selectedSeries, e);
                                    setSelectedSeries(null);
                                  }
                                }}
                              >
                                <Play className="w-4 h-4 mr-2" fill="white" />
                                Assistir
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!playing}
          onOpenChange={(open) => {
            if (!open) {
              setPlaying(null);
              setVideoError("");
            }
          }}
        >
          <DialogContent className="bg-black border-zinc-800 text-white p-0 sm:max-w-[95vw] md:max-w-[92vw] lg:max-w-[1200px]">
            <DialogTitle className="sr-only">{playing?.title}</DialogTitle>
            {playing?.src ? (
              <InlineVideoPlayer
                src={playing.src}
                sources={playing.sources}
                sourceKey={playing.sourceKey}
                onSelectSource={(key, timeSeconds) => {
                  setVideoError("");
                  setPlaying((prev) => {
                    if (!prev?.sources || prev.sources.length === 0) return prev;
                    const next = prev.sources.find((s) => s.key === key);
                    if (!next?.src) return { ...prev, sourceKey: key };
                    if (next.src === prev.src) return { ...prev, sourceKey: key };
                    return { ...prev, src: next.src, sourceKey: key, initialTimeSeconds: timeSeconds };
                  });
                }}
                poster={playing.poster}
                title={playing.title}
                onError={() =>
                  setVideoError("Não foi possível carregar o vídeo (404/arquivo não encontrado).")
                }
                initialTimeSeconds={playing.initialTimeSeconds}
                onPersist={(pos, dur, ended) => persistProgress(playing, pos, dur, ended)}
                preferredLanguage={preferredLanguage}
                creditsStartTime={playing.creditsStartTime}
                onNextEpisode={
                  playing.nextEpisode
                    ? () => handlePlayNextEpisode(playing.nextEpisode!)
                    : undefined
                }
                subtitlesFor={
                  playing.kind === "movie" && playing.movieId
                    ? { kind: "movie", id: playing.movieId }
                    : playing.kind === "episode" && playing.seriesId && playing.episodeId
                      ? { kind: "episode", seriesId: playing.seriesId, episodeId: playing.episodeId }
                      : undefined
                }
                thumbnailUrlTemplate={(() => {
                  const langParam = playing.sourceKey ? `&lang=${encodeURIComponent(playing.sourceKey)}` : "";
                  if (playing.kind === "movie" && playing.movieId) {
                    return `${apiBase}/movies/${playing.movieId}/thumbnail?time={time}&token=${token}${langParam}`;
                  }
                  if (playing.kind === "episode" && playing.seriesId && playing.episodeId) {
                    return `${apiBase}/series/${playing.seriesId}/episodes/${playing.episodeId}/thumbnail?time={time}&token=${token}${langParam}`;
                  }
                  return undefined;
                })()}
              />
            ) : (
              <div className="p-6 text-center text-zinc-400">
                Vídeo indisponível para este conteúdo.
              </div>
            )}

            {!!videoError && (
              <div className="p-4 text-center text-red-200 bg-red-900/30 border-t border-red-900/50">
                {videoError}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    </div>
  );
}
