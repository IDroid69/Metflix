import { X, Star, Clock, Calendar, Play, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Movie } from './MovieCard';
import { useNavigate } from 'react-router-dom';
import { getStoredUserRaw } from '../../services/auth';

interface MovieModalProps {
  movie: Movie | null;
  open: boolean;
  onClose: () => void;
  onPlay: (movie: Movie) => void;
}

export function MovieModal({ movie, open, onClose, onPlay }: MovieModalProps) {
  if (!movie) return null;
  const rating = Number(movie.rating ?? 0);
  const navigate = useNavigate();
  const userRaw = typeof window !== "undefined" ? getStoredUserRaw() : null;
  const user = userRaw ? JSON.parse(userRaw) : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 bg-zinc-950 border-zinc-800 overflow-hidden">
        <DialogTitle className="sr-only">{movie.title}</DialogTitle>
        <DialogDescription className="sr-only">
          {movie.description}
        </DialogDescription>
        
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 hover:bg-black/70 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        
        <div className="relative aspect-video overflow-hidden">
          <ImageWithFallback
            src={movie.image}
            alt={movie.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6">
            <h2 className="text-white text-3xl mb-2">{movie.title}</h2>
            <div className="flex flex-wrap items-center gap-4 text-zinc-300">
              <div className="flex items-center gap-1">
                <Star className="w-5 h-5 text-yellow-500" fill="currentColor" />
                <span className="text-lg">{rating.toFixed(1)}/10</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-5 h-5" />
                <span>{movie.year}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-5 h-5" />
                <span>{movie.duration}</span>
              </div>
              <span className="px-3 py-1 bg-red-600/20 text-red-500 rounded-full text-sm">
                {movie.genre}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            onClick={() => onPlay(movie)}
          >
            <Play className="w-5 h-5 mr-2" />
            Assistir Agora
          </Button>
          
          {user?.is_admin && (
            <Button
              variant="outline"
              className="w-full border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
              onClick={() => {
                onClose();
                navigate(`/edit/${movie.id}`);
              }}
            >
              <Pencil className="w-5 h-5 mr-2" />
              Editar
            </Button>
          )}

          <div>
            <h3 className="text-white mb-2">Sinopse</h3>
            <p className="text-zinc-400 leading-relaxed">{movie.description}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-white mb-2">Diretor</h3>
              <p className="text-zinc-400">{movie.director}</p>
            </div>
            <div>
              <h3 className="text-white mb-2">Elenco</h3>
              <p className="text-zinc-400">{movie.cast.join(', ')}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
