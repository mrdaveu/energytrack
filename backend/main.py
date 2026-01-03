import os
from pathlib import Path
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from backend.database import engine, get_db, Base
from backend.models import User, Entry

# Get paths relative to this file
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

Base.metadata.create_all(bind=engine)

app = FastAPI(title="EnergyTrack")

# Mount frontend static files
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


class EntryCreate(BaseModel):
    timestamp: datetime
    description: Optional[str] = None
    energy: Optional[int] = None

    @model_validator(mode="after")
    def check_at_least_one(self):
        if self.description is None and self.energy is None:
            raise ValueError("At least one of description or energy must be provided")
        if self.energy is not None and (self.energy < 1 or self.energy > 10):
            raise ValueError("Energy must be between 1 and 10")
        return self


class EntryResponse(BaseModel):
    id: int
    timestamp: datetime
    description: Optional[str]
    energy: Optional[int]

    class Config:
        from_attributes = True


@app.get("/")
async def root():
    return RedirectResponse(url="/new")


@app.get("/new")
async def create_new_user(db: Session = Depends(get_db)):
    user = User()
    db.add(user)
    db.commit()
    db.refresh(user)
    return RedirectResponse(url=f"/u/{user.secret_key}")


@app.get("/u/{secret}", response_class=HTMLResponse)
async def get_user_page(secret: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.secret_key == secret).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    with open(FRONTEND_DIR / "index.html", "r") as f:
        html = f.read()
    return HTMLResponse(content=html)


@app.get("/api/u/{secret}/entries", response_model=list[EntryResponse])
async def get_entries(secret: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.secret_key == secret).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    entries = db.query(Entry).filter(Entry.user_id == user.id).order_by(Entry.timestamp.desc()).all()
    return entries


@app.post("/api/u/{secret}/entries", response_model=EntryResponse)
async def create_entry(secret: str, entry: EntryCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.secret_key == secret).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db_entry = Entry(
        user_id=user.id,
        timestamp=entry.timestamp,
        description=entry.description,
        energy=entry.energy
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
