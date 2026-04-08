from database import db


class Series(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    genre = db.Column(db.String(50), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    rating = db.Column(db.Float, nullable=False)
    image = db.Column(db.String(300))
    description = db.Column(db.Text)
    creator = db.Column(db.String(120))
    cast = db.Column(db.Text)
    position = db.Column(db.Integer, default=0)

    episodes = db.relationship(
        "Episode",
        backref="series",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="Episode.season, Episode.episode_number, Episode.id",
    )

