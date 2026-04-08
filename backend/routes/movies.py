from flask import Blueprint, jsonify, request, Response, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.movie import Movie
from models.user import User
from database import db
from utils.media import get_embedded_subtitles, extract_subtitle_stream, generate_thumbnail
import os
import mimetypes
from typing import Optional
from urllib.parse import quote

movies_bp = Blueprint("movies", __name__)
VIDEO_DIR = os.getenv(
    "VIDEO_DIR",
    os.path.join(os.path.dirname(__file__), "..", "..", "videos")
)
SUBTITLE_DIR = os.path.join(VIDEO_DIR, "legendas")
CACHE_DIR = os.path.join(SUBTITLE_DIR, "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def _guess_mimetype(path: str) -> str:
    lower = path.lower()
    if lower.endswith(".m3u8"):
        return "application/vnd.apple.mpegurl"
    if lower.endswith(".ts"):
        return "video/mp2t"
    mt, _ = mimetypes.guess_type(path)
    return mt or "video/mp4"


def _normalize_lang(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = str(value).strip().lower()
    if not v:
        return None
    v = v.replace("_", "-")
    return v


def _select_movie_video_url(movie: Movie, lang: Optional[str]) -> Optional[str]:
    l = _normalize_lang(lang)
    if l:
        if l in ("pt", "pt-br", "ptbr", "portuguese", "portugues"):
            return movie.video_url_ptbr or movie.video_url
        if l in ("en", "en-us", "enus", "english"):
            return movie.video_url_en or movie.video_url
    return movie.video_url

def _lang_label(l: str) -> str:
    v = (l or "").strip().lower()
    if v in ("pt", "pt-br", "ptbr", "portuguese", "portugues"):
        return "Português (Brasil)"
    if v in ("en", "en-us", "enus", "english"):
        return "Inglês"
    return l

def _normalize_code(l: str) -> str:
    return (l or "").strip().replace("_", "-")

def _find_movie_srt(id: int, lang: str) -> Optional[str]:
    movie = Movie.query.get(id)
    if movie:
        code_req = _normalize_code(lang).lower()
        if code_req.startswith("pt"):
            fname = movie.subtitle_srt_ptbr
            if fname:
                p = os.path.abspath(os.path.join(SUBTITLE_DIR, fname))
                try:
                    if os.path.commonpath([p, SUBTITLE_DIR]) != SUBTITLE_DIR:
                        p = None
                except ValueError:
                    p = None
                if p and os.path.exists(p):
                    return p
        if code_req.startswith("en"):
            fname = movie.subtitle_srt_en
            if fname:
                p = os.path.abspath(os.path.join(SUBTITLE_DIR, fname))
                try:
                    if os.path.commonpath([p, SUBTITLE_DIR]) != SUBTITLE_DIR:
                        p = None
                except ValueError:
                    p = None
                if p and os.path.exists(p):
                    return p
    code = _normalize_code(lang)
    candidates = [
        f"movie_{id}_{code}.srt",
        f"movie-{id}-{code}.srt",
        f"{id}_{code}.srt",
    ]
    for name in candidates:
        p = os.path.abspath(os.path.join(SUBTITLE_DIR, name))
        try:
            if os.path.commonpath([p, SUBTITLE_DIR]) != SUBTITLE_DIR:
                continue
        except ValueError:
            continue
        if os.path.exists(p):
            return p
    return None

def _iter_movie_subtitles(id: int):
    if not os.path.isdir(SUBTITLE_DIR):
        return []
    items = []
    for fname in os.listdir(SUBTITLE_DIR):
        lower = fname.lower()
        if lower.startswith(f"movie_{id}_") or lower.startswith(f"movie-{id}-") or lower.startswith(f"{id}_"):
            if lower.endswith(".srt"):
                # extract lang code between last separator and extension
                base = os.path.splitext(fname)[0]
                parts = base.split("_") if "_" in base else base.split("-")
                lang = parts[-1] if parts else ""
                items.append({"lang": _normalize_code(lang), "label": _lang_label(lang)})
    # dedupe by lang
    dedup = {}
    for it in items:
        dedup[it["lang"]] = it
    return list(dedup.values())

def _srt_to_vtt_text(srt_text: str) -> str:
    lines = srt_text.splitlines()
    out = ["WEBVTT", ""]
    for line in lines:
        stripped = line.strip()
        # skip pure index lines
        if stripped.isdigit():
            continue
        if "-->" in line and "," in line:
            # replace comma millis with dot
            line = line.replace(",", ".")
        out.append(line)
    return "\n".join(out) + "\n"


# 🔓 LISTAR FILMES (PÚBLICO)
@movies_bp.route("/", methods=["GET"])
def get_movies():
    movies = Movie.query.order_by(Movie.position.asc(), Movie.id.desc()).all()

    return jsonify([
        {
            "id": m.id,
            "title": m.title,
            "genre": m.genre,
            "year": m.year,
            "rating": m.rating,
            "duration": m.duration,
            "image": m.image,
            "description": m.description,
            "director": m.director,
            "cast": m.cast.split(",") if m.cast else [],
            "video_url": m.video_url,
            "video_url_ptbr": m.video_url_ptbr,
            "video_url_en": m.video_url_en,
            "subtitle_srt_ptbr": m.subtitle_srt_ptbr,
            "subtitle_srt_en": m.subtitle_srt_en,
            "position": m.position,
        }
        for m in movies
    ])

# 🔓 BUSCAR FILME POR ID (PÚBLICO)
@movies_bp.route("/<int:id>", methods=["GET"])
def get_movie(id):
    m = Movie.query.get_or_404(id)
    return jsonify({
        "id": m.id,
        "title": m.title,
        "genre": m.genre,
        "year": m.year,
        "rating": m.rating,
        "duration": m.duration,
        "image": m.image,
        "description": m.description,
        "director": m.director,
        "cast": m.cast.split(",") if m.cast else [],
        "video_url": m.video_url,
        "video_url_ptbr": m.video_url_ptbr,
        "video_url_en": m.video_url_en,
        "subtitle_srt_ptbr": m.subtitle_srt_ptbr,
        "subtitle_srt_en": m.subtitle_srt_en,
        "position": m.position,
    })


# 🔐 CRIAR FILME (ADMIN)
@movies_bp.route("/", methods=["POST"])
@jwt_required()
def create_movie():
    user_id = get_jwt_identity()  # ← string
    user = User.query.get(int(user_id))

    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    data = request.get_json() or {}

    max_pos = db.session.query(db.func.max(Movie.position)).scalar()
    new_pos = (max_pos if max_pos is not None else -1) + 1

    movie = Movie(
        title=data["title"],
        genre=data["genre"],
        year=data["year"],
        rating=data["rating"],
        duration=data["duration"],
        image=data["image"],
        description=data["description"],
        director=data["director"],
        cast=",".join(data["cast"]),
        video_url=data.get("video_url"),
        video_url_ptbr=data.get("video_url_ptbr"),
        video_url_en=data.get("video_url_en"),
        position=new_pos,
    )

    db.session.add(movie)
    db.session.commit()

    return jsonify({"message": "Filme cadastrado com sucesso"}), 201

# 🔐 ATUALIZAR FILME (ADMIN)
@movies_bp.route("/<int:id>", methods=["PUT"])
@jwt_required()
def update_movie(id):
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))

    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    movie = Movie.query.get_or_404(id)
    data = request.get_json() or {}

    if "title" in data:
        movie.title = data["title"]
    if "genre" in data:
        movie.genre = data["genre"]
    if "year" in data:
        movie.year = data["year"]
    if "rating" in data:
        movie.rating = data["rating"]
    if "duration" in data:
        movie.duration = data["duration"]
    if "image" in data:
        movie.image = data["image"]
    if "description" in data:
        movie.description = data["description"]
    if "director" in data:
        movie.director = data["director"]
    if "cast" in data:
        cast_val = data["cast"]
        if isinstance(cast_val, list):
            movie.cast = ",".join(cast_val)
        elif isinstance(cast_val, str):
            movie.cast = cast_val
    if "video_url" in data:
        movie.video_url = data["video_url"]
    if "video_url_ptbr" in data:
        movie.video_url_ptbr = data["video_url_ptbr"]
    if "video_url_en" in data:
        movie.video_url_en = data["video_url_en"]
    if "subtitle_srt_ptbr" in data:
        movie.subtitle_srt_ptbr = data["subtitle_srt_ptbr"]
    if "subtitle_srt_en" in data:
        movie.subtitle_srt_en = data["subtitle_srt_en"]
    if "position" in data:
        movie.position = data["position"]

    db.session.commit()

    return jsonify({"message": "Filme atualizado com sucesso"})


# 🔐 EXCLUIR FILME (ADMIN)
@movies_bp.route("/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_movie(id):
    user_id = get_jwt_identity()  # ← string
    user = User.query.get(int(user_id))

    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    movie = Movie.query.get_or_404(id)

    db.session.delete(movie)
    db.session.commit()

    return jsonify({"message": "Filme excluído com sucesso"})

# 🔐 REORDENAR FILMES (ADMIN)
@movies_bp.route("/reorder", methods=["POST"])
@jwt_required()
def reorder_movies():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    data = request.get_json() or {}
    ids = data.get("ids", [])

    if not isinstance(ids, list):
         return jsonify({"error": "Formato inválido"}), 400

    for index, movie_id in enumerate(ids):
        m = Movie.query.get(movie_id)
        if m:
            m.position = index
            
    db.session.commit()
    return jsonify({"message": "Ordem atualizada com sucesso"})

# 🔐 STREAM DE VÍDEO (USUÁRIO AUTENTICADO)
@movies_bp.route("/<int:id>/video", methods=["GET"])
@jwt_required()
def stream_movie_video(id):
    movie = Movie.query.get_or_404(id)
    selected_url = _select_movie_video_url(movie, request.args.get("lang"))
    if not selected_url:
        return jsonify({"error": "Vídeo não disponível"}), 404

    # Use the full relative path stored in DB, not just basename
    filename = selected_url

    base_dir = os.path.abspath(VIDEO_DIR)
    if not os.path.isdir(base_dir):
        return jsonify({"error": "Diretório de vídeos não encontrado"}), 404

    video_path = os.path.abspath(os.path.join(base_dir, filename))
    mimetype = _guess_mimetype(video_path)
    try:
        if os.path.commonpath([video_path, base_dir]) != base_dir:
            return jsonify({"error": "Caminho inválido"}), 400
    except ValueError:
        return jsonify({"error": "Caminho inválido"}), 400
    if not os.path.exists(video_path):
        return jsonify({"error": "Arquivo não encontrado"}), 404

    range_header = request.headers.get("Range", None)
    file_size = os.path.getsize(video_path)
    if range_header:
        try:
            _, range_value = range_header.split("=")
            start_str, end_str = range_value.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
            if start > end or end >= file_size:
                return jsonify({"error": "Intervalo inválido"}), 416

            chunk_size = (end - start) + 1
            with open(video_path, "rb") as f:
                f.seek(start)
                data = f.read(chunk_size)

            rv = Response(data, 206, mimetype=mimetype, direct_passthrough=True)
            rv.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            rv.headers["Accept-Ranges"] = "bytes"
            rv.headers["Content-Length"] = str(chunk_size)
            return rv
        except Exception:
            return jsonify({"error": "Falha ao processar Range"}), 400

    return send_file(video_path, mimetype=mimetype, conditional=True)


@movies_bp.route("/<int:id>/video/<path:subpath>", methods=["GET"])
@jwt_required()
def stream_movie_hls(id, subpath):
    movie = Movie.query.get_or_404(id)
    selected_url = _select_movie_video_url(movie, request.args.get("lang"))
    if not selected_url:
        return jsonify({"error": "Vídeo não disponível"}), 404

    # Determine base HLS directory from the main video URL
    base_hls_dir = os.path.dirname(selected_url)
    
    # Construct full path to the requested segment/playlist
    target_path = os.path.join(base_hls_dir, subpath)
    
    base_dir = os.path.abspath(VIDEO_DIR)
    video_path = os.path.abspath(os.path.join(base_dir, target_path))
    try:
        print("[HLS] movie", id, "selected_url=", selected_url, "subpath=", subpath, "target_path=", target_path, "resolved=", video_path)
    except Exception:
        pass
    
    try:
        if os.path.commonpath([video_path, base_dir]) != base_dir:
            return jsonify({"error": "Caminho inválido"}), 400
    except ValueError:
        return jsonify({"error": "Caminho inválido"}), 400

    if not os.path.exists(video_path):
        dir_part = os.path.dirname(selected_url)
        base_name = os.path.basename(dir_part) if dir_part else ""
        alt_base = os.path.join(dir_part, f"hls_{base_name}") if base_name else None
        alt_target = os.path.join(alt_base, subpath) if alt_base else None
        alt_video_path = os.path.abspath(os.path.join(base_dir, alt_target)) if alt_target else None
        if alt_video_path and os.path.exists(alt_video_path):
            video_path = alt_video_path
        elif subpath.lower().endswith(".m3u8") and alt_base:
            alt_master = os.path.abspath(os.path.join(base_dir, alt_base, "master.m3u8"))
            if os.path.exists(alt_master):
                video_path = alt_master
            else:
                try:
                    print("[HLS] not found:", video_path)
                except Exception:
                    pass
                return jsonify({"error": "Arquivo não encontrado"}), 404
        else:
            try:
                print("[HLS] not found:", video_path)
            except Exception:
                pass
            return jsonify({"error": "Arquivo não encontrado"}), 404

    if subpath.lower().endswith(".m3u8"):
        token = request.args.get("token", "")
        try:
            with open(video_path, "r", encoding="utf-8") as f:
                text = f.read()
        except UnicodeDecodeError:
            with open(video_path, "r", encoding="latin-1") as f:
                text = f.read()
        if token:
            out_lines = []
            for line in text.splitlines():
                raw = line.rstrip("\n")
                s = raw.strip()
                if s and not s.startswith("#") and "://" not in s:
                    if "?" in s:
                        s = f"{s}&token={quote(token)}"
                    else:
                        s = f"{s}?token={quote(token)}"
                    out_lines.append(s)
                else:
                    out_lines.append(raw)
            text = "\n".join(out_lines) + ("\n" if not text.endswith("\n") else "")
        return Response(text, mimetype=_guess_mimetype(video_path))
    else:
        mimetype = _guess_mimetype(video_path)
        return send_file(video_path, mimetype=mimetype, conditional=True)


# 🔐 LISTAR LEGENDAS DISPONÍVEIS (SRT em /videos/legendas)
@movies_bp.route("/<int:id>/subtitles", methods=["GET"])
@jwt_required()
def list_movie_subtitles(id):
    movie = Movie.query.get_or_404(id)
    tracks = []
    if movie.subtitle_srt_ptbr:
        p = os.path.abspath(os.path.join(SUBTITLE_DIR, movie.subtitle_srt_ptbr))
        try:
            if os.path.commonpath([p, SUBTITLE_DIR]) == SUBTITLE_DIR and os.path.exists(p):
                tracks.append({"id": "pt-BR", "lang": "pt-BR", "label": _lang_label("pt-BR")})
        except ValueError:
            pass
    if movie.subtitle_srt_en:
        p = os.path.abspath(os.path.join(SUBTITLE_DIR, movie.subtitle_srt_en))
        try:
            if os.path.commonpath([p, SUBTITLE_DIR]) == SUBTITLE_DIR and os.path.exists(p):
                tracks.append({"id": "en", "lang": "en", "label": _lang_label("en")})
        except ValueError:
            pass
    for it in _iter_movie_subtitles(id):
        # Update iter items to have id
        item = {"id": it["lang"], "lang": it["lang"], "label": it["label"]}
        if not any(t["id"] == item["id"] for t in tracks):
            tracks.append(item)
            
    # Legendas embutidas
    try:
        base_dir = os.path.abspath(VIDEO_DIR)
        sources = [
            ("default", movie.video_url),
            ("ptbr", movie.video_url_ptbr),
            ("en", movie.video_url_en)
        ]
        processed_paths = set()

        for source_key, url in sources:
            if not url:
                continue
            
            video_path = os.path.abspath(os.path.join(base_dir, url))
            if video_path in processed_paths:
                continue
                
            if os.path.exists(video_path) and not video_path.lower().endswith(".m3u8"):
                processed_paths.add(video_path)
                embedded = get_embedded_subtitles(video_path)
                for s in embedded:
                    id_code = f"embedded_{source_key}_{s['index']}"
                    label = f"{s['label']} (Embutida)"
                    tracks.append({"id": id_code, "lang": s["lang"], "label": label})
    except Exception as e:
        print(f"Erro ao buscar legendas embutidas filme {id}: {e}")

    return jsonify({"tracks": tracks})


# 🔐 SERVIR LEGENDAS CONVERTIDAS PARA VTT
@movies_bp.route("/<int:id>/subtitle/<lang>.vtt", methods=["GET"])
@jwt_required()
def serve_movie_subtitle_vtt(id, lang):
    # Verificar se é embutida
    if lang.startswith("embedded_"):
        try:
            parts = lang.split("_")
            if len(parts) < 3:
                return jsonify({"error": "ID inválido"}), 400
            
            source_key = parts[1]
            idx = int(parts[2])
            
            movie = Movie.query.get_or_404(id)
            target_url = None
            if source_key == "default":
                target_url = movie.video_url
            elif source_key == "ptbr":
                target_url = movie.video_url_ptbr
            elif source_key == "en":
                target_url = movie.video_url_en
            
            if not target_url:
                 return jsonify({"error": "Vídeo não encontrado"}), 404
            
            base_dir = os.path.abspath(VIDEO_DIR)
            video_path = os.path.abspath(os.path.join(base_dir, target_url))
            
            cache_name = f"movie_{id}_{source_key}_{idx}.vtt"
            cache_path = os.path.join(CACHE_DIR, cache_name)
            
            if not os.path.exists(cache_path):
                success = extract_subtitle_stream(video_path, idx, cache_path)
                if not success:
                    return jsonify({"error": "Falha na extração"}), 500
            
            return send_file(cache_path, mimetype="text/vtt")
        except Exception as e:
            print(f"Erro servindo legenda embutida: {e}")
            return jsonify({"error": "Erro interno"}), 500

    srt_path = _find_movie_srt(id, lang)
    if not srt_path:
        return jsonify({"error": "Legenda não encontrada"}), 404
    try:
        with open(srt_path, "r", encoding="utf-8") as f:
            srt_text = f.read()
    except UnicodeDecodeError:
        with open(srt_path, "r", encoding="latin-1") as f:
            srt_text = f.read()
    vtt_text = _srt_to_vtt_text(srt_text)
    return Response(vtt_text, mimetype="text/vtt")


# 🔐 SERVIR THUMBNAIL (PREVIEW NA BARRA DE PROGRESSO)
@movies_bp.route("/<int:id>/thumbnail", methods=["GET"])
@jwt_required()
def serve_movie_thumbnail(id):
    movie = Movie.query.get_or_404(id)
    time_sec = request.args.get("time")
    
    if not time_sec:
        return jsonify({"error": "Parâmetro time obrigatório"}), 400

    # Usar o vídeo principal ou baseado na linguagem se preferir
    # Para thumbnail, o vídeo padrão serve bem
    selected_url = _select_movie_video_url(movie, request.args.get("lang"))
    if not selected_url:
        return jsonify({"error": "Vídeo não disponível"}), 404

    base_dir = os.path.abspath(VIDEO_DIR)
    video_path = os.path.abspath(os.path.join(base_dir, selected_url))
    
    if not os.path.exists(video_path):
        return jsonify({"error": "Arquivo de vídeo não encontrado"}), 404
        
    thumb_path = generate_thumbnail(video_path, time_sec)
    if not thumb_path:
        return jsonify({"error": "Erro ao gerar thumbnail"}), 500
        
    return send_file(thumb_path, mimetype="image/jpeg")
