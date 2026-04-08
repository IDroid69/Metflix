import os
import subprocess
import json
import shutil

def get_video_metadata(file_path):
    """
    Recupera metadados do vídeo usando ffprobe.
    Retorna um dicionário com largura, altura, duração e fps.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        
        info = {
            "width": 0,
            "height": 0,
            "fps": 30.0,
            "duration": 0.0,
            "audio_codec": ""
        }
        
        if "format" in data:
            info["duration"] = float(data["format"].get("duration", 0))

        if "streams" in data:
            for stream in data["streams"]:
                if stream["codec_type"] == "video":
                    info["width"] = int(stream.get("width", 0))
                    info["height"] = int(stream.get("height", 0))
                    
                    # Calcular FPS
                    r_frame_rate = stream.get("r_frame_rate", "30/1")
                    if "/" in r_frame_rate:
                        num, den = r_frame_rate.split("/")
                        if float(den) > 0:
                            info["fps"] = float(num) / float(den)
                    else:
                        info["fps"] = float(r_frame_rate)
                    break
                if stream["codec_type"] == "audio" and not info["audio_codec"]:
                    info["audio_codec"] = str(stream.get("codec_name", "") or "")
        
        return info
    except Exception as e:
        print(f"Erro ao ler metadados: {e}")
        return None

def get_embedded_subtitles(file_path):
    """
    Lista legendas embutidas no arquivo de vídeo.
    Retorna lista de dicts com index, language, title.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-select_streams", "s",
        file_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        subtitles = []
        if "streams" in data:
            for stream in data["streams"]:
                tags = stream.get("tags", {})
                lang = tags.get("language", "und")
                title = tags.get("title", tags.get("handler_name", f"Track {stream['index']}"))
                subtitles.append({
                    "index": stream["index"],
                    "lang": lang,
                    "label": title,
                    "codec": stream.get("codec_name")
                })
        return subtitles
    except Exception as e:
        print(f"Erro ao listar legendas embutidas: {e}")
        return []

def extract_subtitle_stream(input_path, stream_index, output_path):
    """
    Extrai uma stream de legenda para arquivo VTT.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-map", f"0:{stream_index}",
        "-f", "webvtt",
        output_path
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Erro ao extrair legenda: {e}")
        return False

def optimize_video_task(input_path, output_dir, task_id, progress_callback=None):
    """
    Gera HLS multi-bitrate (1080p, 720p, etc) com base na resolução de entrada.
    - Detecta FPS para configurar GOP corretamente (2 segundos).
    - Gera master.m3u8 e playlists de variantes.
    """
    
    print(f"[{task_id}] Iniciando análise: {input_path}")
    
    # 1. Obter metadados
    metadata = get_video_metadata(input_path)
    if not metadata:
        if progress_callback: progress_callback(task_id, "failed")
        return

    width = metadata["width"]
    fps = metadata["fps"]
    gop_size = int(fps * 2) # GOP de 2 segundos
    
    # Preparar diretório de saída
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    
    # Definir variantes baseadas na resolução original
    # Formato: (nome, largura, altura, bitrate_video, maxrate, bufsize, bitrate_audio)
    variants = []
    
    # 1080p
    if width >= 1920:
        variants.append(("v1080p", 1920, 1080, "4500k", "5000k", "10000k", "128k"))
    
    # 720p
    if width >= 1280:
        variants.append(("v720p", 1280, 720, "2500k", "3000k", "6000k", "128k"))
        
    # 480p (Sempre gerar como fallback)
    variants.append(("v480p", 854, 480, "1000k", "1200k", "2400k", "96k"))

    print(f"[{task_id}] FPS detectado: {fps}. GOP: {gop_size}. Variantes: {[v[0] for v in variants]}")

    cmd = ["ffmpeg", "-y", "-threads", "0"]
    def detect_gpu_encoder():
        try:
            r = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
            out = (r.stdout or "") + (r.stderr or "")
            if "h264_nvenc" in out:
                return "h264_nvenc"
            if "h264_qsv" in out:
                return "h264_qsv"
            if "h264_amf" in out:
                return "h264_amf"
        except Exception:
            pass
        return None
    gpu_encoder = detect_gpu_encoder()
    cmd.extend(["-i", input_path])
    
    # Filtros complexos para split e scale
    filter_complex = []
    map_args = []
    var_stream_map = []
    
    # Split input video into N streams
    filter_complex.append(f"[0:v]split={len(variants)}" + "".join([f"[v{i}_in]" for i in range(len(variants))]))
    
    for i, (name, w, h, vb, maxrate, bufsize, ab) in enumerate(variants):
        filter_complex.append(
            f"[v{i}_in]scale=w={w}:h={h}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=yuv420p[v{i}_out]"
        )
        
        if gpu_encoder:
            enc = gpu_encoder
            preset_value = "p7" if enc == "h264_nvenc" else "medium"
            args = [
                "-map", f"[v{i}_out]",
                f"-c:v:{i}", enc,
                f"-b:v:{i}", vb,
                f"-maxrate:v:{i}", maxrate,
                f"-bufsize:v:{i}", bufsize,
                f"-g:v:{i}", str(gop_size),
                "-preset", preset_value,
                f"-pix_fmt:v:{i}", "yuv420p",
            ]
            if enc == "h264_nvenc":
                args.extend(["-rc:v", "vbr"])
            map_args.extend(args)
        else:
            map_args.extend([
                "-map", f"[v{i}_out]",
                f"-c:v:{i}", "libx264",
                f"-b:v:{i}", vb,
                f"-maxrate:v:{i}", maxrate,
                f"-bufsize:v:{i}", bufsize,
                f"-g:v:{i}", str(gop_size),
                f"-keyint_min:v:{i}", str(gop_size),
                f"-sc_threshold:v:{i}", "0",
                "-preset", "veryfast",
                f"-pix_fmt:v:{i}", "yuv420p",
            ])
        
        if (metadata.get("audio_codec") or "").lower() == "aac":
            map_args.extend([
                "-map", "a:0",
                f"-c:a:{i}", "copy",
            ])
        else:
            map_args.extend([
                "-map", "a:0",
                f"-c:a:{i}", "aac",
                f"-b:a:{i}", ab,
            ])
        
        # Stream mapping string for HLS
        var_stream_map.append(f"v:{i},a:{i}")

    cmd.extend(["-filter_complex", ";".join(filter_complex)])
    cmd.extend(map_args)
    
    # HLS output options
    cmd.extend([
        "-f", "hls",
        "-hls_time", "4",
        "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments",
        "-master_pl_name", "master.m3u8",
        "-hls_segment_filename", f"{output_dir}/%v/data%03d.ts", # %v será substituído pelo index do stream map (0, 1, 2...)
        "-var_stream_map", " ".join(var_stream_map),
        f"{output_dir}/%v/playlist.m3u8"
    ])
    
    # FFmpeg exige que os diretórios dos segmentos existam se usar %v no path?
    # Testes mostram que o FFmpeg cria diretórios se usar %v? Não, geralmente falha se o diretório pai não existir.
    # Mas com HLS e %v, ele tenta criar arquivos tipo "output_dir/0/playlist.m3u8".
    # Vamos pré-criar os diretórios para garantir.
    for i in range(len(variants)):
        os.makedirs(os.path.join(output_dir, str(i)), exist_ok=True)
        # O padrão %v do ffmpeg substitui por 0, 1, 2...
    
    # Nota: %v no output path é uma feature do hls muxer.
    # Se usarmos var_stream_map, ele usa o agrupamento definido.
    # Ex: "v:0,a:0 v:1,a:1" -> gera 2 grupos. O primeiro é 0, o segundo é 1.
    
    print(f"[{task_id}] Executando FFmpeg...")
    # print(" ".join(cmd)) 
    
    try:
        subprocess.run(cmd, check=True)
        print(f"[{task_id}] HLS gerado com sucesso em {output_dir}")
        
        # Opcional: Renomear pastas 0, 1, 2 para nomes mais amigáveis e atualizar master.m3u8?
        # Por enquanto vamos deixar padrão (0, 1, 2).
        
        if progress_callback:
            progress_callback(task_id, "completed")
            
    except subprocess.CalledProcessError as e:
        print(f"[{task_id}] Erro no FFmpeg: {e}")
        if progress_callback:
            progress_callback(task_id, "failed")
    except Exception as e:
        print(f"[{task_id}] Erro inesperado: {e}")
        if progress_callback:
            progress_callback(task_id, "failed")

def generate_thumbnail(video_path, time_sec):
    """
    Gera thumbnail para um vídeo em um tempo específico.
    Retorna o caminho do arquivo de imagem gerado ou None em caso de erro.
    """
    try:
        t = float(time_sec)
    except (ValueError, TypeError):
        return None

    if not os.path.exists(video_path):
        return None

    # Cache directory relative to this file
    cache_dir = os.path.join(os.path.dirname(__file__), "..", "cache", "thumbnails")
    os.makedirs(cache_dir, exist_ok=True)

    # Hash for filename
    import hashlib
    h = hashlib.md5(f"{video_path}_{t:.1f}".encode()).hexdigest()
    thumb_path = os.path.join(cache_dir, f"{h}.jpg")

    if os.path.exists(thumb_path):
        return thumb_path

    # Generate with ffmpeg
    cmd = [
        "ffmpeg",
        "-ss", str(t),
        "-i", video_path,
        "-vframes", "1",
        "-q:v", "5",
        "-vf", "scale=160:-1",
        "-f", "image2",
        "-y",
        thumb_path
    ]
    
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return thumb_path
    except subprocess.CalledProcessError:
        return None
