import os
from pathlib import Path
from datetime import datetime, timedelta
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


@app.get("/demo")
async def create_demo_user(db: Session = Depends(get_db)):
    """Create a demo user with pre-populated entries for testing"""
    user = User()
    db.add(user)
    db.commit()
    db.refresh(user)

    # Demo entries - your real data + mock entries
    demo_entries = [
        # Jan 2 - your data
        {"timestamp": datetime(2025, 1, 2, 21, 0), "description": "McDonalds - 9 chicken mcnuggets", "energy": None},
        {"timestamp": datetime(2025, 1, 2, 21, 15), "description": "Extreme fatigue(!), brain turning off", "energy": 2},
        {"timestamp": datetime(2025, 1, 3, 1, 0), "description": "Cheese bagel with chicken (dark soy, soy sauce), grana padano", "energy": None},
        {"timestamp": datetime(2025, 1, 3, 1, 30), "description": "Greek yogurt, mango, pecans", "energy": None},
        {"timestamp": datetime(2025, 1, 3, 2, 0), "description": "Felt fine", "energy": 7},

        # Jan 3 - your data
        {"timestamp": datetime(2025, 1, 3, 9, 0), "description": "Sleep 9h, really difficult to wake up", "energy": 4},
        {"timestamp": datetime(2025, 1, 3, 16, 0), "description": "Bagel with scrambled eggs, olive oil, grana padano + pickled perilla leaf", "energy": None},
        {"timestamp": datetime(2025, 1, 3, 22, 0), "description": "Indomie with leftover chicken and five veggies", "energy": None},
        {"timestamp": datetime(2025, 1, 4, 0, 0), "description": "Gaming", "energy": 4},

        # Mock entries - Dec 31
        {"timestamp": datetime(2024, 12, 31, 8, 0), "description": "Woke up, black coffee", "energy": 5},
        {"timestamp": datetime(2024, 12, 31, 12, 30), "description": "Pho with extra bean sprouts", "energy": None},
        {"timestamp": datetime(2024, 12, 31, 15, 0), "description": "Afternoon slump", "energy": 3},
        {"timestamp": datetime(2024, 12, 31, 18, 0), "description": "NYE prep, cooking", "energy": 6},
        {"timestamp": datetime(2024, 12, 31, 23, 30), "description": "Champagne toast", "energy": 8},

        # Dec 30
        {"timestamp": datetime(2024, 12, 30, 7, 30), "description": "Oatmeal with blueberries", "energy": 6},
        {"timestamp": datetime(2024, 12, 30, 10, 0), "description": "Green tea, reading", "energy": 7},
        {"timestamp": datetime(2024, 12, 30, 13, 0), "description": "Leftover pasta", "energy": None},
        {"timestamp": datetime(2024, 12, 30, 16, 30), "description": "Walk in the park", "energy": 7},
        {"timestamp": datetime(2024, 12, 30, 20, 0), "description": "Salmon, rice, broccoli", "energy": None},
        {"timestamp": datetime(2024, 12, 30, 22, 0), "description": "Winding down", "energy": 5},

        # Dec 29
        {"timestamp": datetime(2024, 12, 29, 9, 0), "description": "Slept in, croissant", "energy": 6},
        {"timestamp": datetime(2024, 12, 29, 14, 0), "description": "Ramen", "energy": None},
        {"timestamp": datetime(2024, 12, 29, 17, 0), "description": "Vitamin D supplement", "energy": None},
        {"timestamp": datetime(2024, 12, 29, 19, 30), "description": "Stir fry tofu", "energy": None},
        {"timestamp": datetime(2024, 12, 29, 23, 0), "description": "Late night coding", "energy": 4},

        # Dec 28
        {"timestamp": datetime(2024, 12, 28, 8, 30), "description": "Eggs and toast", "energy": 7},
        {"timestamp": datetime(2024, 12, 28, 12, 0), "description": "Burrito bowl", "energy": None},
        {"timestamp": datetime(2024, 12, 28, 15, 0), "description": "Post-lunch crash", "energy": 3},
        {"timestamp": datetime(2024, 12, 28, 18, 0), "description": "Espresso", "energy": 6},
        {"timestamp": datetime(2024, 12, 28, 21, 0), "description": "Light dinner, soup", "energy": None},

        # Dec 27
        {"timestamp": datetime(2024, 12, 27, 7, 0), "description": "Early start, smoothie", "energy": 8},
        {"timestamp": datetime(2024, 12, 27, 11, 0), "description": "Focused work session", "energy": 9},
        {"timestamp": datetime(2024, 12, 27, 13, 30), "description": "Sushi lunch", "energy": None},
        {"timestamp": datetime(2024, 12, 27, 16, 0), "description": "Magnesium supplement", "energy": None},
        {"timestamp": datetime(2024, 12, 27, 20, 0), "description": "Thai curry", "energy": None},
        {"timestamp": datetime(2024, 12, 27, 22, 30), "description": "Relaxed evening", "energy": 6},
    ]

    for entry_data in demo_entries:
        entry = Entry(user_id=user.id, **entry_data)
        db.add(entry)

    db.commit()
    return RedirectResponse(url=f"/u/{user.secret_key}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
