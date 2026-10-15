"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Bot,
  User,
  Send,
  X,
  RotateCcw,
  Sparkles,
  AlertCircle,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import styles from "./Chatbot.module.css";

// ── Initial State & Suggestions ───────────────────────────────────────
const INITIAL_MESSAGES = [
  {
    id: "init-1",
    role: "assistant",
    content:
      "Hello! 👋 Welcome to **Sanmora**.\n\nI am your AI Assistant. How can I assist you with our **Website Development**, **Software Solutions**, **Mobile Apps**, or **Digital Marketing** services today?",
    timestamp: "Just now",
  },
];

const SUGGESTIONS = [
  "What services does Sanmora offer?",
  "How can I book a free consultation?",
  "Where are your global offices located?",
  "What is your web & app tech stack?",
];

// ── Safe Inline Markdown Parser ───────────────────────────────────────
function parseInline(text) {
  if (!text) return null;
  // Match bold **text** or markdown links [title](url)
  const regex = /(\*\*.*?\*\*|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const linkUrl = linkMatch[2];
      const isInternal = linkUrl.startsWith("/") || linkUrl.startsWith("#");
      return (
        <a
          key={index}
          href={linkUrl}
          target={isInternal ? undefined : "_blank"}
          rel={isInternal ? undefined : "noopener noreferrer"}
        >
          {linkText}
        </a>
      );
    }
    return part;
  });
}

// ── Markdown Document Renderer ────────────────────────────────────────
function MarkdownRenderer({ content }) {
  if (!content) return null;
  const lines = content.split("\n");
  const elements = [];
  let currentList = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {currentList.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      currentList.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      elements.push(<p key={`p-${index}`}>{parseInline(line)}</p>);
    }
  });

  flushList();

  return <div className={styles.markdownContent}>{elements}</div>;
}

// ── ID & Timestamp Helpers (Outside component for pure rendering) ─────
let messageCounter = 0;
function getNextId(prefix) {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

function getFormattedTime() {
  try {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Just now";
  }
}

// ── Main Chatbot Component ────────────────────────────────────────────
export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isLoading, isOpen]);

  // Focus input on panel open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Global keyboard listener (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Toggle Panel
  const toggleChat = () => {
    setIsOpen((prev) => !prev);
    setError(null);
  };

  // Reset / Clear conversation
  const handleClearChat = () => {
    const nowTime = getFormattedTime();
    setMessages([
      {
        id: getNextId("init"),
        role: "assistant",
        content:
          "Conversation restarted. 👋 How else can I assist you with **Sanmora's** digital solutions today?",
        timestamp: nowTime,
      },
    ]);
    setError(null);
    setLastFailedMessage(null);
    setInput("");
  };

  // Send message handler
  const handleSend = async (messageToSend) => {
    const text = (messageToSend !== undefined ? messageToSend : input).trim();
    if (!text || isLoading) return;

    if (text.length > 500) {
      setError("Please keep your message under 500 characters.");
      return;
    }

    const timestamp = getFormattedTime();
    const userMsg = {
      id: getNextId("u"),
      role: "user",
      content: text,
      timestamp,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLastFailedMessage(null);
    setIsLoading(true);

    try {
      // Build conversation history (excluding initial greetings)
      const historyPayload = nextMessages
        .filter((m) => !m.id.startsWith("init-") && !m.id.startsWith("init"))
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content,
        }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}: Failed to get response`);
      }

      const botMsg = {
        id: getNextId("b"),
        role: "assistant",
        content: data.reply,
        timestamp: getFormattedTime(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error("[Chatbot UI] Error sending message:", err);
      setError(err.message || "Failed to reach AI Assistant. Please retry.");
      setLastFailedMessage(text);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Input KeyDown (Enter to send, Shift+Enter for newline)
  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle suggested question click
  const handleSelectSuggestion = (suggestion) => {
    handleSend(suggestion);
  };

  // Handle retry
  const handleRetry = () => {
    if (lastFailedMessage) {
      handleSend(lastFailedMessage);
    }
  };

  const userMessagesCount = messages.filter((m) => m.role === "user").length;

  return (
    <>
      {/* ── Floating Launcher Button (Bottom-Right) ── */}
      <button
        id="sanmora-chatbot-launcher"
        onClick={toggleChat}
        className={`${styles.launcherBtn} ${isOpen ? styles.launcherActive : ""}`}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
        aria-expanded={isOpen}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title="Chatbot for Help"
      >
        {isOpen ? (
          <X size={26} strokeWidth={2.4} />
        ) : (
          <MessageSquare size={26} strokeWidth={2.2} />
        )}

        {/* Live Status Green Dot */}
        <span className={styles.launcherOnlineDot} aria-hidden="true" />

        {/* Hover Tooltip */}
        {!isOpen && showTooltip && (
          <div className={styles.launcherTooltip} role="tooltip">
            Chatbot for Help
          </div>
        )}
      </button>

      {/* ── Chat Panel (Bottom: 100px, Right: 30px) ── */}
      {isOpen && (
        <section
          id="sanmora-chatbot-panel"
          className={styles.chatPanel}
          role="dialog"
          aria-label="Sanmora AI Assistant Help Desk"
          aria-modal="true"
        >
          {/* Header */}
          <header className={styles.panelHeader}>
            <div className={styles.headerLeft}>
              <div className={styles.botAvatarWrapper}>
                <Bot size={20} />
                <span className={styles.headerOnlineDot} />
              </div>
              <div className={styles.headerTextGroup}>
                <h3 className={styles.headerTitle}>AI Assistant • Help Desk</h3>
                <span className={styles.headerSubtitle}>
                  <span className={styles.statusIndicator} />
                  Online • Instant Support
                </span>
              </div>
            </div>

            <div className={styles.headerActions}>
              <button
                onClick={handleClearChat}
                className={styles.headerActionBtn}
                title="Restart conversation"
                aria-label="Restart conversation"
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={toggleChat}
                className={styles.headerActionBtn}
                title="Close chat"
                aria-label="Close chat"
              >
                <X size={17} />
              </button>
            </div>
          </header>

          {/* Error Banner */}
          {error && (
            <div className={styles.errorBanner} role="alert">
              <div className={styles.errorBannerContent}>
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
              {lastFailedMessage && (
                <button onClick={handleRetry} className={styles.retryBtn}>
                  <RefreshCw size={12} />
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Messages Area */}
          <div className={styles.messagesContainer}>
            {messages.map((msg) => {
              const isBot = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${isBot ? styles.botRow : styles.userRow}`}
                >
                  <div
                    className={`${styles.rowAvatar} ${
                      isBot ? styles.botRowAvatar : styles.userRowAvatar
                    }`}
                  >
                    {isBot ? <Sparkles size={14} /> : <User size={14} />}
                  </div>

                  <div className={styles.bubbleWrapper}>
                    <div
                      className={`${styles.messageBubble} ${
                        isBot ? styles.botBubble : styles.userBubble
                      }`}
                    >
                      <MarkdownRenderer content={msg.content} />
                    </div>
                    <span className={styles.timestamp}>{msg.timestamp}</span>
                  </div>
                </div>
              );
            })}

            {/* Suggested Questions (Visible when user has sent 0 messages) */}
            {userMessagesCount === 0 && !isLoading && (
              <div className={styles.suggestionsContainer}>
                <span className={styles.suggestionsTitle}>Suggested Inquiries</span>
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    className={styles.suggestionChip}
                    onClick={() => handleSelectSuggestion(suggestion)}
                  >
                    <span>{suggestion}</span>
                    <ChevronRight size={14} className={styles.suggestionArrow} />
                  </button>
                ))}
              </div>
            )}

            {/* Typing Indicator */}
            {isLoading && (
              <div className={`${styles.messageRow} ${styles.botRow}`}>
                <div className={`${styles.rowAvatar} ${styles.botRowAvatar}`}>
                  <Sparkles size={14} />
                </div>
                <div className={`${styles.messageBubble} ${styles.botBubble}`}>
                  <div className={styles.typingIndicator}>
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingLabel}>Sanmora AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer / Input Bar */}
          <footer className={styles.panelFooter}>
            <div className={styles.inputRow}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 500))}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask about web, apps, or consultation..."
                className={styles.textInput}
                rows={1}
                aria-label="Type your message"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={styles.sendBtn}
                title="Send message (Enter)"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>

            <div className={styles.footerSubtext}>
              <span>Powered by Gemini AI • Free Instant Support</span>
              {input.length > 350 && (
                <span
                  className={`${styles.charCount} ${
                    input.length >= 480 ? styles.charCountWarning : ""
                  }`}
                >
                  {input.length}/500
                </span>
              )}
            </div>
          </footer>
        </section>
      )}
    </>
  );
}
