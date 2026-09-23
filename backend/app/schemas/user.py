from pydantic import BaseModel

from app.models.user import UserRole


class UserUpdateRole(BaseModel):
    role: UserRole


class UserUpdateStatus(BaseModel):
    is_active: bool
