/**
 * LocalGPT - 100% Offline, Self-Learning AI Assistant
 * Powered exclusively by LocalStorage, Pattern Extraction, and Knowledge Graph.
 */

// ==========================================
// 1. LOCAL STORAGE & PERSISTENCE MANAGER
// ==========================================
class StorageManager {
  static KEYS = {
    CHATS: 'localgpt_chats_v1',
    ACTIVE_CHAT: 'localgpt_active_chat_v1',
    KNOWLEDGE: 'localgpt_knowledge_v1',
    CORRECTIONS: 'localgpt_corrections_v1'
  };

  static getChats() {
    return JSON.parse(localStorage.getItem(this.KEYS.CHATS) || '[]');
  }

  static saveChats(chats) {
    localStorage.setItem(this.KEYS.CHATS, JSON.stringify(chats));
  }

  static getActiveChatId() {
    return localStorage.getItem(this.KEYS.ACTIVE_CHAT);
  }

  static setActiveChatId(id) {
    localStorage.setItem(this.KEYS.ACTIVE_CHAT, id);
  }

  static getKnowledge() {
    return JSON.parse(localStorage.getItem(this.KEYS.KNOWLEDGE) || '[]');
  }

  static saveKnowledge(knowledge) {
    localStorage.setItem(this.KEYS.KNOWLEDGE, JSON.stringify(knowledge));
  }

  static getCorrections() {
    return JSON.parse(localStorage.getItem(this.KEYS.CORRECTIONS) || '{}');
  }

  static saveCorrections(corrections) {
    localStorage.setItem(this.KEYS.CORRECTIONS, JSON.stringify(corrections));
  }

  static calculateStorageBytes() {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += (localStorage[key].length + key.length) * 2;
      }
    }
    return (total / 1024).toFixed(1); // KB
  }
}

// ==========================================
// 2. SELF-LEARNING & COGNITIVE ENGINE
// ==========================================
class LocalAIEngine {
  constructor() {
    this.knowledge = StorageManager.getKnowledge();
    this.corrections = StorageManager.getCorrections();
    
    // Seed default baseline concepts if pristine
    if (this.knowledge.length === 0) {
      this.seedInitialKnowledge();
    }
  }

  seedInitialKnowledge() {
    const defaults = [
      { key: "creator", value: "You created me to run purely in the browser using local storage.", tags: ["who are you", "creator", "made you"] },
      { key: "local storage", value: "LocalStorage is a client-side key-value database allowing up to 5-10MB data retention in browser.", tags: ["local storage", "what is localstorage"] },
      { key: "javascript", value: "JavaScript is a lightweight, interpreted, object-oriented language with first-class functions.", tags: ["javascript", "js"] }
    ];
    this.knowledge = defaults;
    StorageManager.saveKnowledge(this.knowledge);
  }

  // Auto-learning: extracts facts from statements like:
  // "Remember that X is Y", "Learn: X = Y", "My name is John"
  extractAndLearn(prompt) {
    const clean = prompt.trim();
    let learned = null;

    // Pattern 1: Learn: [Key] = [Value] or [Key] means [Value]
    const learnMatch = clean.match(/^learn:\s*(.+?)\s*(?:=|means|is)\s*(.+)$/i);
    if (learnMatch) {
      learned = this.recordFact(learnMatch[1], learnMatch[2]);
    }

    // Pattern 2: Remember that [Key] is [Value]
    const rememberMatch = clean.match(/^remember(?:\s+that)?\s+(.+?)\s+(?:is|are|=|was)\s+(.+)$/i);
    if (rememberMatch) {
      learned = this.recordFact(rememberMatch[1], rememberMatch[2]);
    }

    // Pattern 3: User identity / Personal preferences ("My [Key] is [Value]")
    const myMatch = clean.match(/^my\s+([a-zA-Z\s]+?)\s+(?:is|are)\s+(.+)$/i);
    if (myMatch) {
      learned = this.recordFact(`user's ${myMatch[1].trim()}`, myMatch[2].trim());
    }

    return learned;
  }

  recordFact(key, value) {
    const normalizedKey = key.toLowerCase().trim();
    const existingIndex = this.knowledge.findIndex(k => k.key.toLowerCase() === normalizedKey);
    
    const entry = {
      key: key.trim(),
      value: value.trim(),
      tags: normalizedKey.split(/\s+/),
      learnedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.knowledge[existingIndex] = entry;
    } else {
      this.knowledge.push(entry);
    }

    StorageManager.saveKnowledge(this.knowledge);
    return entry;
  }

  // Teach specific manual correction from 👍 / 👎 or "Actually, ..."
  teachCorrection(query, preferredAnswer) {
    const key = query.toLowerCase().trim();
    this.corrections[key] = preferredAnswer.trim();
    StorageManager.saveCorrections(this.corrections);
  }

  // Answer generator synthesizing internal rules + learned memory
  generateResponse(prompt) {
    const cleanPrompt = prompt.trim();
    const lower = cleanPrompt.toLowerCase();

    // 1. Check direct learned corrections
    if (this.corrections[lower]) {
      return {
        text: this.corrections[lower],
        source: 'learned-correction'
      };
    }

    // 2. Check active learning triggers
    const learnedFact = this.extractAndLearn(cleanPrompt);
    if (learnedFact) {
      return {
        text: `Got it! I've committed this to my local memory:\n\n**${learnedFact.key}** ➔ *"${learnedFact.value}"*\n\nYou can ask me about this at any time.`,
        source: 'learning-acknowledged'
      };
    }

    // 3. Search learned Knowledge Graph (Semantic & Keyword overlap)
    const matchedKnowledge = this.queryKnowledge(lower);
    if (matchedKnowledge) {
      return {
        text: `Based on what I have learned:\n\n${matchedKnowledge.value}`,
        source: 'knowledge-retrieval'
      };
    }

    // 4. Fallback Reasoning / Conversational Heuristics
    return {
      text: this.synthesizeConversationalAnswer(cleanPrompt, lower),
      source: 'synthesizer'
    };
  }

  queryKnowledge(query) {
    const tokens = query.toLowerCase().replace(/[^\w\s]/gi, '').split(/\s+/);
    
    // Exact or partial key match
    let bestMatch = null;
    let highestScore = 0;

    for (const item of this.knowledge) {
      let score = 0;
      const itemKey = item.key.toLowerCase();
      
      // Direct substring match
      if (query.includes(itemKey) || itemKey.includes(query)) {
        score += 5;
      }

      // Token overlap
      for (const token of tokens) {
        if (token.length > 2 && item.tags.includes(token)) {
          score += 2;
        }
        if (item.value.toLowerCase().includes(token)) {
          score += 1;
        }
      }

      if (score > highestScore && score >= 2) {
        highestScore = score;
        bestMatch = item;
      }
    }

    return bestMatch;
  }

  synthesizeConversationalAnswer(raw, lower) {
    // Greetings
    if (/^(hi|hello|hey|greetings|hola)\b/.test(lower)) {
      return "Hello! I am your offline local AI assistant. How can I help you today?";
    }

    // Identity
    if (lower.includes("who are you") || lower.includes("what are you")) {
      return "I am a browser-native AI assistant. I don't send your data to any remote server; everything I know and learn stays inside your browser's LocalStorage.";
    }

    // Math evaluator (Safe parser)
    const mathMatch = raw.match(/^calc(?:ulate)?\s+([0-9\+\-\*\/\.\s\(\)]+)$/i) || raw.match(/^([0-9\+\-\*\/\.\s\(\)]+)$/);
    if (mathMatch) {
      try {
        const sanitized = mathMatch[1].replace(/[^0-9+\-*/.()]/g, '');
        // Evaluate using safe Function constructor without scope
        const result = new Function(`'use strict'; return (${sanitized})`)();
        if (typeof result === 'number' && !isNaN(result)) {
          return `The result is **${result}**.`;
        }
      } catch (e) {
        // Continue to other rules
      }
    }

    // Coding request simulator
    if (lower.includes("code") || lower.includes("function") || lower.includes("reverse a string")) {
      if (lower.includes("reverse") && lower.includes("string")) {
        return "Here is a clean JavaScript function to reverse a string:\n\n
          javascript\nfunction reverseString(str) {\n  return str.split('').reverse().join('');\n}\n\n// Example:\nconsole.log(reverseString('hello')); // 'olleh'\n```";

      }

    }

// Time / Date
if (lower.includes("time") || lower.includes("date") || lower.includes("today")) {
  return `Currently, it is **${new Date().toLocaleString()}** (according to your system clock).`;
}

// If completely unknown, prompt the user to teach it!
return `I don't have enough information about that in my local storage yet.\n\nYou can teach me by typing:\n> **Learn: ${raw} is [your explanation here]**\n\nOnce taught, I will remember it permanently!`;


}

}

// ==========================================

// 3. UI CONTROLLER

// ==========================================

class ChatUI {

  constructor() {

    this.engine = new LocalAIEngine();

    this.chats = StorageManager.getChats();

    this.activeChatId = StorageManager.getActiveChatId();

// DOM Elements
this.chatListEl = document.getElementById('chat-list');
this.messagesContainer = document.getElementById('chat-messages');
this.welcomeScreen = document.getElementById('welcome-screen');
this.chatForm = document.getElementById('chat-form');
this.promptInput = document.getElementById('prompt-input');
this.btnSend = document.getElementById('btn-send');
this.currentChatTitle = document.getElementById('current-chat-title');
this.knowledgeCountBadge = document.getElementById('knowledge-count');

// Sidebar & Modals
this.sidebar = document.getElementById('sidebar');
this.mobileOverlay = document.getElementById('mobile-overlay');
this.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
this.btnNewChat = document.getElementById('btn-new-chat');
this.btnExport = document.getElementById('btn-export');
this.btnClearAll = document.getElementById('btn-clear-all');

// Memory Modal Elements
this.memoryModal = document.getElementById('memory-modal');
this.btnMemoryModal = document.getElementById('btn-memory-modal');
this.btnCloseModal = document.getElementById('btn-close-modal');
this.memoryItemsContainer = document.getElementById('memory-items-container');
this.btnWipeMemory = document.getElementById('btn-wipe-memory');
this.memoryStorageSize = document.getElementById('memory-storage-size');

this.init();


}

init() {

    this.bindEvents();

    this.updateKnowledgeBadge();

// Initialize or restore chat session
if (this.chats.length === 0) {
  this.createNewChat(false);
} else {
  if (!this.activeChatId || !this.chats.find(c => c.id === this.activeChatId)) {
    this.activeChatId = this.chats[0].id;
    StorageManager.setActiveChatId(this.activeChatId);
  }
  this.renderChatList();
  this.renderMessages();
}


}

bindEvents() {

    // Form & Input

    this.chatForm.addEventListener('submit', (e) => {

      e.preventDefault();

      this.handleSendMessage();

    });

this.promptInput.addEventListener('input', () => {
  this.btnSend.disabled = !this.promptInput.value.trim();
  this.autoResizeTextarea();
});this.promptInput.addEventListener('keydown', (e) => {

      if (e.key === 'Enter' && !e.shiftKey) {

        e.preventDefault();

        if (this.promptInput.value.trim()) {

          this.handleSendMessage();

        }

      }

    });

// Keyboard Shortcuts (Ctrl+K = New Chat)
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    this.createNewChat();
  }
});

// Sidebar Controls
this.btnNewChat.addEventListener('click', () => this.createNewChat());
this.btnToggleSidebar.addEventListener('click', () => this.toggleSidebar());
this.mobileOverlay.addEventListener('click', () => this.toggleSidebar(false));

// Sample prompts on welcome screen
document.querySelectorAll('.sample-prompt').forEach(el => {
  el.addEventListener('click', () => {
    const text = el.innerText.replace(/^[\S]+ /, '').trim();
    this.promptInput.value = text;
    this.btnSend.disabled = false;
    this.promptInput.focus();
    this.autoResizeTextarea();
  });
});

// Memory Modal
this.btnMemoryModal.addEventListener('click', () => this.openMemoryModal());
this.btnCloseModal.addEventListener('click', () => this.memoryModal.classList.add('hidden'));
this.btnWipeMemory.addEventListener('click', () => {
  if (confirm('Clear all learned facts? Basic reasoning will remain.')) {
    StorageManager.saveKnowledge([]);
    StorageManager.saveCorrections({});
    this.engine.knowledge = [];
    this.engine.corrections = {};
    this.updateKnowledgeBadge();
    this.openMemoryModal();
  }
});

// Export & Wipe
this.btnExport.addEventListener('click', () => this.exportData());
this.btnClearAll.addEventListener('click', () => {
  if (confirm('This will delete all conversations, knowledge base, and settings permanently. Proceed?')) {
    localStorage.clear();
    location.reload();
  }
});


}

autoResizeTextarea() {

    this.promptInput.style.height = 'auto';

    this.promptInput.style.height = Math.min(this.promptInput.scrollHeight, 180) + 'px';

  }

toggleSidebar(forceState) {

    const isClosed = this.sidebar.classList.contains('-translate-x-full');

    const newState = forceState !== undefined ? forceState : isClosed;

    if (newState) {

      this.sidebar.classList.remove('-translate-x-full');

      this.mobileOverlay.classList.remove('hidden');

    } else {

      this.sidebar.classList.add('-translate-x-full');

      this.mobileOverlay.classList.add('hidden');

    }

  }

// --- Chat Lifecycle Management ---

  createNewChat(switchImmediately = true) {

    const newChat = {

      id: 'chat_' + Date.now(),

      title: 'New Conversation',

      createdAt: new Date().toISOString(),

      messages: []

    };

this.chats.unshift(newChat);
StorageManager.saveChats(this.chats);

if (switchImmediately) {
  this.switchChat(newChat.id);
}
return newChat;


}

switchChat(id) {

    this.activeChatId = id;

    StorageManager.setActiveChatId(id);

    this.renderChatList();

    this.renderMessages();

    this.toggleSidebar(false);

  }getActiveChat() {

    return this.chats.find(c => c.id === this.activeChatId);

  }

deleteChat(id, event) {

    event.stopPropagation();

    this.chats = this.chats.filter(c => c.id !== id);

    StorageManager.saveChats(this.chats);

if (this.chats.length === 0) {
  this.createNewChat();
} else {
  if (this.activeChatId === id) {
    this.switchChat(this.chats[0].id);
  } else {
    this.renderChatList();
  }
}


}

// --- Messaging & Rendering ---

  async handleSendMessage() {

    const content = this.promptInput.value.trim();

    if (!content) return;

const chat = this.getActiveChat();
if (!chat) return;

// Reset input
this.promptInput.value = '';
this.promptInput.style.height = 'auto';
this.btnSend.disabled = true;

// 1. Add User Message
const userMsg = {
  id: 'msg_' + Date.now(),
  role: 'user',
  content: content,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};
chat.messages.push(userMsg);

// Dynamic Title update on first question
if (chat.messages.length === 1) {
  chat.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
}

StorageManager.saveChats(this.chats);
this.renderChatList();
this.renderMessages();

// 2. Prepare AI placeholder for typing stream
const aiMsgId = 'msg_' + (Date.now() + 1);
const aiPlaceholder = {
  id: aiMsgId,
  role: 'assistant',
  content: '',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  source: null
};
chat.messages.push(aiPlaceholder);
this.renderMessages();

// 3. Process AI Brain
const responseData = this.engine.generateResponse(content);

// Stream / Typewriter effect
await this.typewriterEffect(aiMsgId, responseData.text);

// Finalize
aiPlaceholder.content = responseData.text;
aiPlaceholder.source = responseData.source;
StorageManager.saveChats(this.chats);
this.updateKnowledgeBadge();


}

typewriterEffect(msgId, fullText) {

    return new Promise((resolve) => {

      const chat = this.getActiveChat();

      const msgObj = chat.messages.find(m => m.id === msgId);

      const textElement = document.getElementById(text-${msgId});

  let index = 0;
  const speed = Math.max(8, Math.min(25, Math.floor(1000 / fullText.length)));

  const interval = setInterval(() => {
    index++;
    const currentText = fullText.slice(0, index);
    if (msgObj) msgObj.content = currentText;
    if (textElement) {
      textElement.innerHTML = this.formatMarkdown(currentText);
    }
    this.scrollToBottom();

    if (index >= fullText.length) {
      clearInterval(interval);
      resolve();
    }
  }, speed);
});


}

formatMarkdown(text) {

    // Basic Markdown formatting for Code, Bold, Lists

    let parsed = text

      .replace(/&/g, '&')

      .replace(//g, '>');// Code blocks

    parsed = parsed.replace(/([a-z]*)([\s\S]*?)/gi, (match, lang, code) => {

      return <div class="bg-[#181818] rounded-md my-2 p-3 font-mono text-xs overflow-x-auto border border-white/10 text-emerald-300"><code>${code.trim()}</code></div>;

    });

// Inline code
parsed = parsed.replace(/`([^`]+)`/g, '<code class="bg-black/30 text-emerald-400 px-1 py-0.5 rounded font-mono text-xs">$1</code>');

// Bold text
parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
parsed = parsed.replace(/\*(.*?)\*/g, '<em class="italic text-gray-300">$1</em>');

// Line breaks
parsed = parsed.replace(/\n/g, '<br/>');

return parsed;


}

renderChatList() {

    this.chatListEl.innerHTML = '';

    this.chats.forEach(chat => {

      const isActive = chat.id === this.activeChatId;

      const item = document.createElement('div');

      item.className = group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition ${
        isActive ? 'bg-white/10 text-white font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
      };

  item.innerHTML = `
    <div class="flex items-center gap-2 truncate flex-1 mr-2">
      <svg class="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
      <span class="truncate">${chat.title}</span>
    </div>
    <button class="btn-del opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition" title="Delete Chat">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7"/></svg>
    </button>
  `;

  item.addEventListener('click', () => this.switchChat(chat.id));
  item.querySelector('.btn-del').addEventListener('click', (e) => this.deleteChat(chat.id, e));

  this.chatListEl.appendChild(item);
});


}

renderMessages() {

    const chat = this.getActiveChat();

    if (!chat) return;

this.currentChatTitle.textContent = chat.title;

if (chat.messages.length === 0) {
  this.welcomeScreen.classList.remove('hidden');
  this.messagesContainer.querySelectorAll('.message-bubble').forEach(el => el.remove());
  return;
}

this.welcomeScreen.classList.add('hidden');
this.messagesContainer.querySelectorAll('.message-bubble').forEach(el => el.remove());

chat.messages.forEach(msg => {
  const isUser = msg.role === 'user';
  const msgDiv = document.createElement('div');
  msgDiv.className = `message-bubble flex gap-4 text-sm leading-relaxed ${isUser ? 'justify-end' : 'justify-start'}`;Teach the AI using "Remember that..."';

    } else {

      facts.forEach((item, index) => {

        const row = document.createElement('div');

        row.className = 'p-3 rounded-lg bg-black/20 border border-white/5 flex items-start justify-between gap-3 text-xs';

        row.innerHTML = <div>
            <span class="font-bold text-emerald-400 capitalize">${item.key}:</span>
            <p class="text-gray-300 mt-0.5 leading-relaxed">${item.value}</p>
          </div>
          <button class="text-gray-500 hover:text-red-400 transition" title="Delete Fact">&times;</button>;

        row.querySelector('button').addEventListener('click', () => {

          this.engine.knowledge.splice(index, 1);

          StorageManager.saveKnowledge(this.engine.knowledge);

          this.updateKnowledgeBadge();

          this.openMemoryModal();

        });

        this.memoryItemsContainer.appendChild(row);

      });

    }

this.memoryStorageSize.textContent = `StorageManager.calculateStorageBytes() KB used in LocalStorage`;
this.memoryModal.classList.remove('hidden');


}

exportData() {

    const data = {

      chats: this.chats,

      knowledge: this.engine.knowledge,

      corrections: this.engine.corrections,

      exportedAt: new Date().toISOString()

    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = localgpt_backup_{new Date().toISOString().slice(0, 10)}.json;

    a.click();

    URL.revokeObjectURL(url);

  }

}

// Initialize Application when DOM is ready

document.addEventListener('DOMContentLoaded', () => {

  window.app = new ChatUI();

});

