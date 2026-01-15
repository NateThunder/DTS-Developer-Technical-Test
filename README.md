# HMCTS Task Manager

A simple task manager with a FastAPI backend and a static HTML/CSS/JS frontend.

## Repo layout
- `Backend/` FastAPI API + SQLite database
- `Frontend/` Static frontend (served by the backend or any static server)

## Requirements
- Python 3.10+ recommended
- `pip`

## Quick start (run the full app)
Windows (PowerShell):
```powershell
cd Backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

macOS/Linux (zsh/bash):
```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Open: `http://127.0.0.1:8000/` (the backend serves `Frontend/`).

## Frontend only (optional)
If you want the frontend on its own, serve this folder with a static server and point it to the API.

Windows (PowerShell):
```powershell
cd Frontend
py -m http.server 5500
```

macOS/Linux (zsh/bash):
```bash
cd Frontend
python3 -m http.server 5500
```

Then open `http://127.0.0.1:5500/`.

Update `Frontend/app.js`:
```js
const API_BASE = "http://127.0.0.1:8000";
```

## API docs
With the backend running:
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Tests (optional)
Windows (PowerShell):
```powershell
cd Backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

macOS/Linux (zsh/bash):
```bash
cd Backend
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

## Data storage
SQLite file: `Backend/tasks.db` (created on startup if missing).

## API endpoints
- `POST /tasks` create a task
- `GET /tasks` list tasks (filters + pagination)
- `GET /tasks/{task_id}` get a task
- `PATCH /tasks/{task_id}` update status/details
- `DELETE /tasks/{task_id}` delete a task

## Notes
- The frontend has no build step or package dependencies.
