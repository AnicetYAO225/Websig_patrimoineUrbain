"""
Outil de secours : promeut un utilisateur existant en SUPER_ADMIN à
partir de son email, sans passer par l'interface (utile si aucun compte
super admin n'est accessible pour le faire depuis la page Administration).

Exécution :
    python -m app.promote_to_superadmin quelqu.un@example.com
    docker compose exec backend python -m app.promote_to_superadmin quelqu.un@example.com
"""
import sys

from app.core.database import SessionLocal
from app.models.user import UserRole
from app.services import auth_service


def promote(email: str):
    db = SessionLocal()
    try:
        user = auth_service.get_user_by_email(db, email)
        if not user:
            print(f"Aucun utilisateur trouvé avec l'email : {email}")
            print("Il doit d'abord exister (inscris-toi via 'Créer un compte', puis relance cette commande).")
            return

        if user.role == UserRole.SUPER_ADMIN:
            print(f"{email} est déjà SUPER_ADMIN.")
            return

        previous_role = user.role.value
        user.role = UserRole.SUPER_ADMIN
        db.commit()
        print(f"OK - {email} promu SUPER_ADMIN (était {previous_role}).")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage : python -m app.promote_to_superadmin <email>")
        sys.exit(1)
    promote(sys.argv[1])
