import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
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

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { hidden } = useFloatingControls();
  const { naseemDismissed, dismissNaseem } = useFloatingDismiss();
  const chatMaxHeight = "max(280px, calc(100dvh - 9.5rem - env(safe-area-inset-bottom, 0px)))";
  const [messages, setMessages] = useState<ChatTurn[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    const container = scrollRef.current;
    const last = lastMessageRef.current;
    if (!container) return;
    if (last) {
      // Align the top of the latest message just below the container's top so
      // the newest user question / AI reply is immediately visible, with the
      // quick-help chips (rendered after it) never covering it.
      const containerTop = container.getBoundingClientRect().top;
      const lastTop = last.getBoundingClientRect().top;
      container.scrollBy({
        top: lastTop - containerTop - 10,
        behavior: "smooth",
      });
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isTyping, open]);

  useEffect(() => {
    return () => window.clearTimeout(closeTimer.current);
  }, []);

  function openChat() {
    window.clearTimeout(closeTimer.current);
    setMounted(true);
    setOpen(true);
  }

  function closeChat() {
    setOpen(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), 250);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim().slice(0, 2000);
    if (!trimmed || isTyping) return;

    const next: ChatTurn[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setIsTyping(true);

    try {
      const res = await chatWithAssistant({
        data: { messages: next.slice(-12), clientId: getGuestId() },
      });
      const reply: ChatTurn = {
        role: "assistant",
        content: res.reply ?? res.error ?? "Sorry, I couldn't think of a reply. Please try again.",
      };
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
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

  const lastMessage = messages[messages.length - 1];
  const showQuickActions = !isTyping && lastMessage?.role === "assistant";

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
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} ref={i === messages.length - 1 ? lastMessageRef : undefined}>
                <MessageBubble message={m} />
              </div>
            ))}

            {showQuickActions && (
              <div className="chat-msg-in pt-1">
                <div className="mb-1 text-[11px] font-medium text-sky-700/80">
                  Try one of these or ask your own question
                </div>
                <div className="scrollbar-thin -mr-1 flex max-h-36 flex-wrap content-start gap-1.5 overflow-y-auto pr-1">
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
            )}

            {isTyping && <TypingIndicator />}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 text-center text-[10px] text-muted-foreground">
            {MEDICAL_NOTE}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-border p-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Type your message..."
              aria-label="Type your message"
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-slate-700 caret-sky-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
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
          </form>
        </div>
      )}
    </>
  );
}

function MessageBubble({ message }: { message: ChatTurn }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("chat-msg-in flex", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mr-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md bg-gradient-primary text-primary-foreground"
            : "rounded-bl-md border border-sky-100 bg-sky-50 text-slate-700",
        )}
      >
        {message.content}
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
