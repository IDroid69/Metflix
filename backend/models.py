from database import db

class Movie(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    genre = db.Column(db.String(50), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    rating = db.Column(db.Float, nullable=False)
    duration = db.Column(db.String(20), nullable=False)
    image = db.Column(db.String(255))
    description = db.Column(db.Text)
    director = db.Column(db.String(120))
    cast = db.Column(db.Text)
