from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db
from models.progress import PlaybackProgress


progress_bp = Blueprint("progress", __name__)


def _get_user_id():
    user_id = get_jwt_identity()
    return int(user_id)


def _normalize_position(position_seconds, duration_seconds):
    try:
        pos = float(position_seconds or 0)
    except Exception:
        pos = 0.0
    try:
        dur = float(duration_seconds) if duration_seconds is not None else None
    except Exception:
        dur = None

    if pos < 0:
        pos = 0.0
    if dur is not None and dur > 0 and pos > max(0.0, dur - 10.0):
        pos = 0.0
    return pos, dur


def _get_or_create(user_id, content_type, content_id, series_id):
    existing = PlaybackProgress.query.filter_by(
        user_id=user_id,
        content_type=content_type,
        content_id=content_id,
        series_id=series_id,
    ).first()
    if existing:
        return existing
    created = PlaybackProgress(
        user_id=user_id,
        content_type=content_type,
        content_id=content_id,
        series_id=series_id,
        position_seconds=0,
    )
    db.session.add(created)
    return created


@progress_bp.route("/movie/<int:movie_id>", methods=["GET"])
@jwt_required()
def get_movie_progress(movie_id):
    user_id = _get_user_id()
    p = PlaybackProgress.query.filter_by(
        user_id=user_id, content_type="movie", content_id=movie_id, series_id=None
    ).first()
    return jsonify(
        {
            "position_seconds": float(p.position_seconds) if p else 0.0,
            "duration_seconds": float(p.duration_seconds) if p and p.duration_seconds is not None else None,
        }
    )


@progress_bp.route("/movie/<int:movie_id>", methods=["PUT"])
@jwt_required()
def upsert_movie_progress(movie_id):
    user_id = _get_user_id()
    data = request.get_json() or {}
    position_seconds, duration_seconds = _normalize_position(
        data.get("position_seconds"), data.get("duration_seconds")
    )

    p = _get_or_create(user_id, "movie", movie_id, None)
    p.position_seconds = position_seconds
    p.duration_seconds = duration_seconds
    db.session.commit()
    return jsonify({"message": "ok"})


@progress_bp.route("/series/<int:series_id>/episodes/<int:episode_id>", methods=["GET"])
@jwt_required()
def get_episode_progress(series_id, episode_id):
    user_id = _get_user_id()
    p = PlaybackProgress.query.filter_by(
        user_id=user_id, content_type="episode", content_id=episode_id, series_id=series_id
    ).first()
    return jsonify(
        {
            "position_seconds": float(p.position_seconds) if p else 0.0,
            "duration_seconds": float(p.duration_seconds) if p and p.duration_seconds is not None else None,
        }
    )


@progress_bp.route("/series/<int:series_id>/episodes/<int:episode_id>", methods=["PUT"])
@jwt_required()
def upsert_episode_progress(series_id, episode_id):
    user_id = _get_user_id()
    data = request.get_json() or {}
    position_seconds, duration_seconds = _normalize_position(
        data.get("position_seconds"), data.get("duration_seconds")
    )

    p = _get_or_create(user_id, "episode", episode_id, series_id)
    p.position_seconds = position_seconds
    p.duration_seconds = duration_seconds
    db.session.commit()
    return jsonify({"message": "ok"})


@progress_bp.route("/series/<int:series_id>/last_watched", methods=["GET"])
@jwt_required()
def get_last_watched_episode(series_id):
    user_id = _get_user_id()
    last_prog = PlaybackProgress.query.filter_by(
        user_id=user_id,
        content_type="episode",
        series_id=series_id
    ).order_by(PlaybackProgress.updated_at.desc()).first()

    if not last_prog:
        return jsonify(None)

    return jsonify({
        "episode_id": last_prog.content_id,
        "position_seconds": float(last_prog.position_seconds),
        "duration_seconds": float(last_prog.duration_seconds) if last_prog.duration_seconds else None,
        "updated_at": last_prog.updated_at.isoformat()
    })

