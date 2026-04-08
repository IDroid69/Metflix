from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db
from models.profile import Profile


profiles_bp = Blueprint("profiles", __name__)


def _get_user_id():
    user_id = get_jwt_identity()
    return int(user_id)


@profiles_bp.route("/", methods=["GET"])
@jwt_required()
def list_profiles():
    user_id = _get_user_id()
    items = Profile.query.filter_by(user_id=user_id).order_by(Profile.id.asc()).all()
    return jsonify([p.to_dict() for p in items])


@profiles_bp.route("/", methods=["POST"])
@jwt_required()
def create_profile():
    user_id = _get_user_id()
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    avatar_url = data.get("avatar_url")
    is_kids = bool(data.get("is_kids"))

    if not name:
        return jsonify({"error": "Nome é obrigatório"}), 400

    count = Profile.query.filter_by(user_id=user_id).count()
    if count >= 4:
        return jsonify({"error": "Limite de 4 perfis por conta atingido"}), 409

    existing_name = Profile.query.filter_by(user_id=user_id, name=name).first()
    if existing_name:
        return jsonify({"error": "Já existe um perfil com esse nome"}), 409

    p = Profile(user_id=user_id, name=name, avatar_url=avatar_url, is_kids=is_kids)
    db.session.add(p)
    db.session.commit()
    return jsonify(p.to_dict()), 201


@profiles_bp.route("/<int:profile_id>", methods=["PUT"])
@jwt_required()
def update_profile(profile_id):
    user_id = _get_user_id()
    p = Profile.query.filter_by(id=profile_id, user_id=user_id).first_or_404()
    data = request.get_json() or {}
    name = data.get("name")
    avatar_url = data.get("avatar_url")
    is_kids = data.get("is_kids")

    if name is not None:
        name = name.strip()
        if not name:
            return jsonify({"error": "Nome não pode ser vazio"}), 400
        other = Profile.query.filter_by(user_id=user_id, name=name).filter(Profile.id != profile_id).first()
        if other:
            return jsonify({"error": "Já existe um perfil com esse nome"}), 409
        p.name = name
    if "avatar_url" in data:
        p.avatar_url = avatar_url
    if is_kids is not None:
        p.is_kids = bool(is_kids)

    db.session.commit()
    return jsonify(p.to_dict())


@profiles_bp.route("/<int:profile_id>", methods=["DELETE"])
@jwt_required()
def delete_profile(profile_id):
    user_id = _get_user_id()
    p = Profile.query.filter_by(id=profile_id, user_id=user_id).first_or_404()
    db.session.delete(p)
    db.session.commit()
    return jsonify({"ok": True})
