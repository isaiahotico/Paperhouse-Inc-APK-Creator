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
