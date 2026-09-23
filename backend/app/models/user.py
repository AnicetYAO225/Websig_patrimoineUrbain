"""
Modèle Utilisateur.

Pour rester simple tout en couvrant un vrai besoin métier, le RBAC est
implémenté avec un seul champ `role` (enum) plutôt qu'un système
Roles/Permissions many-to-many. C'est largement suffisant pour 4 profils
fixes (SUPER_ADMIN, ADMIN, AGENT, CITIZEN) et beaucoup plus simple à
maintenir. La table `roles` séparée peut être réintroduite plus tard si
le nombre de rôles devient dynamique.
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"   # Configuration système, gestion des admins
    ADMIN = "ADMIN"                 # Gestion des utilisateurs, couches, données
    AGENT = "AGENT"                 # Agent municipal : ajoute/modifie les équipements
    CITIZEN = "CITIZEN"             # Consultation + signalement


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CITIZEN, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username} role={self.role}>"
