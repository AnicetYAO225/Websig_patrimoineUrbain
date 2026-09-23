"""
Script de seed minimal : garantit qu'un compte super admin existe pour
l'email configuré (FIRST_SUPERADMIN_EMAIL).

Exécution :  docker compose exec backend python -m app.seed

Ce script est idempotent et gère 3 cas :
1. L'email n'existe pas encore -> crée un nouveau compte SUPER_ADMIN
2. L'email existe déjà mais avec un autre rôle (ex: quelqu'un s'est
   inscrit lui-même via "Créer un compte" avec cet email, ce qui crée
   toujours un compte CITOYEN par sécurité) -> promeut ce compte en
   SUPER_ADMIN, sans toucher à son mot de passe actuel
3. L'email existe déjà en SUPER_ADMIN -> ne fait rien

NOTE : les anciennes données de démonstration (couches fictives) ont été
retirées de ce script. Les vraies données territoriales s'importent via
`app.import_geodata` (voir README, section "Données réelles").
"""
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.models.user import UserRole
from app.services import auth_service


def seed():
    # Crée les tables si elles n'existent pas déjà (utile en dev rapide ;
    # en environnement "propre", on préfère `alembic upgrade head`)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = auth_service.get_user_by_email(db, settings.FIRST_SUPERADMIN_EMAIL)

        if not existing:
            auth_service.create_user(
                db,
                username="superadmin",
                email=settings.FIRST_SUPERADMIN_EMAIL,
                password=settings.FIRST_SUPERADMIN_PASSWORD,
                role=UserRole.SUPER_ADMIN,
            )
            print(f"OK - Super admin cree : {settings.FIRST_SUPERADMIN_EMAIL}")
        elif existing.role != UserRole.SUPER_ADMIN:
            previous_role = existing.role.value
            existing.role = UserRole.SUPER_ADMIN
            db.commit()
            print(
                f"OK - Compte existant promu SUPER_ADMIN : {settings.FIRST_SUPERADMIN_EMAIL} "
                f"(etait {previous_role}). Le mot de passe actuel du compte est conserve."
            )
        else:
            print("... Super admin deja existant, ignore")

        print("\nSeed termine avec succes.")
        print("Pour charger de vraies donnees territoriales : python -m app.import_geodata")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
