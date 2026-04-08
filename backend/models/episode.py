from database import db


class Episode(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    series_id = db.Column(db.Integer, db.ForeignKey("series.id"), nullable=False)
    season = db.Column(db.Integer, nullable=False, default=1)
    episode_number = db.Column(db.Integer, nullable=False, default=1)
    title = db.Column(db.String(200), nullable=False)
    duration = db.Column(db.String(20), nullable=False)
    video_url = db.Column(db.String(500))
    video_url_ptbr = db.Column(db.String(500))
    video_url_en = db.Column(db.String(500))
    credits_start_time = db.Column(db.Float, nullable=True)
    subtitle_srt_ptbr = db.Column(db.String(500))
    subtitle_srt_en = db.Column(db.String(500))
