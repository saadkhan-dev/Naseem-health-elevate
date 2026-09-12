import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Bot, Check, Copy, Loader2, Send, Sparkles, Trash2, X } from "lucide-react";
import { chatWithAssistant, type ChatTurn } from "@/lib/chat.functions";
import { cn } from "@/lib/utils";
import { useFloatingControls } from "@/hooks/useFloatingControls";
import { useFloatingDismiss } from "@/hooks/useFloatingDismiss";

const WELCOME_MESSAGE =
  "Hello! I'm the Naseem AI Assistant. I can help you book an appointment, explore our services, or answer questions about the clinic. How can I help today?";

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "How do I book an appointment?", prompt: "How do I book an appointment?" },
  { label: "How does video consultation work?", prompt: "How does video consultation work?" },
  {
    label: "How do I pay for a video consultation?",
    prompt: "How do I pay for a video consultation?",
  },
  { label: "How can I check my appointment?", prompt: "How can I check my appointment?" },
  { label: "What treatments do you offer?", prompt: "What treatments do you offer?" },
  { label: "Where is the clinic?", prompt: "Where is the clinic located?" },
  { label: "What are the clinic timings?", prompt: "What are the clinic timings?" },
  { label: "How can I order a product?", prompt: "How can I order a product?" },
  { label: "How do I submit a review?", prompt: "How do I submit a review?" },
  { label: "What is the patient portal?", prompt: "What is the patient portal?" },
];

const MEDICAL_NOTE =
  "This assistant provides general information only and is not a substitute for professional medical advice.";

const GUEST_ID_KEY = "naseem_ai_guest_id";
const CONVERSATION_KEY = "naseem_ai_conversation_v2";
const MAX_LENGTH = 2000;

type MessageKind = "assistant" | "user" | "blocked" | "error";

/**
 * A chat turn enriched with the time it was created (so history restored from
 * localStorage keeps its own timestamps).
 */
interface LocalTurn extends ChatTurn {
  t: string;
  kind: MessageKind;
}

function getGuestId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function loadConversation(): LocalTurn[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONVERSATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalTurn[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (parsed.some((m) => !m || !m.role || typeof m.content !== "string")) return null;
    return parsed.slice(-40) as LocalTurn[];
  } catch {
    return null;
  }
}

function saveConversation(messages: LocalTurn[]) {
  if (typeof window === "undefined") return;
  try {
    const next = messages.length > 60 ? messages.slice(-60) : messages;
    window.localStorage.setItem(CONVERSATION_KEY, JSON.stringify(next));
  } catch {
    // Storage may be full or blocked — the chat still works in memory.
  }
}

function clearConversation() {
  try {
    window.localStorage.removeItem(CONVERSATION_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Minimal, safe rich-text renderer (bold, italics, inline code, lists).
// No HTML is ever injected — everything is plain React nodes.
// ---------------------------------------------------------------------------

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
      return (
        <code
          key={i}
          className="rounded border border-current/15 bg-black/[0.05] px-1 py-0.5 font-mono text-[0.85em]"
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return <em key={i}>{p.slice(1, -1)}</em>;
    }
    return <span key={i}>{p}</span>;
  });
}

function RichText({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let ordered: { start: number; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length > 0) {
      nodes.push(
        <p key={key++} className="whitespace-pre-line">
          {inline(para.join("\n"))}
        </p>,
      );
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      nodes.push(
        <ul key={key++} className="list-disc space-y-0.5 pl-4">
          {bullets.map((b) => (
            <li key={key++}>{inline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  const flushOrdered = () => {
    if (ordered) {
      nodes.push(
        <ol key={key++} start={ordered.start} className="list-decimal space-y-0.5 pl-4">
          {ordered.items.map((b) => (
            <li key={key++}>{inline(b)}</li>
          ))}
        </ol>,
      );
      ordered = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushBullets();
      flushOrdered();
      continue;
    }
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    const step = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (bullet) {
      flushPara();
      flushOrdered();
      bullets.push(bullet[1]);
      continue;
    }
    if (step) {
      flushPara();
      flushBullets();
      const start = parseInt(step[1], 10);
      if (!ordered) ordered = { start, items: [] };
      ordered.items.push(step[2]);
      continue;
    }
    flushBullets();
    flushOrdered();
    para.push(line);
  }
  flushPara();
  flushBullets();
  flushOrdered();

  return <div className="space-y-1.5">{nodes}</div>;
}

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { hidden } = useFloatingControls();
  const { naseemDismissed, dismissNaseem } = useFloatingDismiss();
  const chatMaxHeight = "max(200px, calc(100dvh - 9.5rem - env(safe-area-inset-bottom, 0px)))";
  const [messages, setMessages] = useState<LocalTurn[]>(
    () =>
      loadConversation() ?? [
        { role: "assistant", content: WELCOME_MESSAGE, kind: "assistant", t: nowTime() },
      ],
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  // Persist the conversation so a refresh never loses the chat.
  useEffect(() => {
    saveConversation(messages);
  }, [messages]);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Focus the message box whenever the chat opens.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => {
        const el = inputRef.current;
        if (el) el.focus({ preventScroll: true });
        autosize();
      }, 120);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Pin the newest message to the bottom whenever something changes.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !open) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping, open]);

  useEffect(() => {
    return () => window.clearTimeout(closeTimer.current);
  }, []);

  function autosize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAtBottom(near);
  }

  function openChat() {
    window.clearTimeout(closeTimer.current);
    setMounted(true);
    setOpen(true);
  }

  function closeChat() {
    setOpen(false);
    setConfirmClear(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), 250);
  }

  function clearChat() {
    clearConversation();
    setMessages([{ role: "assistant", content: WELCOME_MESSAGE, kind: "assistant", t: nowTime() }]);
    setConfirmClear(false);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim().slice(0, MAX_LENGTH);
    if (!trimmed || isTyping) return;

    const next: LocalTurn[] = [
      ...messages,
      { role: "user", content: trimmed, kind: "user", t: nowTime() },
    ];
    setMessages(next);
    setInput("");
    setIsTyping(true);
    autosize();

    try {
      const res = await chatWithAssistant({
        data: { messages: next.slice(-12), clientId: getGuestId() },
      });
      const kind: MessageKind = res.blocked ? "blocked" : res.error ? "error" : "assistant";
      const content =
        res.reply ?? res.error ?? "Sorry, I couldn't think of a reply. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content, kind, t: nowTime() }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          kind: "error",
          t: nowTime(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    sendMessage(input);
  }

  function copyMessage(content: string, id: string) {
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  }

  const lastMessage = messages[messages.length - 1];
  const showQuickActions = !isTyping && lastMessage?.role === "assistant";
  const nearLimit = input.length > MAX_LENGTH - 120;

  return (
    <>
      {/* Floating button */}
      <div
        data-floating-control="true"
        className={cn(
          "fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] z-50 transition-opacity duration-300 sm:right-5 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)]",
          (mounted || hidden || naseemDismissed) && "pointer-events-none opacity-0",
        )}
      >
        <div className="relative">
          <button
            type="button"
            onClick={openChat}
            aria-label="Chat with Naseem AI Assistant"
            className="group flex items-center gap-2 rounded-full bg-gradient-primary py-1 pl-1 pr-3 text-primary-foreground shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-glass active:scale-95 sm:gap-3 sm:py-2 sm:pl-2 sm:pr-5"
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105 sm:h-10 sm:w-10">
              <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white/60" />
            </span>
            <span className="text-left leading-tight">
              <span className="block font-display text-xs font-semibold sm:text-sm">
                Naseem AI Assistant
              </span>
              <span className="hidden text-[10px] text-primary-foreground/85 sm:block sm:text-[11px]">
                How can we help you?
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={dismissNaseem}
            aria-label="Hide Naseem AI Assistant button"
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-all duration-300 hover:bg-background hover:text-foreground active:scale-90"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Chat window */}
      {mounted && (
        <div
          role="dialog"
          aria-label="Naseem AI Assistant"
          className={cn(
            "fixed right-4 left-4 z-50 flex h-[min(80dvh,680px)] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition-[transform,opacity] duration-300 ease-out sm:right-5 sm:left-auto sm:w-[450px] sm:max-w-[calc(100vw_-_2.5rem)] lg:w-[480px]",
            "bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)]",
            open
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-[0.97] opacity-0",
          )}
          style={{ maxHeight: chatMaxHeight }}
          data-floating-control="true"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-primary px-4 py-3.5 text-primary-foreground">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-display text-sm font-semibold">Naseem AI Assistant</div>
              <div className="flex items-center gap-1.5 text-[11px] text-primary-foreground/85">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Online · replies instantly
              </div>
            </div>
            {messages.length > 1 && !confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                aria-label="Clear conversation"
                title="Clear conversation"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-all duration-300 hover:bg-white/25 active:scale-90"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            {messages.length > 1 && confirmClear ? (
              <button
                type="button"
                onClick={clearChat}
                aria-label="Confirm clear conversation"
                title="Click again to confirm"
                className="flex h-9 items-center gap-1 rounded-full bg-white/25 px-3 text-[11px] font-semibold transition-all duration-300 hover:bg-white/35 active:scale-95"
              >
                Clear? <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeChat}
              aria-label="Close chat"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-all duration-300 hover:bg-white/25 active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
            >
              {messages.map((m, i) => (
                <MessageBubble
                  key={`${i}-${m.t}`}
                  message={m}
                  copied={copied === `${i}`}
                  onCopy={(content) => copyMessage(content, `${i}`)}
                />
              ))}

              {showQuickActions && (
                <div className="chat-msg-in flex justify-start">
                  <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 rounded-2xl rounded-bl-md border border-sky-100 bg-sky-50 p-2.5 text-slate-700">
                    <div className="mb-1.5 pl-0.5 text-[11px] font-medium text-sky-700/80">
                      Try one of these or ask your own question
                    </div>
                    <div className="scrollbar-thin flex max-h-36 flex-wrap content-start gap-1.5 overflow-y-auto pr-0.5">
                      {QUICK_ACTIONS.map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => sendMessage(q.prompt)}
                          disabled={isTyping}
                          className="rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isTyping && <TypingIndicator />}
            </div>

            {!atBottom && (
              <button
                type="button"
                onClick={() =>
                  scrollRef.current?.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: "smooth",
                  })
                }
                aria-label="Scroll to latest message"
                className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:bg-accent"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 text-center text-[10px] text-muted-foreground">
            {MEDICAL_NOTE}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autosize();
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={MAX_LENGTH}
                placeholder="Type your message..."
                aria-label="Type your message"
                className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft active:scale-90 disabled:pointer-events-none disabled:opacity-40"
              >
                {isTyping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Enter to send · Shift+Enter for a new line</span>
              <span className={cn(nearLimit && "font-semibold text-amber-500")}>
                {input.length}/{MAX_LENGTH}
              </span>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  message,
  copied,
  onCopy,
}: {
  message: LocalTurn;
  copied: boolean;
  onCopy: (content: string) => void;
}) {
  const isUser = message.kind === "user";
  return (
    <div className={cn("chat-msg-in flex", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md bg-gradient-primary text-primary-foreground"
            : message.kind === "error"
              ? "rounded-bl-md border border-red-200 bg-red-50 text-red-800"
              : message.kind === "blocked"
                ? "rounded-bl-md border border-amber-200 bg-amber-50 text-amber-800"
                : "rounded-bl-md border border-sky-100 bg-sky-50 text-slate-700",
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        ) : (
          <RichText content={message.content} />
        )}
        <div
          className={cn(
            "mt-1.5 flex items-center justify-end gap-2 text-[10px]",
            isUser ? "text-primary-foreground/70" : "text-slate-400",
          )}
        >
          <span>{message.t}</span>
          {!isUser && (
            <button
              type="button"
              onClick={() => onCopy(message.content)}
              aria-label={copied ? "Copied" : "Copy reply"}
              title="Copy reply"
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-black/5 active:scale-90",
                copied && "text-emerald-600",
              )}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chat-msg-in flex justify-start">
      <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-sky-100 bg-sky-50 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="chat-typing-dot h-2 w-2 rounded-full bg-sky-400"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
