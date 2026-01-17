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
    type: Optional[str] = "full-time"  # full-time | contract | part-time


class JobCreate(JobBase):
    pass


class JobOut(JobBase):
    id: str
    recruiter: str
    created_at: datetime


class ApplicationOut(BaseModel):
    job_title: str
    candidate_name: str
    resume: Optional[str]
    applied_at: datetime
    status: str
    message: Optional[str] = None
