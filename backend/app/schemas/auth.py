from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: UserRole
    is_active: bool
    avatar_url: str | None = None

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=50)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
