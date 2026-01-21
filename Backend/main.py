from __future__ import annotations

from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Generator, Optional, List

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine, select, func
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# ----------------------------
# Paths
# ----------------------------
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent

# ----------------------------
# Database setup (SQLite)
# ----------------------------
DATABASE_URL = f"sqlite:///{(BACKEND_DIR / 'tasks.db').as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite + threads
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------------------
# Models
# ----------------------------
class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"


class TaskDB(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default=TaskStatus.pending.value)
    due_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ----------------------------
# Pydantic schemas
# ----------------------------
class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=10_000)
    due_date: datetime


class TaskCreate(TaskBase):
    status: TaskStatus = TaskStatus.pending


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=10_000)
    status: Optional[TaskStatus] = None
    due_date: Optional[datetime] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    status: TaskStatus
    due_date: datetime
    created_at: datetime
    updated_at: datetime


class TaskListOut(BaseModel):
    total: int
    items: List[TaskOut]


# ----------------------------
# App
# ----------------------------
FRONTEND_DIR = PROJECT_DIR / "Frontend"
INDEX_FILE = FRONTEND_DIR / "index.html"
EDIT_FILE = FRONTEND_DIR / "edit.html"

app = FastAPI(
    title="Task API",
    version="1.0.0",
    description="A tiny CRUD API for a coding challenge. Humans requested it.",
)

# CORS: required if your frontend is on a different port (React/Vite/Next)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next/React
        "http://localhost:5173",  # Vite
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/", include_in_schema=False)
def serve_frontend() -> FileResponse:
    if not INDEX_FILE.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frontend not found")
    return FileResponse(INDEX_FILE)


@app.get("/edit", include_in_schema=False)
def serve_edit() -> FileResponse:
    if not EDIT_FILE.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edit page not found")
    return FileResponse(EDIT_FILE)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "time": datetime.utcnow().isoformat()}


# ----------------------------
# CRUD Endpoints
# ----------------------------
@app.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskOut:
    now = datetime.utcnow()
    task = TaskDB(
        title=payload.title,
        description=payload.description,
        status=payload.status.value,
        due_date=payload.due_date,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@app.get("/tasks", response_model=TaskListOut)
def list_tasks(
    db: Session = Depends(get_db),
    status_filter: Optional[List[TaskStatus]] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None, description="Search in title"),
    task_id: Optional[int] = Query(default=None, ge=1, alias="id"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="due_date", pattern="^(id|due_date|created_at|updated_at)$"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
) -> TaskListOut:
    stmt = select(TaskDB)

    if status_filter:
        statuses = [status.value for status in status_filter]
        stmt = stmt.where(TaskDB.status.in_(statuses))

    if task_id is not None:
        stmt = stmt.where(TaskDB.id == task_id)

    if q:
        search = q.strip()
        if search:
            title_match = TaskDB.title.ilike(f"%{search}%")
            stmt = stmt.where(title_match)

    sort_col = getattr(TaskDB, sort)
    stmt = stmt.order_by(sort_col.asc() if order == "asc" else sort_col.desc())

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(total_stmt).scalar_one()

    items = db.execute(stmt.limit(limit).offset(offset)).scalars().all()
    return TaskListOut(
        total=total,
        items=[TaskOut.model_validate(t) for t in items],
    )


@app.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)) -> TaskOut:
    task = db.get(TaskDB, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return TaskOut.model_validate(task)


@app.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)) -> TaskOut:
    task = db.get(TaskDB, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.status is not None:
        task.status = payload.status.value
    if payload.due_date is not None:
        task.due_date = payload.due_date

    task.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db)) -> Response:
    task = db.get(TaskDB, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
