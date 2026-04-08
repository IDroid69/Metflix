import { Star, Play, Clock, Calendar } from 'lucide-react';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Movie } from './MovieCard';

interface FeaturedMovieProps {
  movie: Movie;
  onPlayClick: () => void;
  onInfoClick: () => void;
}

export function FeaturedMovie({ movie, onPlayClick, onInfoClick }: FeaturedMovieProps) {
  const rating = Number(movie.rating ?? 0);
  return (
    <div className="relative w-full h-[70vh] overflow-hidden">
      <ImageWithFallback
        src={movie.image}
        alt={movie.title}
        className="w-full h-full object-cover"
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      
      <div className="absolute inset-0 flex items-end">
        <div className="container mx-auto px-4 pb-12">
          <div className="max-w-2xl">
            <div className="inline-block px-3 py-1 bg-red-600 text-white text-sm rounded-full mb-4">
              EM DESTAQUE
            </div>
            
            <h1 className="text-white text-5xl md:text-6xl mb-4">{movie.title}</h1>
            
            <div className="flex flex-wrap items-center gap-4 mb-6 text-zinc-300">
              <div className="flex items-center gap-1">
                <Star className="w-5 h-5 text-yellow-500" fill="currentColor" />
                <span className="text-lg">{rating.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-5 h-5" />
                <span>{movie.year}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-5 h-5" />
                <span>{movie.duration}</span>
              </div>
              <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full">
                {movie.genre}
              </span>
            </div>
            
            <p className="text-zinc-300 text-lg mb-8 line-clamp-3">
              {movie.description}
            </p>
            
            <div className="flex gap-4">
              <Button 
                size="lg" 
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={onPlayClick}
              >
                <Play className="w-5 h-5 mr-2" fill="white" />
                Assistir Agora
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                onClick={onInfoClick}
              >
                Mais Informações
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
