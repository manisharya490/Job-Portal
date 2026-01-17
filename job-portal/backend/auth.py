from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from dotenv import load_dotenv
import os

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-change-in-production")
JWT_ALGO = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
  return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
  return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
  to_encode = data.copy()
  expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
  to_encode.update({"exp": expire})
  return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str):
  try:
      return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
  except JWTError:
      return None
