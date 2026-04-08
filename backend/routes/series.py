from flask import Blueprint, jsonify, request, Response, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.series import Series
from models.episode import Episode
from models.user import User
from database import db
from utils.media import get_embedded_subtitles, extract_subtitle_stream, generate_thumbnail
import os
import mimetypes
from typing import Optional
from urllib.parse import quote

series_bp = Blueprint("series", __name__)

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


def _select_episode_video_url(episode: Episode, lang: Optional[str]) -> Optional[str]:
    l = _normalize_lang(lang)
    if l:
        if l in ("pt", "pt-br", "ptbr", "portuguese", "portugues"):
            return episode.video_url_ptbr or episode.video_url
        if l in ("en", "en-us", "enus", "english"):
            return episode.video_url_en or episode.video_url
    return episode.video_url

def _lang_label(l: str) -> str:
    v = (l or "").strip().lower()
    if v in ("pt", "pt-br", "ptbr", "portuguese", "portugues"):
        return "Português (Brasil)"
    if v in ("en", "en-us", "enus", "english"):
        return "Inglês"
    return l

def _normalize_code(l: str) -> str:
    return (l or "").strip().replace("_", "-")

def _find_episode_srt(series_id: int, episode_id: int, lang: str) -> Optional[str]:
    code = _normalize_code(lang)
    candidates = [
        f"episode_{series_id}_{episode_id}_{code}.srt",
        f"episode-{series_id}-{episode_id}-{code}.srt",
        f"{series_id}_{episode_id}_{code}.srt",
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

def _iter_episode_subtitles(series_id: int, episode_id: int):
    if not os.path.isdir(SUBTITLE_DIR):
        return []
    items = []
    for fname in os.listdir(SUBTITLE_DIR):
        lower = fname.lower()
        if lower.startswith(f"episode_{series_id}_{episode_id}_") or lower.startswith(f"episode-{series_id}-{episode_id}-") or lower.startswith(f"{series_id}_{episode_id}_"):
            if lower.endswith(".srt"):
                base = os.path.splitext(fname)[0]
                parts = base.split("_") if "_" in base else base.split("-")
                lang = parts[-1] if parts else ""
                items.append({"lang": _normalize_code(lang), "label": _lang_label(lang)})
    dedup = {}
    for it in items:
        dedup[it["lang"]] = it
    return list(dedup.values())

def _srt_to_vtt_text(srt_text: str) -> str:
    lines = srt_text.splitlines()
    out = ["WEBVTT", ""]
    for line in lines:
        stripped = line.strip()
        if stripped.isdigit():
            continue
        if "-->" in line and "," in line:
            line = line.replace(",", ".")
        out.append(line)
    return "\n".join(out) + "\n"


@series_bp.route("/", methods=["GET"])
def get_series():
    series_list = Series.query.order_by(Series.position, Series.id).all()
    return jsonify([
        {
            "id": s.id,
            "title": s.title,
            "genre": s.genre,
            "year": s.year,
            "rating": s.rating,
            "image": s.image,
            "description": s.description,
            "creator": s.creator,
            "cast": s.cast.split(",") if s.cast else [],
            "episodes_count": len(s.episodes),
            "seasons_count": len(set([e.season for e in s.episodes])) if s.episodes else 0,
            "position": s.position,
        }
        for s in series_list
    ])


@series_bp.route("/<int:id>", methods=["GET"])
def get_single_series(id):
    s = Series.query.get_or_404(id)
    return jsonify({
        "id": s.id,
        "title": s.title,
        "genre": s.genre,
        "year": s.year,
        "rating": s.rating,
        "image": s.image,
        "description": s.description,
        "creator": s.creator,
        "cast": s.cast.split(",") if s.cast else [],
        "episodes": [
            {
                "id": e.id,
                "series_id": e.series_id,
                "season": e.season,
                "episode_number": e.episode_number,
                "title": e.title,
                "duration": e.duration,
                "video_url": e.video_url,
                "video_url_ptbr": e.video_url_ptbr,
                "video_url_en": e.video_url_en,
                "credits_start_time": e.credits_start_time,
                "subtitle_srt_ptbr": e.subtitle_srt_ptbr,
                "subtitle_srt_en": e.subtitle_srt_en,
            }
            for e in s.episodes
        ],
    })


@series_bp.route("/", methods=["POST"])
@jwt_required()
def create_series():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    data = request.get_json() or {}

    current_max = Series.query.order_by(Series.position.desc()).first()
    next_position = (current_max.position + 1) if current_max else 0

    series = Series(
        title=data["title"],
        genre=data.get("genre", ""),
        year=data.get("year", 0),
        rating=data.get("rating", 0),
        image=data.get("image", ""),
        description=data.get("description", ""),
        creator=data.get("creator", ""),
        cast=",".join(data.get("cast", [])),
        position=next_position,
    )
    db.session.add(series)
    db.session.commit()
    return jsonify({"id": series.id, "message": "Série cadastrada com sucesso"}), 201


@series_bp.route("/<int:id>", methods=["PUT"])
@jwt_required()
def update_series(id):
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    series = Series.query.get_or_404(id)
    data = request.get_json() or {}

    if "title" in data:
        series.title = data["title"]
    if "genre" in data:
        series.genre = data["genre"]
    if "year" in data:
        series.year = data["year"]
    if "rating" in data:
        series.rating = data["rating"]
    if "image" in data:
        series.image = data["image"]
    if "description" in data:
        series.description = data["description"]
    if "creator" in data:
        series.creator = data["creator"]
    if "cast" in data:
        cast_val = data["cast"]
        if isinstance(cast_val, list):
            series.cast = ",".join(cast_val)
        elif isinstance(cast_val, str):
            series.cast = cast_val

    db.session.commit()
    return jsonify({"message": "Série atualizada com sucesso"})


@series_bp.route("/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_series(id):
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    series = Series.query.get_or_404(id)
    db.session.delete(series)
    db.session.commit()
    return jsonify({"message": "Série excluída com sucesso"})


@series_bp.route("/reorder", methods=["POST"])
@jwt_required()
def reorder_series():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    data = request.get_json() or {}
    ids = data.get("ids", [])

    if not isinstance(ids, list):
        return jsonify({"error": "Formato inválido"}), 400

    for index, series_id in enumerate(ids):
        s = Series.query.get(series_id)
        if s:
            s.position = index

    db.session.commit()
    return jsonify({"message": "Ordem atualizada com sucesso"})


@series_bp.route("/<int:series_id>/episodes", methods=["POST"])
@jwt_required()
def create_episode(series_id):
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    series = Series.query.get_or_404(series_id)
    data = request.get_json() or {}

    episode = Episode(
        series_id=series.id,
        season=data.get("season", 1),
        episode_number=data.get("episode_number", 1),
        title=data["title"],
        duration=data.get("duration", ""),
        video_url=data.get("video_url"),
        video_url_ptbr=data.get("video_url_ptbr"),
        video_url_en=data.get("video_url_en"),
        credits_start_time=data.get("credits_start_time"),
        subtitle_srt_ptbr=data.get("subtitle_srt_ptbr"),
        subtitle_srt_en=data.get("subtitle_srt_en"),
    )
    db.session.add(episode)
    db.session.commit()
    return jsonify({"id": episode.id, "message": "Episódio cadastrado com sucesso"}), 201


@series_bp.route("/<int:series_id>/episodes/<int:episode_id>", methods=["PUT"])
@jwt_required()
def update_episode(series_id, episode_id):
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    series = Series.query.get_or_404(series_id)
    episode = Episode.query.get_or_404(episode_id)
    if episode.series_id != series.id:
        return jsonify({"error": "Episódio não pertence à série"}), 400

    data = request.get_json() or {}
    if "season" in data:
        episode.season = data["season"]
    if "episode_number" in data:
        episode.episode_number = data["episode_number"]
    if "title" in data:
        episode.title = data["title"]
    if "duration" in data:
        episode.duration = data["duration"]
    if "video_url" in data:
        episode.video_url = data["video_url"]
    if "video_url_ptbr" in data:
        episode.video_url_ptbr = data["video_url_ptbr"]
    if "video_url_en" in data:
        episode.video_url_en = data["video_url_en"]
    if "credits_start_time" in data:
        episode.credits_start_time = data["credits_start_time"]
    if "subtitle_srt_ptbr" in data:
        episode.subtitle_srt_ptbr = data["subtitle_srt_ptbr"]
    if "subtitle_srt_en" in data:
        episode.subtitle_srt_en = data["subtitle_srt_en"]

    db.session.commit()
    return jsonify({"message": "Episódio atualizado com sucesso"})


@series_bp.route("/<int:series_id>/episodes/<int:episode_id>", methods=["DELETE"])
@jwt_required()
def delete_episode(series_id, episode_id):
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    series = Series.query.get_or_404(series_id)
    episode = Episode.query.get_or_404(episode_id)
    if episode.series_id != series.id:
        return jsonify({"error": "Episódio não pertence à série"}), 400

    db.session.delete(episode)
    db.session.commit()
    return jsonify({"message": "Episódio excluído com sucesso"})


@series_bp.route("/<int:series_id>/episodes/<int:episode_id>/video", methods=["GET"])
@jwt_required()
def stream_episode_video(series_id, episode_id):
    series = Series.query.get_or_404(series_id)
    episode = Episode.query.get_or_404(episode_id)
    if episode.series_id != series.id:
        return jsonify({"error": "Episódio não pertence à série"}), 400

    selected_url = _select_episode_video_url(episode, request.args.get("lang"))
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


@series_bp.route("/<int:series_id>/episodes/<int:episode_id>/video/<path:subpath>", methods=["GET"])
@jwt_required()
def stream_episode_hls(series_id, episode_id, subpath):
    series = Series.query.get_or_404(series_id)
    episode = Episode.query.get_or_404(episode_id)
    if episode.series_id != series.id:
        return jsonify({"error": "Episódio não pertence à série"}), 400

    selected_url = _select_episode_video_url(episode, request.args.get("lang"))
    if not selected_url:
        return jsonify({"error": "Vídeo não disponível"}), 404

    # Determine base HLS directory from the main video URL
    # If video_url is "hls_movie/master.m3u8", base is "hls_movie"
    base_hls_dir = os.path.dirname(selected_url)
    
    # Construct full path to the requested segment/playlist
    target_path = os.path.join(base_hls_dir, subpath)
    
    base_dir = os.path.abspath(VIDEO_DIR)
    video_path = os.path.abspath(os.path.join(base_dir, target_path))
    
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
                return jsonify({"error": "Arquivo não encontrado"}), 404
        else:
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
@series_bp.route("/<int:series_id>/episodes/<int:episode_id>/subtitles", methods=["GET"])
@jwt_required()
def list_episode_subtitles(series_id, episode_id):
    ep = Episode.query.get_or_404(episode_id)
    if ep.series_id != series_id:
        return jsonify({"error": "Episódio não pertence à série"}), 400
    tracks = []
    if ep.subtitle_srt_ptbr:
        p = os.path.abspath(os.path.join(SUBTITLE_DIR, ep.subtitle_srt_ptbr))
        try:
            if os.path.commonpath([p, SUBTITLE_DIR]) == SUBTITLE_DIR and os.path.exists(p):
                tracks.append({"id": "pt-BR", "lang": "pt-BR", "label": _lang_label("pt-BR")})
        except ValueError:
            pass
    if ep.subtitle_srt_en:
        p = os.path.abspath(os.path.join(SUBTITLE_DIR, ep.subtitle_srt_en))
        try:
            if os.path.commonpath([p, SUBTITLE_DIR]) == SUBTITLE_DIR and os.path.exists(p):
                tracks.append({"id": "en", "lang": "en", "label": _lang_label("en")})
        except ValueError:
            pass
    for it in _iter_episode_subtitles(series_id, episode_id):
        item = {"id": it["lang"], "lang": it["lang"], "label": it["label"]}
        if not any(t["id"] == item["id"] for t in tracks):
            tracks.append(item)
            
    # Legendas embutidas
    try:
        base_dir = os.path.abspath(VIDEO_DIR)
        sources = [
            ("default", ep.video_url),
            ("ptbr", ep.video_url_ptbr),
            ("en", ep.video_url_en)
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
        print(f"Erro ao buscar legendas embutidas episódio {episode_id}: {e}")
        
    return jsonify({"tracks": tracks})


# 🔐 SERVIR LEGENDAS CONVERTIDAS PARA VTT
@series_bp.route("/<int:series_id>/episodes/<int:episode_id>/subtitle/<lang>.vtt", methods=["GET"])
@jwt_required()
def serve_episode_subtitle_vtt(series_id, episode_id, lang):
    # Verificar se é embutida
    if lang.startswith("embedded_"):
        try:
            parts = lang.split("_")
            if len(parts) < 3:
                return jsonify({"error": "ID inválido"}), 400
            
            source_key = parts[1]
            idx = int(parts[2])

            ep = Episode.query.get_or_404(episode_id)
            target_url = None
            if source_key == "default":
                target_url = ep.video_url
            elif source_key == "ptbr":
                target_url = ep.video_url_ptbr
            elif source_key == "en":
                target_url = ep.video_url_en
            
            if not target_url:
                 return jsonify({"error": "Vídeo não encontrado"}), 404
            
            base_dir = os.path.abspath(VIDEO_DIR)
            video_path = os.path.abspath(os.path.join(base_dir, target_url))
            
            cache_name = f"episode_{episode_id}_{source_key}_{idx}.vtt"
            cache_path = os.path.join(CACHE_DIR, cache_name)
            
            if not os.path.exists(cache_path):
                success = extract_subtitle_stream(video_path, idx, cache_path)
                if not success:
                    return jsonify({"error": "Falha na extração"}), 500
            
            return send_file(cache_path, mimetype="text/vtt")
        except Exception as e:
            print(f"Erro servindo legenda embutida: {e}")
            return jsonify({"error": "Erro interno"}), 500

    srt_path = _find_episode_srt(series_id, episode_id, lang)
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
@series_bp.route("/<int:series_id>/episodes/<int:episode_id>/thumbnail", methods=["GET"])
@jwt_required()
def serve_episode_thumbnail(series_id, episode_id):
    ep = Episode.query.get_or_404(episode_id)
    if ep.series_id != series_id:
        return jsonify({"error": "Episódio não pertence à série"}), 400

    time_sec = request.args.get("time")
    
    if not time_sec:
        return jsonify({"error": "Parâmetro time obrigatório"}), 400

    selected_url = _select_episode_video_url(ep, request.args.get("lang"))
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
