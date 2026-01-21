from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

try:
    from Backend.main import Base, app, get_db
except ModuleNotFoundError:
    from main import Base, app, get_db


@pytest.fixture
def client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def build_payload(seq: int) -> dict:
    due_date = datetime(2030, 1, seq, 10, 0, tzinfo=timezone.utc).isoformat()
    return {
        "title": f"Task {seq}",
        "description": f"Task {seq} description",
        "status": "pending",
        "due_date": due_date,
    }


def test_create_and_get_task(client: TestClient):
    payload = build_payload(1)

    create_response = client.post("/tasks", json=payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["title"] == payload["title"]
    assert created["status"] == payload["status"]

    task_id = created["id"]
    get_response = client.get(f"/tasks/{task_id}")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["id"] == task_id
    assert fetched["title"] == payload["title"]


def test_list_tasks_with_pagination(client: TestClient):
    for i in range(1, 4):
        client.post("/tasks", json=build_payload(i))

    first_page = client.get("/tasks?limit=2&offset=0")
    assert first_page.status_code == 200
    data = first_page.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2

    second_page = client.get("/tasks?limit=2&offset=2")
    assert second_page.status_code == 200
    data = second_page.json()
    assert data["total"] == 3
    assert len(data["items"]) == 1


def test_list_tasks_with_id_filter(client: TestClient):
    for i in range(1, 4):
        client.post("/tasks", json=build_payload(i))

    response = client.get("/tasks?id=2")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == 2


def test_update_task_status(client: TestClient):
    create_response = client.post("/tasks", json=build_payload(1))
    task_id = create_response.json()["id"]

    patch_response = client.patch(f"/tasks/{task_id}", json={"status": "completed"})
    assert patch_response.status_code == 200
    updated = patch_response.json()
    assert updated["status"] == "completed"


def test_edit_task(client: TestClient):
    create_response = client.post("/tasks", json=build_payload(1))
    task_id = create_response.json()["id"]

    updated_due = datetime(2031, 2, 1, 14, 30, tzinfo=timezone.utc).isoformat()
    patch_payload = {
        "title": "Updated title",
        "description": "Updated description",
        "status": "in_progress",
        "due_date": updated_due,
    }
    patch_response = client.patch(f"/tasks/{task_id}", json=patch_payload)
    assert patch_response.status_code == 200
    updated = patch_response.json()
    assert updated["title"] == patch_payload["title"]
    assert updated["description"] == patch_payload["description"]
    assert updated["status"] == patch_payload["status"]
    assert updated["due_date"] == updated_due


def test_delete_task(client: TestClient):
    create_response = client.post("/tasks", json=build_payload(1))
    task_id = create_response.json()["id"]

    delete_response = client.delete(f"/tasks/{task_id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/tasks/{task_id}")
    assert get_response.status_code == 404
