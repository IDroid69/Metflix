import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listProfiles, createProfile, deleteProfile, Profile } from "../services/profiles";
import { Button } from "../app/components/ui/button";
import { Input } from "../app/components/ui/input";
import { getStoredToken } from "../services/auth";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../app/components/ui/dialog";
import { ImageWithFallback } from "../app/components/figma/ImageWithFallback";
import { Plus, Trash2 } from "lucide-react";

type ImportGlob = Record<string, string>;

export default function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [isManaging, setIsManaging] = useState<boolean>(false);
  const navigate = useNavigate();

  const avatarMap = useMemo(() => {
    const modules = import.meta.glob("../assets/profile-avatars/*.png", {
      eager: true,
      import: "default",
    }) as ImportGlob;

    const map = new Map<string, string>();
    for (const [path, url] of Object.entries(modules)) {
      const filename = path.split("/").pop() || path;
      map.set(`profile-avatars/${filename}`, url);
    }
    return map;
  }, []);

  function resolveAvatarSrc(avatarUrl?: string | null) {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://") || avatarUrl.startsWith("data:")) return avatarUrl;
    if (avatarUrl.startsWith("/")) return avatarUrl;
    return avatarMap.get(avatarUrl) || null;
  }

  useEffect(() => {
    if (!getStoredToken()) {
      navigate("/login", { replace: true });
      return;
    }
    load();
  }, []);

  async function load() {
    try {
      const items = await listProfiles();
      setProfiles(items);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Falha ao carregar perfis");
    }
  }

  async function add() {
    setError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe um nome para o perfil");
      return;
    }
    setLoading(true);
    try {
      const p = await createProfile({ name: trimmed });
      setProfiles((prev) => [...prev, p]);
      setName("");
      setAddOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Não foi possível criar o perfil");
    } finally {
      setLoading(false);
    }
  }

  function select(p: Profile) {
    if (isManaging) {
      navigate(`/profiles/${p.id}/avatar`);
      return;
    }
    localStorage.setItem("activeProfileId", String(p.id));
    navigate("/", { replace: true });
  }

  async function remove(p: Profile) {
    setError("");
    setLoading(true);
    try {
      await deleteProfile(p.id);
      setProfiles((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      setError(e?.response?.data?.error || "Não foi possível apagar o perfil");
    } finally {
      setLoading(false);
    }
  }

  const canAdd = profiles.length < 4;

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-8">
      <div className="w-full max-w-5xl">
        <h1 className="text-white text-5xl md:text-6xl text-center mb-12">Quem está assistindo?</h1>

        <div className="flex flex-wrap justify-center gap-6 mb-10">
          {profiles.map((p) => (
            <div key={p.id} className="group cursor-pointer" onClick={() => select(p)}>
              <div className="relative mb-3 transition-transform duration-200 hover:scale-110">
                <div className="w-36 h-36 md:w-44 md:h-44 rounded-md overflow-hidden border-4 border-transparent group-hover:border-white transition-all bg-[#2a2a2a] flex items-center justify-center">
                  {(() => {
                    const src = resolveAvatarSrc(p.avatar_url);
                    if (src) {
                      return <ImageWithFallback src={src} alt={p.name} className="w-full h-full object-cover" />;
                    }
                    return (
                      <div className="w-full h-full flex items-center justify-center text-white text-5xl">
                        {p.name.slice(0, 1).toUpperCase()}
                      </div>
                    );
                  })()}
                </div>
                {isManaging && (
                  <button
                    className="absolute bottom-2 right-2 bg-black/80 rounded-full p-2"
                    disabled={loading}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p);
                    }}
                    aria-label={`Excluir perfil ${p.name}`}
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>
              <p className="text-gray-400 text-center text-lg group-hover:text-white transition-colors">{p.name}</p>
            </div>
          ))}

          <div
            className={`group ${canAdd ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            onClick={() => {
              setError("");
              if (!canAdd) {
                setError("Limite de 4 perfis por conta atingido");
                return;
              }
              setAddOpen(true);
            }}
          >
            <div className="w-36 h-36 md:w-44 md:h-44 rounded-md mb-3 flex items-center justify-center bg-[#2a2a2a] hover:bg-[#3a3a3a] transition-all duration-200 hover:scale-110">
              <Plus className="w-20 h-20 text-gray-600 group-hover:text-white transition-colors" />
            </div>
            <p className="text-gray-400 text-center text-lg group-hover:text-white transition-colors">Adicionar perfil</p>
          </div>
        </div>

        {error && <div className="text-red-400 text-center mb-8">{error}</div>}

        <div className="flex justify-center">
          <button
            className="px-8 py-2 text-gray-400 text-xl border border-gray-500 hover:border-white hover:text-white transition-all tracking-wide"
            onClick={() => setIsManaging((v) => !v)}
          >
            {isManaging ? "CONCLUIR" : "GERENCIAR PERFIS"}
          </button>
        </div>

        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) {
              setName("");
              setError("");
            }
          }}
        >
          <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
            <DialogTitle className="text-white">Adicionar perfil</DialogTitle>
            <DialogDescription className="text-zinc-400">Crie um novo perfil para esta conta (máximo 4).</DialogDescription>
            <div className="space-y-4 mt-4">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do perfil"
                className="bg-zinc-900 border-zinc-700 text-white"
              />
              <Button disabled={loading} onClick={add} className="bg-red-600 hover:bg-red-700 text-white w-full">
                Criar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
