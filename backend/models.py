import secrets
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from database import Base


def generate_secret_key():
    return secrets.token_urlsafe(8)[:10]


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    secret_key = Column(String(12), unique=True, nullable=False, default=generate_secret_key)
    created_at = Column(DateTime, default=datetime.utcnow)

    entries = relationship("Entry", back_populates="user")


class Entry(Base):
    __tablename__ = "entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    description = Column(Text, nullable=True)
    energy = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="entries")

    __table_args__ = (
        CheckConstraint("energy >= 1 AND energy <= 10", name="energy_range"),
        CheckConstraint("description IS NOT NULL OR energy IS NOT NULL", name="at_least_one"),
    )
