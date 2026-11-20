
/* ==========================================
   MEMORA AI
   Local AI-style assistant with persistent memory
   No API / No Firebase
========================================== */

const $ = id => document.getElementById(id);

const DB_NAME = "MemoraLocalAI";
const DB_VERSION = 1;

let db;
let messages = [];
let currentChatId = null;
let activeCategory = "all";
let editingMemoryId = null;
let isThinking = false;

/* ==========================================
   DATABASE
========================================== */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("memories")) {
        const store = database.createObjectStore("memories", {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("category", "category", {
          unique: false
        });
      }

      if (!database.objectStoreNames.contains("chats")) {
        database.createObjectStore("chats", {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function dbStore(name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = dbStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function getItem(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = dbStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function putItem(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = dbStore(storeName, "readwrite").put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function addItem(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = dbStore(storeName, "readwrite").add(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteItem(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = dbStore(storeName, "readwrite").delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const req = dbStore(storeName, "readwrite").clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ==========================================
   HELPERS
========================================== */

function uid() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function cleanText(text) {
  return String(text || "").trim();
}

function tokenize(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(word => word.length > 1);
}

function dateText(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function categoryName(category) {
  const names = {
    personal: "Personal",
    projects: "Projects",
    preferences: "Preferences",
    facts: "Facts",
    notes: "Notes"
  };

  return names[category] || "Notes";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

/* ==========================================
   MEMORY ENGINE
========================================== */

async function saveMemory(title, content, category = "notes") {
  title = cleanText(title);
  content = cleanText(content);

  if (!title || !content) return false;

  const memories = await getAll("memories");

  // Avoid duplicates
  const duplicate = memories.find(memory =>
    memory.title.toLowerCase() === title.toLowerCase() &&
    memory.content.toLowerCase() === content.toLowerCase()
  );

  if (duplicate) {
    showToast("This memory already exists.");
    return false;
  }

  const record = {
    title,
    content,
    category,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: tokenize(title + " " + content).slice(0, 15)
  };

  await addItem("memories", record);
  await updateMemoryUI();

  return true;
}

async function updateMemory(id, title, content, category) {
  const old = await getItem("memories", id);
  if (!old) return;

  await putItem("memories", {
    ...old,
    title: cleanText(title),
    content: cleanText(content),
    category,
    updatedAt: Date.now(),
    tags: tokenize(title + " " + content).slice(0, 15)
  });

  await updateMemoryUI();
}

async function removeMemory(id) {
  await deleteItem("memories", id);
  await updateMemoryUI();
  showToast("Memory deleted.");
}

async function searchMemories(query) {
  const memories = await getAll("memories");
  const terms = tokenize(query);

  if (!terms.length) return memories;

  return memories
    .map(memory => {
      const searchable = tokenize(
        memory.title + " " +
        memory.content + " " +
        (memory.tags || []).join(" ")
      );

      let score = 0;

      terms.forEach(term => {
        searchable.forEach(word => {
          if (word === term) score += 4;
          else if (word.includes(term) || term.includes(word)) score += 1;
        });
      });

      return { memory, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.memory);
}

async function getMemoryContext(query) {
  const found = await searchMemories(query);

  return found.slice(0, 6);
}

/* ==========================================
   AUTO MEMORY DETECTION
========================================== */

async function autoSaveFromMessage(text) {
  const message = cleanText(text);
  const lower = message.toLowerCase();

  // Explicit save command
  const rememberPatterns = [
    /^remember that\s+(.+)/i,
    /^remember this:\s*(.+)/i,
    /^save this:\s*(.+)/i,
    /^save to memory:\s*(.+)/i,
    /^memora remember:\s*(.+)/i
  ];

  for (const pattern of rememberPatterns) {
    const match = message.match(pattern);

    if (match) {
      const content = match[1].trim();
      const title = makeTitle(content);

      await saveMemory(title, content, detectCategory(content));
      return {
        saved: true,
        content
      };
    }
  }

  // Detect name
  const nameMatch = message.match(
    /\b(?:my name is|call me|i am called)\s+([a-z][a-z0-9 _-]{1,40})/i
  );

  if (nameMatch) {
    const name = nameMatch[1].trim().replace(/[.!?]+$/, "");

    await saveMemory(
      "User name",
      "The user's name is " + name,
      "personal"
    );
  }

  // Detect project
  const projectMatch = message.match(
    /\bmy project is called\s+(.+)/i
  );

  if (projectMatch) {
    const project = projectMatch[1].trim().replace(/[.!?]+$/, "");

    await saveMemory(
      "Project name",
      "The user's project is called " + project,
      "projects"
    );
  }

  // Detect preference
  const preferenceMatch = message.match(
    /\bi prefer\s+(.+)/i
  );

  if (preferenceMatch) {
    const preference = preferenceMatch[1].trim().replace(/[.!?]+$/, "");

    await saveMemory(
      "User preference",
      "The user prefers " + preference,
      "preferences"
    );
  }

  // Likes
  const likesMatch = message.match(
    /\bi like\s+(.+)/i
  );

  if (likesMatch && !lower.includes("like to know")) {
    const likes = likesMatch[1].trim().replace(/[.!?]+$/, "");

    await saveMemory(
      "Things the user likes",
      "The user likes " + likes,
      "preferences"
    );
  }

  // Dislikes
  const dislikeMatch = message.match(
    /\bi don't like\s+(.+)/i
  );

  if (dislikeMatch) {
    const dislike = dislikeMatch[1].trim().replace(/[.!?]+$/, "");

    await saveMemory(
      "Things the user dislikes",
      "The user does not like " + dislike,
      "preferences"
    );
  }

  // "My goal is..."
  const goalMatch = message.match(
    /\bmy goal is\s+(.+)/i
  );

  if (goalMatch) {
    const goal = goalMatch[1].trim().replace(/[.!?]+$/, "");

    await saveMemory(
      "User goal",
      "The user's goal is " + goal,
      "personal"
    );
  }
}

function detectCategory(text) {
  const lower = text.toLowerCase();

  if (/project|app|game|website|build|develop|coding/.test(lower))
    return "projects";

  if (/prefer|like|dislike|favorite|favourite/.test(lower))
    return "preferences";

  if /^(my name|call me|i am called)/i.test(text)
    return "personal";

  return "notes";
}

function makeTitle(text) {
  const words = cleanText(text).split(/\s+/).slice(0, 7);
  return words.join(" ").slice(0, 55);
}

/* ==========================================
   CHAT STORAGE
========================================== */

function newChat() {
  messages = [];
  currentChatId = uid();

  renderWelcome();
  $("quickActions").style.display = "flex";

  return currentChatId;
}

async function saveCurrentChat() {
  if (!currentChatId || !messages.length) return;

  const firstUserMessage = messages.find(m => m.role === "user");

  const chat = {
    id: currentChatId,
    title: firstUserMessage
      ? firstUserMessage.text.slice(0, 65)
      : "New conversation",
    messages,
    updatedAt: Date.now()
  };

  await putItem("chats", chat);
}

async function loadChat(id) {
  const chat = await getItem("chats", id);
  if (!chat) return;

  messages = chat.messages || [];
  currentChatId = chat.id;

  $("messages").innerHTML = "";
  $("quickActions").style.display = "none";

  messages.forEach(message => {
    renderMessage(message.role, message.text, false);
  });

  showView("chat");
}

async function renderHistory() {
  const chats = (await getAll("chats"))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const container = $("historyList");
  container.innerHTML = "";

  $("historyEmpty").hidden = chats.length > 0;

  chats.forEach(chat => {
    const last = chat.messages?.[chat.messages.length - 1];

    const card = document.createElement("div");
    card.className = "history-card";

    card.innerHTML = `
      <div class="history-info">
        <h3>${escapeHTML(chat.title || "Conversation")}</h3>
        <p>${escapeHTML(last?.text || "No messages")} ·
        ${dateText(chat.updatedAt)}</p>
      </div>
      <button data-open="${escapeHTML(chat.id)}">Open</button>
      <button data-delete="${escapeHTML(chat.id)}">Delete</button>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll("[data-open]").forEach(btn => {
    btn.onclick = () => loadChat(btn.dataset.open);
  });

  container.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = async () => {
      await deleteItem("chats", btn.dataset.delete);
      renderHistory();
      showToast("Conversation deleted.");
    };
  });
}

/* ==========================================
   CHAT RENDERING
========================================== */

function renderWelcome() {
  $("messages").innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">✦</div>
      <h1>What can I help you with?</h1>
      <p>
        I'm Memora, your local assistant. I can help with ideas,
        organize projects, answer basic questions, and remember
        information you choose to save.
      </p>
    </div>
  `;
}

function renderMessage(role, text, animate = true) {
  if ($("messages").querySelector(".welcome")) {
    $("messages").innerHTML = "";
  }

  const row = document.createElement("div");
  row.className = "message " + (role === "user" ? "user" : "ai");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "●" : "✦";

  const bubble = document.createElement("div");
  bubble.className = "message-content";

  // Basic safe formatting
  bubble.innerHTML = formatText(text);

  if (role === "user") {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  if (animate) {
    row.style.animation = "fadeIn .2s ease";
  }

  $("messages").appendChild(row);
  scrollToBottom();
}

function formatText(text) {
  const safe = escapeHTML(text);

  return safe
    .split(/\n/)
    .map(line => {
      if (/^\s*[-*]\s+/.test(line)) {
        return "<p>• " + line.replace(/^\s*[-*]\s+/, "") + "</p>";
      }

      return line ? "<p>" + line + "</p>" : "<p></p>";
    })
    .join("");
}

function scrollToBottom() {
  const area = $("chatScroll");
  area.scrollTop = area.scrollHeight;
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "message ai";
  row.id = "typingIndicator";

  row.innerHTML = `
    <div class="avatar">✦</div>
    <div class="message-content typing">Memora is thinking...</div>
  `;

  $("messages").appendChild(row);
  scrollToBottom();
}

function removeTyping() {
  $("typingIndicator")?.remove();
}

/* ==========================================
   LOCAL RESPONSE ENGINE
========================================== */

async function generateResponse(userText) {
  const text = cleanText(userText);
  const lower = text.toLowerCase();

  // Explicit memory command
  if (/^(remember that|remember this:|save this:|save to memory:|memora remember:)/i.test(text)) {
    return "I've processed your memory request. I'll save the information to your local Memory Library when it is valid. You can review it anytime in Memory Library.";
  }

  // Memory questions
  if (
    /what do you remember|show my memories|my saved memories|what have you saved|memory list/i.test(lower)
  ) {
    const memories = await getAll("memories");

    if (!memories.length) {
      return "Your memory library is empty right now. Tell me something like 'Remember that my project is called Farm Quest' and I'll save it for future conversations.";
    }

    return "Here are some things stored in your memory:\n\n" +
      memories.slice(0, 10)
        .map(m => "• " + m.title + ": " + m.content)
        .join("\n\n") +
      "\n\nYou can see all your saved memories in the Memory Library.";
  }

  // Recall/search specific memory
  if (
    /what do you know about|do you remember|search my memory|find in memory|remember my/i.test(lower)
  ) {
    const query = text
      .replace(/what do you know about/i, "")
      .replace(/do you remember/i, "")
      .replace(/search my memory/i, "")
      .replace(/find in memory/i, "")
      .replace(/remember my/i, "")
      .trim();

    const found = await searchMemories(query);

    if (!found.length) {
      return "I couldn't find a matching memory. Try a different keyword, or add that information to my Memory Library.";
    }

    return "I found these related memories:\n\n" +
      found.slice(0, 5)
        .map(m => "• " + m.title + ": " + m.content)
        .join("\n\n");
  }

  // Help
  if (/^(help|what can you do|commands|how do you work)\b/i.test(lower)) {
    return `Here's what I can do locally:

• Chat and answer basic questions
• Remember facts and preferences
• Save project details
• Search my memory
• Organize your ideas
• Generate writing and creative ideas
• Keep conversation history

Memory commands:
• Remember that [fact]
• What do you remember about me?
• Search my memory for [topic]
• Open Memory Library to edit or delete memories

I'm a local response engine, not a cloud AI model, so complex reasoning is limited.`;
  }

  // Time and date
  if (/what time|current time|what date|today's date|today is/i.test(lower)) {
    return "Your device's current date and time is " +
      new Date().toLocaleString() +
      ".";
  }

  // Greetings
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(lower)) {
    const memories = await getAll("memories");
    return "Hello! I'm Memora, your local AI-style assistant.\n\n" +
      "I currently have " + memories.length +
      " saved " + (memories.length === 1 ? "memory" : "memories") +
      ". You can ask me questions, share ideas, or tell me something to remember.";
  }

  // Thanks
  if (/thank you|thanks|thank you so much/i.test(lower)) {
    return "You're welcome! I'm here to help you organize your ideas, remember important information, and work through projects.";
  }

  // Ideas
  if (/give me an idea|creative idea|inspire me|random idea/i.test(lower)) {
    const ideas = [
      "Create a personal project tracker that turns big goals into small daily tasks.",
      "Build an offline journal that saves ideas and automatically organizes them by topic.",
      "Create a simple farming simulation where crops grow even while the player is away.",
      "Build a website where users create numbered pages containing their own mini communities.",
      "Create a short-story generator that builds episodes around lessons and choices.",
      "Build a memory-based assistant that organizes project notes and searches them instantly."
    ];

    return "Here's an idea:\n\n✦ " +
      ideas[Math.floor(Math.random() * ideas.length)] +
      "\n\nYou can tell me to expand it into a complete project plan.";
  }

  // Project help
  if (/organize my projects|manage my projects|my projects/i.test(lower)) {
    const memories = await searchMemories("project app game website development");

    if (memories.length) {
      return "I found some project-related memories:\n\n" +
        memories.slice(0, 8)
          .map(m => "• " + m.title + ": " + m.content)
          .join("\n\n") +
        "\n\nI can help you organize these into tasks, milestones, and plans.";
    }

    return "Let's organize your projects. Tell me your project names and goals, and I'll help you structure them into ideas, features, and tasks. You can also begin with 'Remember that my project is...'.";
  }

  // Writing
  if (/write|create a story|make a story|essay|script|youtube|description|caption/i.test(lower)) {
    return "I can help create a draft using local templates and simple language patterns.\n\nTell me the topic, desired length, and style. For more complex writing, remember that my offline response engine has limited creativity and reasoning compared with a full language model.";
  }

  // Math
  if (/calculate|what is \d|how much is \d/i.test(lower)) {
    const match = text.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)/);

    if (match) {
      const a = Number(match[1]);
      const b = Number(match[3]);
      const op = match[2];
      let result;

      if (op === "+") result = a + b;
      if (op === "-") result = a - b;
      if (op === "*") result = a * b;
      if (op === "/") result = b !== 0 ? a / b : "Cannot divide by zero";

      return "The answer is " + result + ".";
    }
  }

  // Memory-aware response
  const related = await getMemoryContext(text);

  if (related.length) {
    return "I found some memories that may be relevant:\n\n" +
      related.slice(0, 3)
        .map(m => "• " + m.title + ": " + m.content)
        .join("\n\n") +
      "\n\nI can use these as context, but my local engine doesn't have full human-like reasoning. Tell me more about what you'd like to do and I'll help using the information available.";
  }

  // Generic fallback
  const replies = [
    "I understand what you're asking. I can help you explore the idea using my local knowledge and memory system. Could you break it into a smaller question or tell me what outcome you want?",
    "Let's work through that. I can organize information, suggest steps, and connect it to anything you've saved in memory, though my offline intelligence is limited.",
    "I can help you plan this. Tell me a little more about your goal, and I'll try to organize it into a useful answer.",
    "That's an interesting topic. I can help you brainstorm, organize your ideas, or turn your request into a step-by-step plan."
  ];

  return replies[Math.floor(Math.random() * replies.length)];
}

/* ==========================================
   SEND MESSAGE
========================================== */

async function sendMessage(text) {
  text = cleanText(text);

  if (!text || isThinking) return;

  isThinking = true;
  $("sendBtn").disabled = true;

  if (!currentChatId) currentChatId = uid();

  messages.push({
    role: "user",
    text,
    timestamp: Date.now()
  });

  renderMessage("user", text);
  $("quickActions").style.display = "none";

  // Save explicit and detected memories
  await autoSaveFromMessage(text);

  showTyping();

  // Local processing delay
  const response = await generateResponse(text);

  await new Promise(resolve => setTimeout(resolve, 350));

  removeTyping();

  messages.push({
    role: "assistant",
    text: response,
    timestamp: Date.now()
  });

  renderMessage("assistant", response);

  await saveCurrentChat();
  await renderHistory();

  isThinking = false;
  $("sendBtn").disabled = false;
  $("messageInput").focus();
}

/* ==========================================
   MEMORY UI
========================================== */

async function updateMemoryUI() {
  const memories = await getAll("memories");

  $("memoryCount").textContent = memories.length;
  $("totalMemories").textContent = memories.length;

  const categories = new Set(memories.map(m => m.category));
  $("categoryCount").textContent = categories.size;

  renderMemories(memories);
}

function renderMemories(memories) {
  const container = $("memoryList");
  const search = cleanText($("memorySearch").value).toLowerCase();

  const filtered = memories.filter(memory => {
    const categoryMatches =
      activeCategory === "all" ||
      memory.category === activeCategory;

    const searchMatches =
      !search ||
      memory.title.toLowerCase().includes(search) ||
      memory.content.toLowerCase().includes(search) ||
      (memory.tags || []).some(tag => tag.includes(search));

    return categoryMatches && searchMatches;
  });

  container.innerHTML = "";

  $("memoryEmpty").hidden = filtered.length > 0;

  filtered.sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(memory => {
      const card = document.createElement("article");
      card.className = "memory-card";

      card.innerHTML = `
        <div class="memory-meta">
          <span>${escapeHTML(categoryName(memory.category))}</span>
          <span>${dateText(memory.updatedAt)}</span>
        </div>

        <h3>${escapeHTML(memory.title)}</h3>
        <p>${escapeHTML(memory.content)}</p>

        <div class="memory-actions">
          <button data-edit="${memory.id}">Edit</button>
          <button data-remove="${memory.id}">Delete</button>
        </div>
      `;

      container.appendChild(card);
    });

  container.querySelectorAll("[data-edit]").forEach(button => {
    button.onclick = () => openEditMemory(Number(button.dataset.edit));
  });

  container.querySelectorAll("[data-remove]").forEach(button => {
    button.onclick = async () => {
      if (confirm("Delete this memory?")) {
        await removeMemory(Number(button.dataset.remove));
      }
    };
  });
}

/* ==========================================
   MEMORY MODAL
========================================== */

function openAddMemory() {
  editingMemoryId = null;

  $("modalTitle").textContent = "Add memory";
  $("memoryTitle").value = "";
  $("memoryContent").value = "";
  $("memoryCategory").value = "notes";
  $("memoryModal").classList.add("open");
}

async function openEditMemory(id) {
  const memory = await getItem("memories", id);
  if (!memory) return;

  editingMemoryId = id;

  $("modalTitle").textContent = "Edit memory";
  $("memoryTitle").value = memory.title;
  $("memoryContent").value = memory.content;
  $("memoryCategory").value = memory.category;
  $("memoryModal").classList.add("open");
}

function closeMemoryModal() {
  $("memoryModal").classList.remove("open");
  editingMemoryId = null;
}

async function saveMemoryModal() {
  const title = cleanText($("memoryTitle").value);
  const content = cleanText($("memoryContent").value);
  const category = $("memoryCategory").value;

  if (!title || !content) {
    showToast("Please fill in both fields.");
    return;
  }

  if (editingMemoryId !== null) {
    await updateMemory(editingMemoryId, title, content, category);
    showToast("Memory updated.");
  } else {
    const saved = await saveMemory(title, content, category);
    if (saved) showToast("Memory saved.");
  }

  closeMemoryModal();
}

/* ==========================================
   VIEW NAVIGATION
========================================== */

function showView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));

  const target = $(view + "View");
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  const titles = {
    chat: "Memora AI",
    memory: "Memory Library",
    history: "Chat History"
  };

  $("pageTitle").textContent = titles[view] || "Memora AI";

  if (view === "memory") updateMemoryUI();
  if (view === "history") renderHistory();

  $("sidebar").classList.remove("open");
}

/* ==========================================
   EXPORT / IMPORT
========================================== */

async function exportMemory() {
  const memories = await getAll("memories");
  const chats = await getAll("chats");

  const data = {
    app: "Memora AI",
    version: 1,
    exportedAt: new Date().toISOString(),
    memories,
    chats
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "memora-backup-" +
    new Date().toISOString().slice(0, 10) + ".json";

  link.click();
  URL.revokeObjectURL(url);

  showToast("Backup exported.");
}

async function importMemory(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data.memories) &&
        !Array.isArray(data.chats)) {
      throw new Error("Invalid backup");
    }

    if (!confirm("Import this backup? Existing data will be kept."))
      return;

    for (const memory of (data.memories || [])) {
      const { id, ...record } = memory;
      await addItem("memories", record);
    }

    for (const chat of (data.chats || [])) {
      await putItem("chats", chat);
    }

    await updateMemoryUI();
    await renderHistory();

    showToast("Backup imported successfully.");
  } catch (error) {
    console.error(error);
    showToast("Import failed. Check your JSON file.");
  }
}

/* ==========================================
   EVENTS
========================================== */

function setupEvents() {
  $("sendBtn").onclick = () => {
    const input = $("messageInput");
    const text = input.value;

    input.value = "";
    input.style.height = "auto";

    sendMessage(text);
  };

  $("messageInput").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("sendBtn").click();
    }
  });

  $("messageInput").addEventListener("input", event => {
    event.target.style.height = "auto";
    event.target.style.height =
      Math.min(event.target.scrollHeight, 150) + "px";
  });

  $("newChatBtn").onclick = () => {
    newChat();
    showView("chat");
  };

  $("clearChatBtn").onclick = () => {
    if (!messages.length) {
      newChat();
      return;
    }

    if (confirm("Start a new conversation? The old chat will remain in history.")) {
      newChat();
    }
  };

  document.querySelectorAll(".nav-btn[data-view]").forEach(button => {
    button.onclick = () => showView(button.dataset.view);
  });

  document.querySelectorAll(".quick-actions button").forEach(button => {
    button.onclick = () => sendMessage(button.dataset.prompt);
  });

  $("memorySearch").oninput = updateMemoryUI;

  $("categoryFilters").onclick = event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    activeCategory = button.dataset.category;

    document.querySelectorAll(".filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn === button);
    });

    updateMemoryUI();
  };

  $("addMemoryBtn").onclick = openAddMemory;
  $("closeModalBtn").onclick = closeMemoryModal;
  $("cancelModalBtn").onclick = closeMemoryModal;
  $("saveMemoryBtn").onclick = saveMemoryModal;

  $("memoryModal").onclick = event => {
    if (event.target === $("memoryModal")) closeMemoryModal();
  };

  $("themeBtn").onclick = () => {
    document.body.classList.toggle("light");

    const light = document.body.classList.contains("light");
    localStorage.setItem("memora-theme", light ? "light" : "dark");
  };

  $("menuBtn").onclick = () => {
    $("sidebar").classList.toggle("open");
  };

  $("exportBtn").onclick = exportMemory;

  $("importBtn").onclick = () => $("importFile").click();

  $("importFile").onchange = event => {
    importMemory(event.target.files[0]);
    event.target.value = "";
  };
}

/* ==========================================
   INITIALIZATION
========================================== */

async function init() {
  try {
    await openDB();

    // Restore theme
    if (localStorage.getItem("memora-theme") === "light") {
      document.body.classList.add("light");
    }

    setupEvents();
    newChat();

    await updateMemoryUI();
    await renderHistory();

  } catch (error) {
    console.error("Memora initialization error:", error);

    $("messages").innerHTML = `
      <div class="welcome">
        <h1>Memory unavailable</h1>
        <p>Your browser could not open local database storage.
        Try opening Memora in a regular browser.</p>
      </div>
    `;
  }
}

init();
