import { Film, Search, Plus, LogOut } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useNavigate } from 'react-router-dom';
import { clearAuthSession, getStoredToken, getStoredUserRaw } from '../../services/auth';

interface HeaderProps {
  onSearch: (query: string) => void;
  onGenreChange: (genre: string) => void;
  selectedGenre: string;
}

const genres = ['Todos', 'Ação', 'Comédia', 'Drama', 'Ficção Científica', 'Terror', 'Romance'];

export function Header({ onSearch, onGenreChange, selectedGenre }: HeaderProps) {
  const navigate = useNavigate();
  const userRaw = typeof window !== "undefined" ? getStoredUserRaw() : null;
  const user = userRaw ? JSON.parse(userRaw) : null;
  const isAdmin = !!user?.is_admin;
  const hasToken = typeof window !== "undefined" ? !!getStoredToken() : false;
  return (
    <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-zinc-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Film className="w-8 h-8 text-red-600" />
            <h1 className="text-2xl font-bold text-white"><a href="">MetFlix</a></h1>
          </div>

          {/* Search Bar */}
          <div className="flex-1 w-full md:max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <Input
              type="text"
              placeholder="Buscar títulos..."
              className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-400"
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>

          {/* Genre Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide">
            {genres.map((genre) => (
              <button
                key={genre}
                onClick={() => onGenreChange(genre)}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                  selectedGenre === genre
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {genre}
              </button>
            ))}
            {isAdmin && (
              <>
                <Button
                  onClick={() => navigate("/add")}
                  className="ml-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Filme
                </Button>
                <Button
                  onClick={() => navigate("/add-series")}
                  className="ml-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Série
                </Button>
              </>
            )}
            {hasToken && (
              <Button
                onClick={() => {
                  clearAuthSession();
                  navigate("/login", { replace: true });
                }}
                variant="outline"
                className="border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
