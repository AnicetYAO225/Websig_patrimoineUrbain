from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth import UserOut
from app.schemas.user import UserUpdateRole, UserUpdateStatus

router = APIRouter(prefix="/api/admin", tags=["Administration"])

# Seuls ADMIN et SUPER_ADMIN accèdent à ces routes
admin_only = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
super_admin_only = require_roles(UserRole.SUPER_ADMIN)


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return db.query(User).order_by(User.id).all()


@router.put("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    payload: UserUpdateRole,
    db: Session = Depends(get_db),
    current_user: User = Depends(super_admin_only),  # attribuer des rôles = action sensible
):
    """Seul un SUPER_ADMIN peut changer le rôle d'un utilisateur (évite qu'un
    ADMIN se promeuve lui-même SUPER_ADMIN)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/status", response_model=UserOut)
def update_user_status(
    user_id: int,
    payload: UserUpdateStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    """Active / désactive (bannit) un compte utilisateur."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte")

    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int, db: Session = Depends(get_db), current_user: User = Depends(super_admin_only)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")

    db.delete(user)
    db.commit()
