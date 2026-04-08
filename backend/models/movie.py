from database import db


class Movie(db.Model):
    __tablename__ = "movie"

    id = db.Column(db.Integer, primary_key=True)

    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)

    genre = db.Column(db.String(50))
    year = db.Column(db.Integer)
    rating = db.Column(db.Float)
    image = db.Column(db.String(500))
    director = db.Column(db.String(120))
    cast = db.Column(db.Text)

    cover_url = db.Column(db.String(500))
    backdrop_url = db.Column(db.String(500))

    video_url = db.Column(db.String(500))
    video_url_ptbr = db.Column(db.String(500))
    video_url_en = db.Column(db.String(500))

    subtitle_srt_ptbr = db.Column(db.String(500))
    subtitle_srt_en = db.Column(db.String(500))

    duration = db.Column(db.Integer)
    position = db.Column(db.Integer, default=0)

    created_at = db.Column(
        db.DateTime, server_default=db.func.now()
    )

    # =========================
    # SERIALIZAÇÃO
    # =========================
    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "genre": self.genre,
            "year": self.year,
            "rating": self.rating,
            "image": self.image,
            "director": self.director,
            "cast": self.cast,
            "cover_url": self.cover_url,
            "backdrop_url": self.backdrop_url,
            "video_url": self.video_url,
            "video_url_ptbr": self.video_url_ptbr,
            "video_url_en": self.video_url_en,
            "subtitle_srt_ptbr": self.subtitle_srt_ptbr,
            "subtitle_srt_en": self.subtitle_srt_en,
            "duration": self.duration,
            "position": self.position,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
