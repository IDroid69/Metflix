import { useEffect, useState } from "react";
import api from "../services/api";

export default function Home() {
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    api.get("/movies/")
      .then(response => {
        setMovies(response.data);
      })
      .catch(error => {
        console.error("Erro ao buscar filmes:", error);
      });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>🎬 Filmes</h1>

      {movies.length === 0 && <p>Nenhum filme cadastrado</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 20 }}>
        {movies.map(movie => (
          <div key={movie.id} style={{ border: "1px solid #333", padding: 10 }}>
            <img src={movie.image} alt={movie.title} style={{ width: "100%" }} />
            <h3>{movie.title}</h3>
            <p>{movie.genre} • {movie.year}</p>
            <p>⭐ {movie.rating}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
