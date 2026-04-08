import { useEffect, useMemo, useState } from "react";
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
} from "../app/components/ui/card";
import { ArrowLeft, Plus, Pencil, Sparkles } from "lucide-react";

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
  subtitle_srt_ptbr?: string;
  subtitle_srt_en?: string;
};

type Series = {
  id: number;
  title: string;
  genre: string;
  year: number;
  rating: number;
  image: string;
  description: string;
  creator: string;
  cast: string[];
  episodes?: Episode[];
};

export default function AddSeries() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [editingEpisodeId, setEditingEpisodeId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    genre: "",
    year: "",
    rating: "",
    image: "",
    description: "",
    creator: "",
    cast: "",
  });

  const [episodeForm, setEpisodeForm] = useState({
    season: "1",
    episode_number: "1",
    title: "",
    duration: "",
    video_url: "",
    video_url_ptbr: "",
    video_url_en: "",
    credits_start_time: "",
    subtitle_srt_ptbr: "",
    subtitle_srt_en: "",
  });

  const seriesIdNumber = useMemo(() => (id ? Number(id) : null), [id]);

  useEffect(() => {
    const loadExisting = async () => {
      if (!id) return;
      try {
        const res = await api.get<Series>(`/series/${id}`);
        const s = res.data;
        setForm({
          title: s.title || "",
          genre: s.genre || "",
          year: String(s.year ?? ""),
          rating: String(s.rating ?? ""),
          image: s.image || "",
          description: s.description || "",
          creator: s.creator || "",
          cast: Array.isArray(s.cast) ? s.cast.join(", ") : "",
        });
        setEpisodes(Array.isArray(s.episodes) ? s.episodes : []);
      } catch (e: any) {
        setError(e?.message || "Erro ao carregar série");
      }
    };
    loadExisting();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEpisodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEpisodeForm({ ...episodeForm, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!form.title || !form.image) {
        throw new Error("Título e URL da imagem são obrigatórios");
      }

      const payload = {
        title: form.title,
        genre: form.genre,
        year: Number(form.year),
        rating: Number(form.rating),
        image: form.image,
        description: form.description,
        creator: form.creator,
        cast: form.cast.split(",").map((c) => c.trim()).filter(Boolean),
      };

      if (id) {
        await api.put(`/series/${id}`, payload);
      } else {
        const res = await api.post(`/series/`, payload);
        const createdId = res.data?.id;
        if (createdId) {
          navigate(`/edit-series/${createdId}`);
          return;
        }
      }

      navigate("/");
    } catch (err: any) {
      setError(err?.message || (id ? "Erro ao atualizar série" : "Erro ao cadastrar série"));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!id) {
      setError("Salve a série antes de adicionar episódios");
      return;
    }
    if (!episodeForm.title || !episodeForm.duration) {
      setError("Título e duração do episódio são obrigatórios");
      return;
    }

    const payload = {
      season: Number(episodeForm.season),
      episode_number: Number(episodeForm.episode_number),
      title: episodeForm.title,
      duration: episodeForm.duration,
      video_url: episodeForm.video_url || null,
      video_url_ptbr: episodeForm.video_url_ptbr || null,
      video_url_en: episodeForm.video_url_en || null,
      credits_start_time: episodeForm.credits_start_time ? Number(episodeForm.credits_start_time) : null,
      subtitle_srt_ptbr: episodeForm.subtitle_srt_ptbr || null,
      subtitle_srt_en: episodeForm.subtitle_srt_en || null,
    };

    try {
      if (editingEpisodeId) {
        await api.put(`/series/${id}/episodes/${editingEpisodeId}`, payload);
        setEpisodes((prev) =>
          prev.map((ep) =>
            ep.id === editingEpisodeId
              ? {
                  ...ep,
                  ...payload,
                  video_url: payload.video_url || undefined,
                  video_url_ptbr: payload.video_url_ptbr || undefined,
                  video_url_en: payload.video_url_en || undefined,
                  credits_start_time: payload.credits_start_time || undefined,
                }
              : ep
          ).sort((a, b) =>
            a.season !== b.season
              ? a.season - b.season
              : a.episode_number !== b.episode_number
                ? a.episode_number - b.episode_number
                : a.id - b.id
          )
        );
        setEditingEpisodeId(null);
        setEpisodeForm((prev) => ({
          ...prev,
          title: "",
          duration: "",
          video_url: "",
          video_url_ptbr: "",
          video_url_en: "",
          credits_start_time: "",
          subtitle_srt_ptbr: "",
          subtitle_srt_en: "",
        }));
      } else {
        const res = await api.post(`/series/${id}/episodes`, payload);
        const newId = res.data?.id;
        const newEpisode: Episode = {
          id: Number(newId),
          series_id: Number(id),
          ...payload,
          video_url: payload.video_url || undefined,
          video_url_ptbr: payload.video_url_ptbr || undefined,
          video_url_en: payload.video_url_en || undefined,
          credits_start_time: payload.credits_start_time || undefined,
          subtitle_srt_ptbr: payload.subtitle_srt_ptbr || undefined,
          subtitle_srt_en: payload.subtitle_srt_en || undefined,
        };
        setEpisodes((prev) =>
          [...prev, newEpisode].sort((a, b) =>
            a.season !== b.season
              ? a.season - b.season
              : a.episode_number !== b.episode_number
                ? a.episode_number - b.episode_number
                : a.id - b.id
          )
        );
        setEpisodeForm((prev) => ({
          ...prev,
          episode_number: String(Number(prev.episode_number) + 1),
          title: "",
          duration: "",
          video_url: "",
          video_url_ptbr: "",
          video_url_en: "",
          credits_start_time: "",
          subtitle_srt_ptbr: "",
          subtitle_srt_en: "",
        }));
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar episódio");
    }
  };

  const handleEditEpisode = (ep: Episode) => {
    setEditingEpisodeId(ep.id);
    setEpisodeForm({
      season: String(ep.season),
      episode_number: String(ep.episode_number),
      title: ep.title,
      duration: ep.duration,
      video_url: ep.video_url || "",
      video_url_ptbr: ep.video_url_ptbr || "",
      video_url_en: ep.video_url_en || "",
      credits_start_time: ep.credits_start_time ? String(ep.credits_start_time) : "",
      subtitle_srt_ptbr: ep.subtitle_srt_ptbr || "",
      subtitle_srt_en: ep.subtitle_srt_en || "",
    });
    document.getElementById("episodes-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingEpisodeId(null);
    setEpisodeForm({
      season: "1",
      episode_number: "1",
      title: "",
      duration: "",
      video_url: "",
      video_url_ptbr: "",
      video_url_en: "",
      credits_start_time: "",
      subtitle_srt_ptbr: "",
      subtitle_srt_en: "",
    });
  };

  const handleOptimize = async (field: string, url: string) => {
    if (!url) {
      alert("Por favor, insira o nome do arquivo primeiro.");
      return;
    }
    
    try {
      const filename = url.trim();
      if (!confirm(`Deseja iniciar a otimização de mídia para: ${filename}?\nIsso irá gerar uma versão otimizada (HLS multi-bitrate) no servidor.`)) {
        return;
      }

      alert(`Iniciando solicitação de otimização...`);
      const res = await api.post("/media/optimize", { filename });
      const newPath = res.data.output_filename;
      
      alert(`Otimização iniciada com sucesso!\nID da Tarefa: ${res.data.task_id}\nArquivo de saída: ${newPath}\nO campo foi atualizado automaticamente.`);
      
      setEpisodeForm(prev => ({ ...prev, [field]: newPath }));
      
    } catch (err: any) {
      console.error(err);
      alert("Erro ao iniciar otimização: " + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteEpisode = async (episodeId: number) => {
    if (!id) return;
    if (!confirm("Deseja excluir este episódio?")) return;
    try {
      await api.delete(`/series/${id}/episodes/${episodeId}`);
      setEpisodes((prev) => prev.filter((e) => e.id !== episodeId));
      if (editingEpisodeId === episodeId) {
        handleCancelEdit();
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao excluir episódio");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
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
              {id ? "Editar Série" : "Cadastrar Nova Série"}
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {id
                ? "Atualize os dados da série e gerencie os episódios."
                : "Preencha os dados abaixo para adicionar uma série ao catálogo."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      name="title"
                      placeholder="Ex: Stranger Things"
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
                      placeholder="Ex: Suspense"
                      value={form.genre}
                      onChange={handleChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="year">Ano</Label>
                    <Input
                      id="year"
                      name="year"
                      type="number"
                      placeholder="2016"
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
                      placeholder="8.8"
                      value={form.rating}
                      onChange={handleChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="creator">Criador</Label>
                    <Input
                      id="creator"
                      name="creator"
                      placeholder="Ex: The Duffer Brothers"
                      value={form.creator}
                      onChange={handleChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                  </div>
                </div>

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

                <div className="space-y-2">
                  <Label htmlFor="cast">Elenco (separado por vírgula)</Label>
                  <Input
                    id="cast"
                    name="cast"
                    placeholder="Ator 1, Ator 2..."
                    value={form.cast}
                    onChange={handleChange}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Sinopse</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Descrição da série..."
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

              <div className="flex justify-end gap-4 pt-2">
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
                  className="bg-red-600 hover:bg-red-700 font-bold min-w-[160px]"
                  disabled={loading}
                >
                  {loading ? "Salvando..." : id ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </div>
            </form>

            {seriesIdNumber && (
              <div className="mt-10 border-t border-zinc-800 pt-8">
                <h3 id="episodes-section" className="text-white text-xl font-bold mb-4">Episódios</h3>

                <form onSubmit={handleSaveEpisode} className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="season">Temporada</Label>
                      <Input
                        id="season"
                        name="season"
                        type="number"
                        min="1"
                        value={episodeForm.season}
                        onChange={handleEpisodeChange}
                        className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-red-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="episode_number">Episódio</Label>
                      <Input
                        id="episode_number"
                        name="episode_number"
                        type="number"
                        min="1"
                        value={episodeForm.episode_number}
                        onChange={handleEpisodeChange}
                        className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-red-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="duration">Duração *</Label>
                      <Input
                        id="duration"
                        name="duration"
                        placeholder="45m"
                        value={episodeForm.duration}
                        onChange={handleEpisodeChange}
                        className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="episode_title">Título do Episódio *</Label>
                      <Input
                        id="episode_title"
                        name="title"
                        placeholder="Ex: Capítulo Um"
                        value={episodeForm.title}
                        onChange={handleEpisodeChange}
                        className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="video_url">Vídeo (MP4)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="video_url"
                          name="video_url"
                          placeholder="Nome do arquivo ou URL"
                          value={episodeForm.video_url}
                          onChange={handleEpisodeChange}
                          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          title="Otimizar Mídia"
                          onClick={() => handleOptimize("video_url", episodeForm.video_url)}
                          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white px-3"
                        >
                          <Sparkles className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="video_url_ptbr">Vídeo (PT-BR)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="video_url_ptbr"
                        name="video_url_ptbr"
                        placeholder="Nome do arquivo ou URL"
                        value={episodeForm.video_url_ptbr}
                        onChange={handleEpisodeChange}
                        className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        title="Otimizar Mídia"
                        onClick={() => handleOptimize("video_url_ptbr", episodeForm.video_url_ptbr)}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white px-3"
                      >
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    </div>
                    <Label htmlFor="subtitle_srt_ptbr" className="mt-3">Legenda SRT (PT-BR)</Label>
                    <Input
                      id="subtitle_srt_ptbr"
                      name="subtitle_srt_ptbr"
                      placeholder="Ex: episode_7_21_pt-BR.srt"
                      value={episodeForm.subtitle_srt_ptbr}
                      onChange={handleEpisodeChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="video_url_en">Vídeo (EN)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="video_url_en"
                        name="video_url_en"
                        placeholder="Nome do arquivo ou URL"
                        value={episodeForm.video_url_en}
                        onChange={handleEpisodeChange}
                        className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        title="Otimizar Mídia"
                        onClick={() => handleOptimize("video_url_en", episodeForm.video_url_en)}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white px-3"
                      >
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    </div>
                    <Label htmlFor="subtitle_srt_en" className="mt-3">Legenda SRT (EN)</Label>
                    <Input
                      id="subtitle_srt_en"
                      name="subtitle_srt_en"
                      placeholder="Ex: episode_7_21_en.srt"
                      value={episodeForm.subtitle_srt_en}
                      onChange={handleEpisodeChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                  </div>
                </div>

                  <div className="space-y-2">
                    <Label htmlFor="credits_start_time">Início dos Créditos (segundos)</Label>
                    <Input
                      id="credits_start_time"
                      name="credits_start_time"
                      type="number"
                      step="1"
                      min="0"
                      placeholder="Ex: 2400 (para 40min)"
                      value={episodeForm.credits_start_time}
                      onChange={handleEpisodeChange}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-red-600"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    {editingEpisodeId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelEdit}
                        className="border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                      >
                        Cancelar Edição
                      </Button>
                    )}
                    <Button className="bg-red-600 hover:bg-red-700 font-bold" type="submit">
                      {editingEpisodeId ? "Salvar Alterações" : "Adicionar Episódio"}
                    </Button>
                  </div>
                </form>

                {episodes.length === 0 ? (
                  <div className="text-zinc-400 mt-6">Nenhum episódio cadastrado</div>
                ) : (
                  <div className="mt-6 space-y-2">
                    {episodes.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3"
                      >
                        <div className="text-zinc-200">
                          T{e.season}E{e.episode_number} • {e.title} <span className="text-zinc-500">({e.duration})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            className="border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                            onClick={() => handleEditEpisode(e)}
                            type="button"
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            className="ml-2 bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => handleDeleteEpisode(e.id)}
                            type="button"
                          >
                            Excluir
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
