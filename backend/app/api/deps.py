"""
Dépendances FastAPI réutilisables :
- get_current_user : extrait et valide le JWT, charge l'utilisateur en DB
- require_roles     : factory de dépendance pour protéger une route à un
                       sous-ensemble de rôles (RBAC)
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

# tokenUrl pointe vers l'endpoint de login pour la doc Swagger (/docs)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Identifiants invalides ou expirés",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exception

    return user


def require_roles(*allowed_roles: UserRole):
    """
    Usage : `Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))`
    Lève une 403 si le rôle de l'utilisateur courant n'est pas autorisé.
    """

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous n'avez pas les droits nécessaires pour cette action",
            )
        return current_user

    return _checker
