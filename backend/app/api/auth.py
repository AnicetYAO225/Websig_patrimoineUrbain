from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.user import User, UserRole
from app.schemas.auth import PasswordChange, ProfileUpdate, Token, UserLogin, UserOut, UserRegister
from app.services import auth_service, media_service

router = APIRouter(prefix="/api/auth", tags=["Authentification"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """Inscription publique. Le rôle par défaut est CITOYEN (les rôles élevés
    sont attribués ensuite par un administrateur, jamais choisis par l'utilisateur)."""
    if auth_service.get_user_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    if auth_service.get_user_by_username(db, payload.username):
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà pris")

    user = auth_service.create_user(
        db, username=payload.username, email=payload.email, password=payload.password, role=UserRole.CITIZEN
    )
    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Connexion via OAuth2PasswordRequestForm (username=email, password) pour
    rester compatible avec le bouton "Authorize" de Swagger /docs.
    """
    user = auth_service.authenticate_user(db, email=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permet à l'utilisateur connecté de modifier son propre profil (nom d'utilisateur)."""
    if payload.username and payload.username != current_user.username:
        if auth_service.get_user_by_username(db, payload.username):
            raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà pris")
        current_user.username = payload.username
        db.commit()
        db.refresh(current_user)
    return current_user


@router.put("/me/password", response_model=UserOut)
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    return auth_service.update_password(db, current_user, payload.new_password)


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload de la photo de profil. Remplace l'avatar existant s'il y en a un."""
    content = await file.read()
    avatar_url = media_service.save_avatar(current_user.id, file, content)
    current_user.avatar_url = avatar_url
    db.commit()
    db.refresh(current_user)
    return current_user
