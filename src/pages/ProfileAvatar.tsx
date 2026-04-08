import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "../app/components/ui/button";
import { ImageWithFallback } from "../app/components/figma/ImageWithFallback";
import { getStoredToken } from "../services/auth";
import { listProfiles, updateProfile, Profile } from "../services/profiles";

type ImportGlob = Record<string, string>;
type AvatarEntry = { key: string; url: string; filename: string };

export default function ProfileAvatar() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  const avatars = useMemo<AvatarEntry[]>(() => {
    const modules = import.meta.glob("../assets/profile-avatars/*.png", {
      eager: true,
      import: "default",
    }) as ImportGlob;

    return Object.entries(modules)
      .map(([path, url]) => {
        const filename = path.split("/").pop() || path;
        return { key: `profile-avatars/${filename}`, url, filename };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }, []);

  function scrollRight() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: 400, behavior: "smooth" });
  }

  useEffect(() => {
    if (!getStoredToken()) {
      navigate("/login", { replace: true });
      return;
    }
    const id = Number(profileId);
    if (!Number.isFinite(id)) {
      navigate("/profiles", { replace: true });
      return;
    }
    (async () => {
      try {
        const items = await listProfiles();
        const found = items.find((p) => p.id === id) || null;
        setProfile(found);
        setSelectedKey(found?.avatar_url || "");
      } catch (e: any) {
        setError(e?.response?.data?.error || "Falha ao carregar perfil");
      }
    })();
  }, [navigate, profileId]);

  async function save() {
    if (!profile) return;
    setError("");
    setSaving(true);
    try {
      await updateProfile(profile.id, { avatar_url: selectedKey || null });
      navigate("/profiles", { replace: true });
    } catch (e: any) {
      setError(e?.response?.data?.error || "Não foi possível salvar o avatar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4" />
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <button
          className="flex items-center gap-2 mb-6 text-black hover:text-gray-600 transition-colors"
          onClick={() => navigate("/profiles", { replace: true })}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="mb-8">
          <h1 className="text-4xl mb-2">Escolha o ícone do seu perfil</h1>
          <p className="text-lg text-gray-700">
            {profile ? `Para ${profile.name}` : "Carregando..."}
          </p>
        </div>

        {avatars.length === 0 ? (
          <div className="text-gray-700">
            Nenhuma imagem encontrada. Coloque arquivos PNG em{" "}
            <span className="font-semibold">src/assets/profile-avatars</span>.
          </div>
        ) : (
          <div className="mb-10">
            <h2 className="text-2xl mb-4">Fotos</h2>
            <div className="relative group">
              <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto pb-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as any}
              >
                {avatars.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setSelectedKey(a.key)}
                    className={`relative w-24 h-24 rounded-md overflow-hidden transition-all hover:scale-105 flex-shrink-0 ${
                      selectedKey === a.key ? "ring-4 ring-black" : ""
                    }`}
                    style={{ backgroundColor: "#e50914" }}
                  >
                    <ImageWithFallback src={a.url} alt="Avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <button
                onClick={scrollRight}
                className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Rolar para a direita"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        )}

        {error && <div className="text-red-600 mb-6">{error}</div>}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/profiles", { replace: true })} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !profile}>
            Salvar
          </Button>
        </div>
      </main>
    </div>
  );
}
