from datetime import datetime
from database import db


class PlaybackProgress(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    content_type = db.Column(db.String(16), nullable=False, index=True)
    content_id = db.Column(db.Integer, nullable=False, index=True)
    series_id = db.Column(db.Integer, nullable=True, index=True)
    position_seconds = db.Column(db.Float, nullable=False, default=0)
    duration_seconds = db.Column(db.Float, nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "content_type", "content_id", "series_id", name="uq_progress_user_content"),
    )

