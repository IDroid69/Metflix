import { useEffect, useState } from "react";
import api from "../services/api";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../app/components/ui/button";
import { Input } from "../app/components/ui/input";
import { Textarea } from "../app/components/ui/textarea";
import { Label } from "../app/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "../app/components/ui/card";
import { ArrowLeft, Plus, Sparkles } from "lucide-react";

interface AddMovieProps {
  onMovieAdded?: () => void;
}

export default function AddMovie({ onMovieAdded }: AddMovieProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    genre: "",
    year: "",
    rating: "",
    duration: "",
    image: "",
    video_url: "",
    video_url_ptbr: "",
    video_url_en: "",
    subtitle_srt_ptbr: "",
    subtitle_srt_en: "",
    description: "",
    director: "",
    cast: "",
  });

  useEffect(() => {
    const loadExisting = async () => {
      if (!id) return;
      try {
        const res = await api.get(`/movies/${id}`);
        const m = res.data;
        setForm({
          title: m.title || "",
          genre: m.genre || "",
          year: String(m.year ?? ""),
          rating: String(m.rating ?? ""),
          duration: m.duration || "",
          image: m.image || "",
          video_url: m.video_url || "",
          video_url_ptbr: m.video_url_ptbr || "",
          video_url_en: m.video_url_en || "",
          subtitle_srt_ptbr: m.subtitle_srt_ptbr || "",
          subtitle_srt_en: m.subtitle_srt_en || "",
          description: m.description || "",
          director: m.director || "",
          cast: Array.isArray(m.cast) ? m.cast.join(", ") : (m.cast || ""),
        });
      } catch (e: any) {
        setError(e?.message || "Erro ao carregar filme");
      }
    };
    loadExisting();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleOptimize = async (field: "video_url" | "video_url_ptbr" | "video_url_en") => {
    const current = form[field];
    if (!current) {
      alert("Por favor, insira o nome do arquivo primeiro.");
      return;
    }
    try {
      const filename = current.trim();
      if (!confirm(`Deseja iniciar a otimização de mídia para: ${filename}?\nIsso irá gerar uma versão otimizada (HLS multi-bitrate) no servidor.`)) {
        return;
      }
      alert("Iniciando solicitação de otimização...");
      const res = await api.post("/media/optimize", { filename });
      const newPath = res.data.output_filename;
      alert(`Otimização iniciada com sucesso!\nID da Tarefa: ${res.data.task_id}\nArquivo de saída: ${newPath}\nO campo foi atualizado automaticamente.`);
      setForm((prev) => ({ ...prev, [field]: newPath }));
    } catch (err: any) {
      console.error(err);
      alert("Erro ao iniciar otimização: " + (err.response?.data?.error || err.message));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Basic validation
      if (!form.title || !form.image) {
        throw new Error("Título e URL da imagem são obrigatórios");
      }

      const payload = {
        ...form,
        year: Number(form.year),
        rating: Number(form.rating),
        cast: form.cast.split(",").map((c) => c.trim()),
      };

      if (id) {
        await api.put(`/movies/${id}`, payload);
      } else {
        await api.post("/movies/", payload);
      }

      onMovieAdded?.();
      navigate("/");
    } catch (err: any) {
      console.error(err);
      setError(err.message || (id ? "Erro ao atualizar filme" : "Erro ao cadastrar filme"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button
          variant="ghost"
          className="mb-6 text-zinc-400 hover:text-white pl-0 gap-2"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para a lista
        </Button>

        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Plus className="w-6 h-6 text-red-600" />
              {id ? "Editar Filme" : "Cadastrar Novo Filme"}
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {id
                ? "Atualize os dados abaixo e salve as alterações do filme."
                : "Preencha os dados abaixo para adicionar um novo filme ao catálogo."}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="Ex: Interestelar"
                    value={form.title}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Gênero</Label>
                  <Input
                    id="genre"
                    name="genre"
                    placeholder="Ex: Ficção Científica"
                    value={form.genre}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>
              </div>

              {/* Numbers */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">Ano</Label>
                  <Input
                    id="year"
                    name="year"
                    type="number"
                    placeholder="2014"
                    value={form.year}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rating">Nota (0-10)</Label>
                  <Input
                    id="rating"
                    name="rating"
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    placeholder="8.6"
                    value={form.rating}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duração</Label>
                  <Input
                    id="duration"
                    name="duration"
                    placeholder="2h 49m"
                    value={form.duration}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>
              </div>

              {/* Image URL */}
              <div className="space-y-2">
                <Label htmlFor="image">URL da Imagem (Poster) *</Label>
                <Input
                  id="image"
                  name="image"
                  placeholder="https://..."
                  value={form.image}
                  onChange={handleChange}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                />
              </div>

              {/* Video URL */}
              <div className="space-y-2">
                <Label htmlFor="video_url">URL do Vídeo (MP4)</Label>
                <div className="flex gap-2">
                  <Input
                    id="video_url"
                    name="video_url"
                    placeholder="Nome do arquivo ou URL"
                    value={form.video_url}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    title="Otimizar Mídia"
                    onClick={() => handleOptimize("video_url")}
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white px-3"
                  >
                    <Sparkles className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="video_url_ptbr">URL do Vídeo (PT-BR)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="video_url_ptbr"
                      name="video_url_ptbr"
                      placeholder="Nome do arquivo ou URL"
                      value={form.video_url_ptbr}
                      onChange={handleChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      title="Otimizar Mídia"
                      onClick={() => handleOptimize("video_url_ptbr")}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white px-3"
                    >
                      <Sparkles className="w-4 h-4" />
                    </Button>
                  </div>
                  <Label htmlFor="subtitle_srt_ptbr" className="mt-3">Legenda SRT (PT-BR)</Label>
                  <Input
                    id="subtitle_srt_ptbr"
                    name="subtitle_srt_ptbr"
                    placeholder="Ex: movie_12_pt-BR.srt"
                    value={form.subtitle_srt_ptbr}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="video_url_en">URL do Vídeo (EN)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="video_url_en"
                      name="video_url_en"
                      placeholder="Nome do arquivo ou URL"
                      value={form.video_url_en}
                      onChange={handleChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      title="Otimizar Mídia"
                      onClick={() => handleOptimize("video_url_en")}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white px-3"
                    >
                      <Sparkles className="w-4 h-4" />
                    </Button>
                  </div>
                  <Label htmlFor="subtitle_srt_en" className="mt-3">Legenda SRT (EN)</Label>
                  <Input
                    id="subtitle_srt_en"
                    name="subtitle_srt_en"
                    placeholder="Ex: movie_12_en.srt"
                    value={form.subtitle_srt_en}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>
              </div>

              {/* People */}
              <div className="space-y-2">
                <Label htmlFor="director">Diretor</Label>
                <Input
                  id="director"
                  name="director"
                  placeholder="Ex: Christopher Nolan"
                  value={form.director}
                  onChange={handleChange}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cast">Elenco (separado por vírgula)</Label>
                <Input
                  id="cast"
                  name="cast"
                  placeholder="Matthew McConaughey, Anne Hathaway..."
                  value={form.cast}
                  onChange={handleChange}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Sinopse</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Um grupo de exploradores faz uso de um buraco de minhoca..."
                  value={form.description}
                  onChange={handleChange}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600 min-h-[120px]"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded bg-red-900/30 border border-red-900/50 text-red-200 text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                className="border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-red-600 hover:bg-red-700 font-bold min-w-[120px]"
                disabled={loading}
              >
                {loading ? "Salvando..." : id ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </div>
          </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
