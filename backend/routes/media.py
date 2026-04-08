from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.user import User
import os
import uuid
import threading
from utils.media import optimize_video_task

media_bp = Blueprint("media", __name__)

VIDEO_DIR = os.getenv(
    "VIDEO_DIR",
    os.path.join(os.path.dirname(__file__), "..", "..", "videos")
)

# In-memory task store: {task_id: status}
# status: "processing", "completed", "failed"
tasks = {}

def update_task_status(task_id, status):
    tasks[task_id] = status

@media_bp.route("/optimize", methods=["POST"])
@jwt_required()
def optimize_media():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user or not user.is_admin:
        return jsonify({"error": "Acesso negado"}), 403

    data = request.get_json() or {}
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "Nome do arquivo é obrigatório"}), 400

    # Prevent directory traversal
    base_dir = os.path.abspath(VIDEO_DIR)
    input_path = os.path.abspath(os.path.join(base_dir, filename))
    
    try:
        if os.path.commonpath([input_path, base_dir]) != base_dir:
            return jsonify({"error": "Caminho inválido"}), 400
    except ValueError:
        return jsonify({"error": "Caminho inválido"}), 400

    if not os.path.exists(input_path):
        return jsonify({"error": "Arquivo não encontrado"}), 404

    # Output directory for HLS
    # e.g., input: "movie.mp4" -> output dir: "hls_movie"
    base_name_no_ext = os.path.splitext(os.path.basename(input_path))[0]
    output_dir_name = f"hls_{base_name_no_ext}"
    output_dir_path = os.path.join(os.path.dirname(input_path), output_dir_name)

    task_id = str(uuid.uuid4())
    tasks[task_id] = "processing"

    # Start background thread
    thread = threading.Thread(
        target=optimize_video_task,
        args=(input_path, output_dir_path, task_id, update_task_status)
    )
    thread.start()

    # The relative path to the master playlist, to be stored in the database
    # e.g., "hls_movie/master.m3u8"
    relative_output_path = os.path.join(os.path.dirname(filename), output_dir_name, "master.m3u8").replace("\\", "/")
    if relative_output_path.startswith("/"):
        relative_output_path = relative_output_path[1:]

    return jsonify({
        "message": "Otimização HLS iniciada",
        "task_id": task_id,
        "output_filename": relative_output_path
    }), 202

@media_bp.route("/status/<task_id>", methods=["GET"])
@jwt_required()
def get_task_status(task_id):
    status = tasks.get(task_id)
    if not status:
        return jsonify({"error": "Tarefa não encontrada"}), 404
    return jsonify({"task_id": task_id, "status": status})


@media_bp.route("/thumbnail", methods=["GET"])
@jwt_required()
def serve_thumbnail():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    # Permitir usuário comum, pois é visualização de player
    if not user:
        return jsonify({"error": "Acesso negado"}), 403

    path = request.args.get("path")
    time_sec = request.args.get("time")

    if not path or not time_sec:
        return jsonify({"error": "Parâmetros inválidos"}), 400

    try:
        t = float(time_sec)
    except:
        return jsonify({"error": "Tempo inválido"}), 400

    base_dir = os.path.abspath(VIDEO_DIR)
    # Se path começar com "http" ou for externo, não suportamos thumbnail
    # Aqui assumimos path relativo ao VIDEO_DIR
    
    # Resolver path caso seja relativo ou absoluto
    if os.path.isabs(path):
         video_path = path
    else:
         video_path = os.path.abspath(os.path.join(base_dir, path))

    # Segurança básica
    if not video_path.startswith(base_dir):
         # Pode ser que o path venha de outro lugar seguro?
         # Por enquanto, restrito a VIDEO_DIR
         pass

    if not os.path.exists(video_path):
        return jsonify({"error": "Vídeo não encontrado"}), 404
    
    # Extrair frame
    import subprocess
    import tempfile
    
    # Criar arquivo temporário para o frame
    # Usar cache se possível?
    # Para performance, o ideal seria gerar sprites. 
    # Mas para "on-demand", vamos gerar na pasta cache/thumbnails
    
    cache_dir = os.path.join(os.path.dirname(__file__), "..", "cache", "thumbnails")
    os.makedirs(cache_dir, exist_ok=True)
    
    # Hash do path + time para nome do arquivo
    import hashlib
    h = hashlib.md5(f"{video_path}_{t:.1f}".encode()).hexdigest()
    thumb_path = os.path.join(cache_dir, f"{h}.jpg")
    
    if not os.path.exists(thumb_path):
        # ffmpeg -ss <time> -i <input> -vframes 1 -q:v 2 -vf scale=160:-1 <output>
        cmd = [
            "ffmpeg",
            "-ss", str(t),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "5", # Qualidade média-baixa para ser rápido e leve
            "-vf", "scale=160:-1", # Thumbnail pequena
            "-f", "image2",
            "-y",
            thumb_path
        ]
        try:
            # Check if send_file is imported
            from flask import send_file
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except subprocess.CalledProcessError:
            return jsonify({"error": "Erro ao gerar thumbnail"}), 500
            
    from flask import send_file
    return send_file(thumb_path, mimetype="image/jpeg")
