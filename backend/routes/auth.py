from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash
from models.user import User
from database import db
from datetime import timedelta

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    email = data.get("email")
    password = data.get("password")
    remember_me = bool(data.get("remember_me"))

    user = User.query.filter_by(email=email).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Credenciais inválidas"}), 401

    # ✅ identity COMO STRING
    if remember_me:
        access_token = create_access_token(
            identity=str(user.id),
            expires_delta=timedelta(days=3650),
        )
    else:
        access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "access_token": access_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "is_admin": user.is_admin
        }
    })

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = data.get("email")
    password = data.get("password")
    remember_me = bool(data.get("remember_me"))

    if not email or not password:
        return jsonify({"error": "Email e senha são obrigatórios"}), 400

    existing = User.query.filter_by(email=email).first()
    if existing:
        return jsonify({"error": "Email já cadastrado"}), 409

    user = User(email=email, is_admin=False)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    if remember_me:
        access_token = create_access_token(
            identity=str(user.id),
            expires_delta=timedelta(days=3650),
        )
    else:
        access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "access_token": access_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "is_admin": user.is_admin
        }
    }), 201
