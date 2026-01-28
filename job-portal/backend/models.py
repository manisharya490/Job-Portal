from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# ---------- Pydantic Schemas ----------

class UserBase(BaseModel):
    name: str
    username: str
    role: str  # "candidate" | "recruiter"


class UserCreate(UserBase):
    email: str
    password: str


class UserOut(UserBase):
    id: str
    email: str
    resume: Optional[str] = None
    created_at: datetime


class JobBase(BaseModel):
    title: str
    description: str
    company: Optional[str] = None
    location: Optional[str] = None
    type: Optional[str] = "full-time"
    views: Optional[int] = 0
    status: Optional[str] = "pending"  # "pending" | "approved" | "rejected"

class JobCreate(JobBase):
    pass

class JobOut(JobBase):
    id: str
    recruiter: str
    created_at: datetime
    views: int = 0


class ApplicationOut(BaseModel):
    job_title: str
    candidate_name: str
    resume: Optional[str]
    applied_at: datetime
    status: str
class AppUpdate(BaseModel):
    status: Optional[str]
    message: Optional[str]

class Message(BaseModel):
    sender: str
    recipient: str
    content: str
    timestamp: datetime
    read: bool = False

class AlertCreate(BaseModel):
    email: Optional[str] = None
    keyword: str
    frequency: Optional[str] = "daily"
