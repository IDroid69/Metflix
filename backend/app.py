from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from database import db
from routes.movies import movies_bp
from routes.series import series_bp
from routes.progress import progress_bp
from routes.auth import auth_bp
from routes.media import media_bp
from routes.profiles import profiles_bp
from dotenv import load_dotenv
import os
from datetime import timedelta

load_dotenv()

app = Flask(__name__)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL", "sqlite:///cinehub.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "super-secret")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=12)

CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"], "allow_headers": ["Authorization", "Content-Type"], "expose_headers": ["Content-Type"]}})

db.init_app(app)
jwt = JWTManager(app)

app.config["JWT_TOKEN_LOCATION"] = ["headers", "query_string"]
app.config["JWT_QUERY_STRING_NAME"] = "token"

app.register_blueprint(movies_bp, url_prefix="/api/movies")
app.register_blueprint(series_bp, url_prefix="/api/series")
app.register_blueprint(progress_bp, url_prefix="/api/progress")
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(media_bp, url_prefix="/api/media")
app.register_blueprint(profiles_bp, url_prefix="/api/profiles")

with app.app_context():
    from models.series import Series
    from models.episode import Episode
    from models.progress import PlaybackProgress
    from models.profile import Profile
    db.create_all()
    # Simple migration (SQLite): ensure new columns exist on existing tables
    try:
        from sqlalchemy import text
        engine = db.get_engine()
        with engine.connect() as conn:
            cols = conn.execute(text("PRAGMA table_info(movie)")).fetchall()
            col_names = [c[1] for c in cols] if cols else []
            if "genre" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN genre VARCHAR(50)"))
            if "year" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN year INTEGER"))
            if "rating" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN rating FLOAT"))
            if "image" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN image VARCHAR(500)"))
            if "director" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN director VARCHAR(120)"))
            if "cast" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN cast TEXT"))
            if "cover_url" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN cover_url VARCHAR(500)"))
            if "backdrop_url" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN backdrop_url VARCHAR(500)"))
            if "duration" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN duration INTEGER"))
            if "video_url" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN video_url VARCHAR(500)"))
            if "video_url_ptbr" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN video_url_ptbr VARCHAR(500)"))
            if "video_url_en" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN video_url_en VARCHAR(500)"))
            if "position" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN position INTEGER DEFAULT 0"))
            if "subtitle_srt_ptbr" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN subtitle_srt_ptbr VARCHAR(500)"))
            if "subtitle_srt_en" not in col_names:
                conn.execute(text("ALTER TABLE movie ADD COLUMN subtitle_srt_en VARCHAR(500)"))

            cols = conn.execute(text("PRAGMA table_info(episode)")).fetchall()
            col_names = [c[1] for c in cols] if cols else []
            if "video_url_ptbr" not in col_names:
                conn.execute(text("ALTER TABLE episode ADD COLUMN video_url_ptbr VARCHAR(500)"))
            if "video_url_en" not in col_names:
                conn.execute(text("ALTER TABLE episode ADD COLUMN video_url_en VARCHAR(500)"))
            if "credits_start_time" not in col_names:
                conn.execute(text("ALTER TABLE episode ADD COLUMN credits_start_time FLOAT"))
            if "subtitle_srt_ptbr" not in col_names:
                conn.execute(text("ALTER TABLE episode ADD COLUMN subtitle_srt_ptbr VARCHAR(500)"))
            if "subtitle_srt_en" not in col_names:
                conn.execute(text("ALTER TABLE episode ADD COLUMN subtitle_srt_en VARCHAR(500)"))

            cols = conn.execute(text("PRAGMA table_info(series)")).fetchall()
            col_names = [c[1] for c in cols] if cols else []
            if "position" not in col_names:
                conn.execute(text("ALTER TABLE series ADD COLUMN position INTEGER DEFAULT 0"))
    except Exception as e:
        # Non-fatal: continue without migration
        pass

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
