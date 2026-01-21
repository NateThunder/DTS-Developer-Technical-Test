const API_BASE = "";
const editForm = document.getElementById("edit-form");
const notice = document.getElementById("notice");
const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const dueDateInput = document.getElementById("due_date");
const dueTimeInput = document.getElementById("due_time");
const statusSelect = document.getElementById("status");
const deleteButton = document.getElementById("delete-task");

let taskId = null;
function setNotice(message, tone) {
  if (!notice) return;
  notice.textContent = message;
  notice.hidden = !message;
  notice.className = "app-notice";
  if (tone === "error") {
    notice.classList.add("app-notice--error");
  } else if (tone === "success") {
    notice.classList.add("app-notice--success");
  } else if (tone === "warning") {
    notice.classList.add("app-notice--warning");
  }
}

function toIsoDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const combined = `${dateValue}T${timeValue}`;
  const date = new Date(combined);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toLocalDateTimeParts(value) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const iso = local.toISOString();
  return { date: iso.split("T")[0], time: iso.slice(11, 16) };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { detail: text };
    }
  }
  if (!response.ok) {
    const detail = data && data.detail ? data.detail : response.statusText;
    throw new Error(detail);
  }
  return data;
}

async function deleteTask(taskId) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
}

function getTaskId() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("id");
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function fillForm(task) {
  if (!titleInput || !descriptionInput || !dueDateInput || !dueTimeInput || !statusSelect) {
    return;
  }
  titleInput.value = task.title || "";
  descriptionInput.value = task.description || "";
  statusSelect.value = task.status || "pending";
  const local = toLocalDateTimeParts(task.due_date);
  dueDateInput.value = local.date;
  dueTimeInput.value = local.time;
}

async function loadTask() {
  taskId = getTaskId();
  if (!taskId) {
    setNotice("Missing task id in the URL.", "error");
    if (editForm) {
      editForm.hidden = true;
    }
    return;
  }
  setNotice("Loading task...", "warning");
  try {
    const task = await requestJson(`${API_BASE}/tasks/${taskId}`, { method: "GET" });
    fillForm(task);
    setNotice("", "");
  } catch (error) {
    setNotice(`Could not load task: ${error.message}`, "error");
    if (editForm) {
      editForm.hidden = true;
    }
  }
}

if (editForm) {
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!taskId) return;
    const title = titleInput ? titleInput.value.trim() : "";
    const description = descriptionInput ? descriptionInput.value.trim() : "";
    const dueDate = dueDateInput ? dueDateInput.value : "";
    const dueTime = dueTimeInput ? dueTimeInput.value : "";
    const status = statusSelect ? statusSelect.value : "pending";

    if (!title || !dueDate || !dueTime) {
      setNotice("Title, due date, and time are required.", "error");
      return;
    }

    const dueDateTime = toIsoDateTime(dueDate, dueTime);
    if (!dueDateTime) {
      setNotice("Due date and time must be valid.", "error");
      return;
    }

    const payload = {
      title,
      description: description || null,
      status,
      due_date: dueDateTime,
    };

    try {
      await requestJson(`${API_BASE}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setNotice("Task updated.", "success");
    } catch (error) {
      setNotice(`Could not update task: ${error.message}`, "error");
    }
  });
}

if (deleteButton) {
  deleteButton.addEventListener("click", async () => {
    if (!taskId) return;
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;
    try {
      await deleteTask(taskId);
      window.location.href = "/";
    } catch (error) {
      setNotice(`Could not delete task: ${error.message}`, "error");
    }
  });
}

loadTask();
