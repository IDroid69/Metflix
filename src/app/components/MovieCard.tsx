import { Star, Clock, Play, Trash2 } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Card } from "./ui/card";
import { getStoredUserRaw } from "../../services/auth";

export interface Movie {
  id: number;
  title: string;
  genre: string;
  year: number;
  rating: number;
  duration: string;
  image: string;
  description: string;
  director: string;
  cast: string[];
  video_url?: string;
  video_url_ptbr?: string;
  video_url_en?: string;
}

interface MovieCardProps {
  movie: Movie;
  onClick: () => void;
  onDelete: (id: number) => void;
}

export function MovieCard({ movie, onClick, onDelete }: MovieCardProps) {
  const rating = Number(movie.rating ?? 0);
  const userRaw = typeof window !== "undefined" ? getStoredUserRaw() : null;
  const user = userRaw ? JSON.parse(userRaw) : null;
  const isAdmin = !!user?.is_admin;
  return (
    <Card
      className="group relative cursor-pointer overflow-hidden bg-zinc-900 border-zinc-800 hover:border-red-600 transition-all duration-300 hover:scale-105"
      onClick={onClick}
    >
      {/* BOTÃO EXCLUIR */}
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(movie.id);
          }}
          className="absolute top-3 left-3 z-10 bg-black/70 hover:bg-red-600 p-2 rounded-full"
        >
          <Trash2 size={16} className="text-white" />
        </button>
      )}

      <div className="relative aspect-[2/3] overflow-hidden">
        <ImageWithFallback
          src={movie.image}
          alt={movie.title}
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
          <span className="text-sm text-white">
            {rating.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-white mb-2 line-clamp-1">{movie.title}</h3>
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span className="text-red-500">{movie.genre}</span>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{movie.duration}</span>
          </div>
        </div>
        <p className="text-zinc-500 text-sm mt-1">{movie.year}</p>
      </div>
    </Card>
  );
}
