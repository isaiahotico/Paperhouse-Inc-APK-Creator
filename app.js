
const STORAGE_KEY = "taskdesk_local_v1";

const defaultData = {
  username: "User",
  tasks: [
    {
      id: 1,
      title: "Read a learning article",
      description: "Read an article and write down one thing you learned.",
      url: "",
      xp: 20,
      completed: false,
      createdAt: Date.now()
    },
    {
      id: 2,
      title: "Daily reflection",
      description: "Write a short reflection about your day.",
      url: "",
      xp: 15,
      completed: false,
      createdAt: Date.now()
    },
    {
      id: 3,
      title: "Explore a new topic",
      description: "Choose a topic and learn something new.",
      url: "",
      xp: 30,
      completed: false,
      createdAt: Date.now()
    }
  ]
};

let data;

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    data = saved ? JSON.parse(saved) : structuredClone(defaultData);

    if (!data || !Array.isArray(data.tasks)) {
      data = structuredClone(defaultData);
    }
  } catch (error) {
    data = structuredClone(defaultData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getXP() {
  return data.tasks
    .filter(task => task.completed)
    .reduce((sum, task) => sum + Number(task.xp || 0), 0);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function validURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function renderStats() {
  const completed = data.tasks.filter(t => t.completed).length;

  document.getElementById("totalTasks").textContent = data.tasks.length;
  document.getElementById("completedTasks").textContent = completed;
  document.getElementById("totalXP").textContent = getXP();
  document.getElementById("usernameDisplay").textContent = data.username;
  document.getElementById("profileName").value = data.username;
}

function taskHTML(task) {
  const safeTitle = escapeHTML(task.title);
  const safeDescription = escapeHTML(task.description);

  let linkButton = "";

  if (task.url && validURL(task.url)) {
    linkButton = `
      <button class="open-btn"
        data-action="open"
        data-id="${task.id}">
        Open Link ↗
      </button>`;
  }

  return `
    <div class="task ${task.completed ? "completed" : ""}">
      <h4>${safeTitle}</h4>
      <p>${safeDescription || "No description provided."}</p>
      <small>XP: ${Number(task.xp) || 0}</small>

      ${task.completed
        ? `<p class="completed-label">✓ Completed</p>`
        : ""}

      <div class="task-buttons">
        ${linkButton}

        ${!task.completed ? `
          <button class="done-btn"
            data-action="complete"
            data-id="${task.id}">
            Mark Complete
          </button>
        ` : ""}

        <button class="delete-btn"
          data-action="delete"
          data-id="${task.id}">
          Delete
        </button>
      </div>
    </div>
  `;
}

function renderTasks() {
  const taskList = document.getElementById("taskList");

  if (!data.tasks.length) {
    taskList.innerHTML = `<div class="empty">No tasks yet. Add your first task.</div>`;
    return;
  }

  taskList.innerHTML = data.tasks.map(taskHTML).join("");
}

function renderRecent() {
  const container = document.getElementById("recentTasks");

  const recent = [...data.tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  if (!recent.length) {
    container.innerHTML = `<div class="empty">Nothing here yet.</div>`;
    return;
  }

  container.innerHTML = recent.map(task => `
    <div class="task">
      <h4>${escapeHTML(task.title)}</h4>
      <p>${task.completed ? "✓ Completed" : "○ Pending"}</p>
    </div>
  `).join("");
}

function renderHistory() {
  const container = document.getElementById("historyList");
  const completed = data.tasks.filter(task => task.completed);

  if (!completed.length) {
    container.innerHTML = `<div class="empty">No completed tasks yet.</div>`;
    return;
  }

  container.innerHTML = completed.map(task => `
    <div class="task completed">
      <h4>${escapeHTML(task.title)}</h4>
      <p>${escapeHTML(task.description)}</p>
      <small>XP: ${Number(task.xp) || 0}</small>
      <p class="completed-label">✓ Completed</p>
    </div>
  `).join("");
}

function renderAll() {
  renderStats();
  renderTasks();
  renderRecent();
  renderHistory();
}

// Navigation
document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => {
    const page = button.dataset.page;

    document.querySelectorAll(".nav").forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");

    document.querySelectorAll(".page").forEach(section => {
      section.classList.add("hidden");
    });

    document.getElementById(page + "Page").classList.remove("hidden");

    const titles = {
      dashboard: "Dashboard",
      tasks: "Tasks",
      history: "History",
      profile: "Profile"
    };

    document.getElementById("pageTitle").textContent =
      titles[page] || "TaskDesk";
  });
});

// Show task form
document.getElementById("showAddTask").addEventListener("click", () => {
  document.getElementById("addTaskForm").classList.remove("hidden");
});

document.getElementById("cancelTask").addEventListener("click", () => {
  document.getElementById("addTaskForm").classList.add("hidden");
  clearForm();
});

function clearForm() {
  document.getElementById("taskName").value = "";
  document.getElementById("taskDescription").value = "";
  document.getElementById("taskURL").value = "";
  document.getElementById("taskXP").value = "20";
}

// Add task
document.getElementById("saveTask").addEventListener("click", () => {
  const title = document.getElementById("taskName").value.trim();
  const description = document.getElementById("taskDescription").value.trim();
  const url = document.getElementById("taskURL").value.trim();
  const xp = Number(document.getElementById("taskXP").value);

  if (!title) {
    alert("Please enter a task title.");
    return;
  }

  if (url && !validURL(url)) {
    alert("Please enter a valid HTTP or HTTPS link.");
    return;
  }

  if (!Number.isFinite(xp) || xp < 0 || xp > 1000) {
    alert("XP must be between 0 and 1000.");
    return;
  }

  const task = {
    id: Date.now(),
    title,
    description,
    url,
    xp,
    completed: false,
    createdAt: Date.now()
  };

  data.tasks.unshift(task);
  saveData();
  renderAll();
  clearForm();

  document.getElementById("addTaskForm").classList.add("hidden");
});

// Task actions
document.getElementById("taskList").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const task = data.tasks.find(t => t.id === id);

  if (!task) return;

  if (action === "open") {
    if (!validURL(task.url)) {
      alert("This task has no valid link.");
      return;
    }

    window.open(task.url, "_blank", "noopener,noreferrer");
  }

  if (action === "complete") {
    if (task.completed) return;

    task.completed = true;
    task.completedAt = Date.now();

    saveData();
    renderAll();
  }

  if (action === "delete") {
    if (!confirm("Delete this task?")) return;

    data.tasks = data.tasks.filter(t => t.id !== id);
    saveData();
    renderAll();
  }
});

// Save profile
document.getElementById("saveProfile").addEventListener("click", () => {
  const username = document.getElementById("profileName").value.trim();

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  data.username = username.slice(0, 30);
  saveData();
  renderAll();

  alert("Profile saved locally!");
});

// Start
loadData();
renderAll();
