from app import app
from database import db
from models.user import User

with app.app_context():
    admin = User(
        email="admin@cinehub.com",
        is_admin=True
    )
    admin.set_password("admin123")

    db.session.add(admin)
    db.session.commit()

    print("✅ Admin criado com sucesso!")
