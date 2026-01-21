const API_BASE = "";
const taskForm = document.getElementById("task-form");
const formMessage = document.getElementById("form-message");
const notice = document.getElementById("notice");
const taskList = document.getElementById("task-list");
const taskCount = document.getElementById("task-count");
const filtersForm = document.getElementById("filters");
const filtersReset = document.getElementById("filters-reset");
const dueDateInput = document.getElementById("due_date");
const dueTimeInput = document.getElementById("due_time");
const idSearchInput = document.getElementById("search-id");
const titleSearchInput = document.getElementById("search-title");
const statusDropdown = document.querySelector("[data-status-dropdown]");
const statusDropdownButton = document.getElementById("filter-status-trigger");
const statusDropdownPanel = document.getElementById("filter-status-panel");
const statusSelectAll = document.getElementById("filter-status-all");
const statusOptionCheckboxes = statusDropdownPanel
  ? Array.from(statusDropdownPanel.querySelectorAll("[data-status-option]"))
  : [];
const sortButtons = document.querySelectorAll(".app-sort-button");
const showMoreButton = document.getElementById("show-more");
const backToTopLink = document.getElementById("back-to-top");

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

function getSelectedStatuses() {
  return statusOptionCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
}

function updateStatusSelectAll() {
  if (!statusSelectAll) return;
  const total = statusOptionCheckboxes.length;
  const selected = getSelectedStatuses().length;
  if (selected === total && total > 0) {
    statusSelectAll.checked = true;
    statusSelectAll.indeterminate = false;
    return;
  }
  if (selected === 0) {
    statusSelectAll.checked = false;
    statusSelectAll.indeterminate = false;
    return;
  }
  statusSelectAll.checked = false;
  statusSelectAll.indeterminate = true;
}

function updateStatusDropdownLabel() {
  if (!statusDropdownButton) return;
  const total = statusOptionCheckboxes.length;
  const selected = getSelectedStatuses().length;
  if (selected === total && total > 0) {
    statusDropdownButton.textContent = "All statuses";
    return;
  }
  statusDropdownButton.textContent = `Status (${selected} selected)`;
}

function syncStatusDropdown() {
  updateStatusSelectAll();
  updateStatusDropdownLabel();
}

function setStatusDropdownOpen(isOpen) {
  if (!statusDropdownPanel || !statusDropdownButton) return;
  statusDropdownPanel.hidden = !isOpen;
  statusDropdownButton.setAttribute("aria-expanded", String(isOpen));
}

const DEFAULT_SORT = "due_date";
const DEFAULT_ORDER = "asc";
const PAGE_SIZE = 30;
let currentSort = DEFAULT_SORT;
let currentOrder = DEFAULT_ORDER;
let currentOffset = 0;
let currentLoaded = 0;
let totalAvailable = 0;
let formMessageTimeout = null;
let formMessageClearTimeout = null;
let searchDebounce = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clearFormMessageTimers() {
  if (formMessageTimeout) {
    clearTimeout(formMessageTimeout);
    formMessageTimeout = null;
  }
  if (formMessageClearTimeout) {
    clearTimeout(formMessageClearTimeout);
    formMessageClearTimeout = null;
  }
}

function setFormMessage(message, isError) {
  clearFormMessageTimers();
  formMessage.textContent = message;
  formMessage.classList.remove("app-form-message--hidden");
  if (!message) {
    formMessage.className = "govuk-hint";
    return;
  }
  formMessage.className = isError
    ? "app-form-message app-form-message--error"
    : "app-form-message app-form-message--success";
}

function scheduleFormMessageFade() {
  clearFormMessageTimers();
  formMessageTimeout = setTimeout(() => {
    formMessage.classList.add("app-form-message--hidden");
    formMessageClearTimeout = setTimeout(() => {
      setFormMessage("", false);
    }, 400);
  }, 2000);
}

function setNotice(message, tone) {
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

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function buildQuery({ limit = PAGE_SIZE, offset = 0 } = {}) {
  const params = new URLSearchParams();
  const idValue = idSearchInput ? idSearchInput.value.trim() : "";
  const titleValue = titleSearchInput ? titleSearchInput.value.trim() : "";
  const selectedStatuses = getSelectedStatuses();
  const totalStatusOptions = statusOptionCheckboxes.length;

  if (idValue) {
    const parsedId = Number(idValue);
    if (Number.isInteger(parsedId) && parsedId > 0) {
      params.set("id", String(parsedId));
    }
  }
  if (titleValue) {
    params.set("q", titleValue);
  }
  if (
    totalStatusOptions > 0 &&
    selectedStatuses.length > 0 &&
    selectedStatuses.length < totalStatusOptions
  ) {
    selectedStatuses.forEach((status) => {
      params.append("status", status);
    });
  }
  params.set("sort", currentSort);
  params.set("order", currentOrder);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return params.toString();
}

function setSortIndicators() {
  sortButtons.forEach((button) => {
    const sort = button.dataset.sort;
    const header = button.closest("th");
    button.classList.remove("is-asc", "is-desc");
    if (header) {
      if (sort === currentSort) {
        header.setAttribute(
          "aria-sort",
          currentOrder === "asc" ? "ascending" : "descending"
        );
      } else {
        header.setAttribute("aria-sort", "none");
      }
    }
    if (sort === currentSort) {
      button.classList.add(currentOrder === "asc" ? "is-asc" : "is-desc");
    }
  });
}

function buildTaskRows(items) {
  return items
    .map((task) => {
      const safeTitle = escapeHtml(task.title);
      const safeDescription = task.description ? escapeHtml(task.description) : "";
      const statusClass = task.status.replace("_", "-");
      const statusLabel = STATUS_LABELS[task.status] || task.status;
      return `
        <tr class="app-task-row" data-task-id="${task.id}">
          <td>${task.id}</td>
          <td>${formatDateTime(task.due_date)}</td>
          <td>
            <div class="app-task-title">${safeTitle}</div>
            <p class="app-task-desc">${safeDescription || "No description provided."}</p>
          </td>
          <td>
            <span class="app-status app-status--${statusClass}">${statusLabel}</span>
          </td>
          <td class="app-task-actions">
            <label class="govuk-label govuk-visually-hidden" for="status-${task.id}">Status</label>
            <select class="govuk-select" id="status-${task.id}">
              <option value="pending" ${task.status === "pending" ? "selected" : ""}>Pending</option>
              <option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>In progress</option>
              <option value="completed" ${task.status === "completed" ? "selected" : ""}>Completed</option>
            </select>
            <div class="app-button-group">
              <button class="govuk-button govuk-button--secondary" type="button" data-action="edit">
                Edit
              </button>
              <button class="govuk-button govuk-button--warning" type="button" data-action="delete">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderTasks(items, total, { append = false } = {}) {
  taskCount.textContent = `${total} task${total === 1 ? "" : "s"}`;
  if (!items.length) {
    if (append) {
      return;
    }
    taskList.innerHTML =
      '<tr><td class="app-empty" colspan="5">No tasks match these filters.</td></tr>';
    return;
  }

  const rows = buildTaskRows(items);
  if (append) {
    taskList.insertAdjacentHTML("beforeend", rows);
    return;
  }
  taskList.innerHTML = rows;
}

function updatePaginationControls() {
  if (showMoreButton) {
    showMoreButton.hidden = currentLoaded >= totalAvailable;
  }
  if (backToTopLink) {
    backToTopLink.hidden = currentOffset === 0;
  }
}

function scheduleSearchFilter() {
  if (searchDebounce) {
    clearTimeout(searchDebounce);
  }
  searchDebounce = setTimeout(() => {
    loadTasks();
  }, 300);
}

async function loadTasks({ append = false } = {}) {
  if (statusOptionCheckboxes.length > 0 && getSelectedStatuses().length === 0) {
    renderTasks([], 0, { append: false });
    totalAvailable = 0;
    currentOffset = 0;
    currentLoaded = 0;
    updatePaginationControls();
    setNotice("", "");
    return;
  }
  setNotice(append ? "Loading more tasks..." : "Loading tasks...", "warning");
  try {
    const offset = append ? currentOffset + PAGE_SIZE : 0;
    const query = buildQuery({ limit: PAGE_SIZE, offset });
    const data = await requestJson(`${API_BASE}/tasks?${query}`, { method: "GET" });
    totalAvailable = data.total;
    renderTasks(data.items, data.total, { append });
    currentOffset = append ? offset : 0;
    currentLoaded = append ? currentLoaded + data.items.length : data.items.length;
    updatePaginationControls();
    setNotice("", "");
  } catch (error) {
    taskList.innerHTML = "";
    setNotice(`Could not load tasks: ${error.message}`, "error");
    totalAvailable = 0;
    currentOffset = 0;
    currentLoaded = 0;
    updatePaginationControls();
  }
}

async function createTask(payload) {
  await requestJson(`${API_BASE}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function updateTaskStatus(taskId, status) {
  await requestJson(`${API_BASE}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

async function deleteTask(taskId) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
}

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskForm.title.value.trim();
  const description = taskForm.description.value.trim();
  const dueDate = taskForm.due_date.value;
  const dueTime = taskForm.due_time.value;
  const status = taskForm.status.value;

  if (!title || !dueDate || !dueTime) {
    setFormMessage("Title, due date, and time are required.", true);
    return;
  }

  const dueDateTime = toIsoDateTime(dueDate, dueTime);
  if (!dueDateTime) {
    setFormMessage("Due date and time must be valid.", true);
    return;
  }

  const payload = {
    title,
    description: description || null,
    status,
    due_date: dueDateTime,
  };

  try {
    await createTask(payload);
    setFormMessage("Task created", false);
    scheduleFormMessageFade();
    taskForm.reset();
    setDefaultDueDateTime();
    await loadTasks();
  } catch (error) {
    setFormMessage(`Could not create task: ${error.message}`, true);
  }
});

if (idSearchInput) {
  idSearchInput.addEventListener("input", scheduleSearchFilter);
}

if (titleSearchInput) {
  titleSearchInput.addEventListener("input", scheduleSearchFilter);
}

if (statusSelectAll) {
  statusSelectAll.addEventListener("change", () => {
    const shouldSelectAll = statusSelectAll.checked;
    statusOptionCheckboxes.forEach((checkbox) => {
      checkbox.checked = shouldSelectAll;
    });
    statusSelectAll.indeterminate = false;
    updateStatusDropdownLabel();
    loadTasks();
  });
}

statusOptionCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    syncStatusDropdown();
    loadTasks();
  });
});

if (statusDropdownButton && statusDropdownPanel) {
  statusDropdownButton.addEventListener("click", () => {
    const isOpen = statusDropdownButton.getAttribute("aria-expanded") === "true";
    setStatusDropdownOpen(!isOpen);
  });
}

if (statusDropdown) {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (!statusDropdown.contains(event.target)) {
      setStatusDropdownOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setStatusDropdownOpen(false);
    }
  });
}

if (showMoreButton) {
  showMoreButton.addEventListener("click", async () => {
    await loadTasks({ append: true });
  });
}

filtersReset.addEventListener("click", async () => {
  filtersForm.reset();
  syncStatusDropdown();
  setStatusDropdownOpen(false);
  currentSort = DEFAULT_SORT;
  currentOrder = DEFAULT_ORDER;
  setSortIndicators();
  await loadTasks();
});

sortButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const sort = button.dataset.sort;
    if (!sort) return;
    if (sort === currentSort) {
      currentOrder = currentOrder === "asc" ? "desc" : "asc";
    } else {
      currentSort = sort;
      currentOrder = DEFAULT_ORDER;
    }
    setSortIndicators();
    await loadTasks();
  });
});

taskList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  if (!action) return;
  const taskItem = target.closest(".app-task-row");
  if (!taskItem) return;
  const taskId = taskItem.dataset.taskId;
  if (!taskId) return;

  if (action === "edit") {
    window.location.href = `/edit?id=${encodeURIComponent(taskId)}`;
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;
    try {
      await deleteTask(taskId);
      setNotice("Task deleted.", "success");
      await loadTasks();
    } catch (error) {
      setNotice(`Could not delete task: ${error.message}`, "error");
    }
  }
});

taskList.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const taskItem = target.closest(".app-task-row");
  if (!taskItem) return;
  const taskId = taskItem.dataset.taskId;
  if (!taskId) return;
  const status = target.value;
  try {
    await updateTaskStatus(taskId, status);
    setNotice("Task updated.", "success");
    await loadTasks();
  } catch (error) {
    setNotice(`Could not update task: ${error.message}`, "error");
  }
});

function setDefaultDueDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const iso = local.toISOString();
  if (dueDateInput) {
    dueDateInput.value = iso.split("T")[0];
  }
  if (dueTimeInput) {
    dueTimeInput.value = iso.slice(11, 16);
  }
}

syncStatusDropdown();
setDefaultDueDateTime();

setSortIndicators();
loadTasks();
