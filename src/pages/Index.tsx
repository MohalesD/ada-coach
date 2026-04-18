import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { isAdmin, useAuth, type UserProfile } from '@/lib/auth-context';
import type { User } from '@supabase/supabase-js';
import ConversationSidebar from '@/components/ConversationSidebar';
import { useFeedback, type FeedbackValue } from '@/hooks/use-feedback';
import { exportConversation } from '@/lib/export';

type MessageKind = 'message' | 'summary';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  feedback?: FeedbackValue;
  kind?: MessageKind;
};

type ChatResponse = {
  reply: string;
  conversation_id: string;
  message_id: string;
  kind?: MessageKind;
  error?: string;
};

const ERROR_MESSAGE = 'Ada is taking a moment. Please try again.';
const SUMMARY_SENTINEL = '__SUMMARY__';

type ConversationMeta = { id: string; title: string | null; created_at: string };

// ─── Scenarios ────────────────────────────────────────────────────────────────

type Scenario = {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  openingMessage: string;
  deemphasized?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'pressure-test',
    icon: <PressureTestIcon />,
    title: 'Pressure-test my idea',
    subtitle: "Share your product concept and I'll challenge your assumptions",
    openingMessage: "I want to pressure-test my product idea with you. Let's start.",
  },
  {
    id: 'discovery-questions',
    icon: <DiscoveryIcon />,
    title: 'Write discovery questions',
    subtitle: 'Get help crafting open-ended interview questions',
    openingMessage:
      "Help me write open-ended discovery questions for my customer interviews.",
  },
  {
    id: 'analyze-feedback',
    icon: <AnalyzeIcon />,
    title: 'Analyze customer feedback',
    subtitle: 'Make sense of what your users are telling you',
    openingMessage:
      "I have customer feedback I'd like to analyze together. Let's dig in.",
  },
  {
    id: 'map-assumptions',
    icon: <MapIcon />,
    title: 'Map my assumptions',
    subtitle: 'Identify and rank the riskiest assumptions in your plan',
    openingMessage:
      "I want to map and rank the assumptions behind my product. Let's start with assumption mapping.",
  },
  {
    id: 'free-exploration',
    icon: <ExploreIcon />,
    title: 'Free exploration',
    subtitle: 'Start a conversation without a specific goal',
    openingMessage: "Let's just explore — I don't have a specific goal in mind yet.",
    deemphasized: true,
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Index() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [conversationMeta, setConversationMeta] = useState<ConversationMeta | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading, isSummarizing]);

  const isBusy = isLoading || isSummarizing;

  // Core send — accepts an optional message override so scenarios can inject
  // their opening message without coupling to the input field state.
  const send = async (override?: string) => {
    const trimmed = (override ?? input).trim();
    if (!trimmed || isBusy) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!override) setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke<ChatResponse>(
        'chat',
        {
          body: {
            message: trimmed,
            conversation_id: conversationId ?? undefined,
          },
        },
      );

      if (invokeErr || !data || data.error || !data.reply) {
        setError(ERROR_MESSAGE);
        return;
      }

      const isNew = conversationId !== data.conversation_id;
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: data.message_id,
          role: 'assistant',
          content: data.reply,
        },
      ]);
      setSidebarRefreshKey((k) => k + 1);
      if (isNew) {
        const { data: meta } = await supabase
          .from('conversations')
          .select('id, title, created_at')
          .eq('id', data.conversation_id)
          .maybeSingle();
        if (meta) setConversationMeta(meta as ConversationMeta);
      }
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  };

  const requestSummary = async () => {
    if (!conversationId || isBusy) return;
    setError(null);
    setIsSummarizing(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke<ChatResponse>(
        'chat',
        {
          body: {
            message: SUMMARY_SENTINEL,
            conversation_id: conversationId,
          },
        },
      );

      if (invokeErr || !data || data.error || !data.reply) {
        toast.error("Couldn't generate a summary. Please try again.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.message_id,
          role: 'assistant',
          content: data.reply,
          kind: data.kind ?? 'summary',
        },
      ]);
      setSidebarRefreshKey((k) => k + 1);
    } catch {
      toast.error("Couldn't generate a summary. Please try again.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleExport = () => {
    if (!conversationMeta) return;
    try {
      exportConversation(conversationMeta, messages);
      toast.success('Session exported successfully.');
    } catch {
      toast.error('Could not export session. Please try again.');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const newConversation = () => {
    setMessages([]);
    setConversationId(null);
    setConversationMeta(null);
    setError(null);
    setInput('');
  };

  const loadConversation = async (id: string) => {
    if (id === conversationId || isLoadingHistory) return;
    setIsLoadingHistory(true);
    setError(null);
    setConversationId(id);
    setConversationMeta(null);
    setMessages([]);

    const [messagesResult, metaResult] = await Promise.all([
      supabase
        .from('messages')
        .select('id, role, content, feedback, kind')
        .eq('conversation_id', id)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: true }),
      supabase
        .from('conversations')
        .select('id, title, created_at')
        .eq('id', id)
        .maybeSingle(),
    ]);

    if (messagesResult.error) {
      console.error('load conversation error:', messagesResult.error);
      setError('Could not load this conversation.');
      setIsLoadingHistory(false);
      return;
    }

    setMessages((messagesResult.data ?? []) as ChatMessage[]);
    if (metaResult.data) setConversationMeta(metaResult.data as ConversationMeta);
    setIsLoadingHistory(false);
  };

  const selectScenario = (scenario: Scenario) => {
    setMessages([]);
    setConversationId(null);
    setConversationMeta(null);
    setError(null);
    setInput('');
    void send(scenario.openingMessage);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[100dvh] bg-background text-foreground">
      <ConversationSidebar
        currentConversationId={conversationId}
        onSelect={(id) => void loadConversation(id)}
        onNew={newConversation}
        onArchived={(id) => {
          if (id === conversationId) newConversation();
        }}
        refreshKey={sidebarRefreshKey}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
            <h1 className="truncate text-xl font-extrabold tracking-tight">
              <span className="gradient-text">Ada</span>{' '}
              <span className="text-muted-foreground text-sm font-medium">
                · Customer Discovery Coach
              </span>
            </h1>
            <UserMenu
              user={user}
              profile={profile}
              onNavigate={navigate}
              onSignOut={() => void signOut()}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-6 py-8">
            {/* Scenario selection — shown when no conversation is active */}
            {!hasMessages && !isLoading && !isLoadingHistory && (
              <ScenarioScreen onSelect={selectScenario} />
            )}

            {isLoadingHistory && (
              <p className="m-auto text-sm text-muted-foreground">
                Loading conversation...
              </p>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}

            {(isLoading || isSummarizing) && <TypingIndicator />}

            {error && (
              <div
                role="alert"
                className="mr-auto max-w-[80%] rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        <footer className="border-t border-border bg-background">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-4">
            {messages.length >= 2 && (
              <div className="flex flex-wrap gap-2">
                {messages.length >= 4 && (
                  <button
                    type="button"
                    onClick={() => void requestSummary()}
                    disabled={isBusy}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border border-[#9BB7D4]/40 bg-background px-3 py-1.5',
                      'text-xs font-medium text-muted-foreground transition-colors',
                      'hover:border-[#C9A84C]/60 hover:bg-[#C9A84C]/5 hover:text-[#1B4F72]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9BB7D4]/60',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <SummaryIcon />
                    {isSummarizing ? 'Summarizing…' : 'Summarize session'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isBusy || !conversationMeta}
                  title={!conversationMeta ? 'Send a message first to enable export' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border border-[#9BB7D4]/40 bg-background px-3 py-1.5',
                    'text-xs font-medium text-muted-foreground transition-colors',
                    'hover:border-[#9BB7D4]/60 hover:bg-[#9BB7D4]/5 hover:text-[#1B4F72]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9BB7D4]/60',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <ExportIcon />
                  Export session
                </button>
              </div>
            )}
            <div className="flex items-end gap-3">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isSummarizing
                    ? 'Ada is summarizing your session...'
                    : 'Ask Ada anything about customer discovery...'
                }
                rows={1}
                disabled={isBusy}
                className="min-h-[44px] resize-none"
              />
              <Button
                onClick={() => void send()}
                disabled={!input.trim() || isBusy}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Send
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── User menu ────────────────────────────────────────────────────────────────

function UserMenu({
  user,
  profile,
  onNavigate,
  onSignOut,
}: {
  user: User | null;
  profile: UserProfile | null;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}) {
  const displayName = profile?.display_name || user?.email || 'You';
  const email = user?.email ?? '';
  const initials = getInitials(profile?.display_name, user?.email);
  const showAdmin = isAdmin(profile);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open user menu"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'border border-[#9BB7D4]/50 bg-background text-sm font-semibold uppercase text-[#1B4F72]',
            'transition-colors hover:border-[#1B4F72] hover:bg-[#9BB7D4]/15',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9BB7D4]/60',
          )}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </p>
          {email && (
            <p className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onNavigate('/settings')}>
          Settings
        </DropdownMenuItem>
        {showAdmin && (
          <DropdownMenuItem onSelect={() => onNavigate('/admin')}>
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onSignOut}
          className="text-destructive focus:text-destructive"
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim() || email || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source[0].toUpperCase();
}

// ─── Scenario selection screen ────────────────────────────────────────────────

function ScenarioScreen({ onSelect }: { onSelect: (s: Scenario) => void }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    // Fallback to the original empty state if something went wrong rendering cards
    return (
      <div className="m-auto max-w-md text-center">
        <p className="text-accent text-[11px] font-semibold uppercase tracking-[0.2em]">
          Start a session
        </p>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Tell Ada about your product idea, a customer you're trying to
          understand, or an assumption you want to pressure-test.
        </p>
      </div>
    );
  }

  return (
    <ScenarioErrorBoundary onError={() => setHasError(true)}>
      <div className="m-auto w-full max-w-2xl">
        <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          Where do you want to start?
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SCENARIOS.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </ScenarioErrorBoundary>
  );
}

function ScenarioCard({
  scenario,
  onSelect,
}: {
  scenario: Scenario;
  onSelect: (s: Scenario) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(scenario)}
      className={cn(
        'group flex items-start gap-3 rounded-xl border px-4 py-4 text-left transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9BB7D4]/60',
        scenario.deemphasized
          ? [
              'border-[#9BB7D4]/20 bg-background/40',
              'hover:border-[#9BB7D4]/50 hover:bg-background/60',
            ]
          : [
              'border-[#9BB7D4]/50 bg-background/60',
              'hover:border-[#1B4F72]/70 hover:bg-background/80 hover:shadow-sm',
            ],
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0 transition-colors',
          scenario.deemphasized
            ? 'text-muted-foreground/60 group-hover:text-muted-foreground'
            : 'text-[#9BB7D4] group-hover:text-[#1B4F72]',
        )}
      >
        {scenario.icon}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm font-semibold leading-snug',
            scenario.deemphasized
              ? 'text-muted-foreground group-hover:text-foreground'
              : 'text-foreground',
          )}
        >
          {scenario.title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {scenario.subtitle}
        </p>
      </div>
    </button>
  );
}

// Minimal class-based error boundary — React requires a class component for this
import { Component, type ReactNode } from 'react';

class ScenarioErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { caught: boolean }
> {
  state = { caught: false };

  static getDerivedStateFromError() {
    return { caught: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.caught ? null : this.props.children;
  }
}

// ─── Scenario icons ───────────────────────────────────────────────────────────

function PressureTestIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function DiscoveryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function AnalyzeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <polyline points="2 20 22 20" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
        {message.content}
      </div>
    );
  }

  const isSummary = message.kind === 'summary';
  const proseClasses = cn(
    'prose prose-sm max-w-none text-foreground',
    '[&_p]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0',
    '[&_strong]:font-semibold [&_strong]:text-foreground',
    '[&_em]:italic',
    '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
    '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
    '[&_li]:my-1',
    '[&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
    '[&_a]:text-primary [&_a]:underline',
  );

  return (
    <div
      className={cn(
        'group mr-auto flex flex-col items-start gap-1',
        isSummary ? 'max-w-[92%]' : 'max-w-[80%]',
      )}
    >
      <div className="flex w-full items-start gap-2">
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed text-foreground',
            isSummary
              ? 'border border-[#9BB7D4]/30 bg-[#9BB7D4]/10'
              : 'bg-muted',
          )}
        >
          {isSummary && (
            <div className="mb-2 inline-flex items-center gap-1 rounded-md bg-[#C9A84C]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#C9A84C]">
              <SummaryIcon />
              Summary
            </div>
          )}
          <div className={proseClasses}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        <CopyButton text={message.content} />
      </div>
      {!isSummary && (
        <FeedbackButtons
          messageId={message.id}
          initial={message.feedback ?? null}
        />
      )}
    </div>
  );
}

function SummaryIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write can fail in insecure contexts — fail silently.
    }
  };

  return (
    <div className="relative mt-2 shrink-0">
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? 'Copied' : 'Copy message'}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md border border-[#9BB7D4]/40 bg-background/60 text-[#1B4F72] transition-all duration-150',
          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          'hover:border-[#C9A84C]/70 hover:bg-[#C9A84C]/10 hover:text-[#C9A84C]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9BB7D4]/60',
          copied && 'border-[#C9A84C]/70 bg-[#C9A84C]/10 text-[#C9A84C] opacity-100',
        )}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span
        aria-hidden={!copied}
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1B4F72] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#C9A84C] shadow-sm transition-opacity duration-300',
          copied ? 'opacity-100' : 'opacity-0',
        )}
      >
        Copied!
      </span>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Feedback buttons ─────────────────────────────────────────────────────────

function FeedbackButtons({
  messageId,
  initial,
}: {
  messageId: string;
  initial: FeedbackValue;
}) {
  const [value, setValue] = useState<FeedbackValue>(initial);
  const [pendingTarget, setPendingTarget] = useState<
    'positive' | 'negative' | null
  >(null);
  const { submit, isSaving } = useFeedback(messageId);

  const handleClick = async (target: 'positive' | 'negative') => {
    if (isSaving) return;
    const next: FeedbackValue = value === target ? null : target;
    const previous = value;
    setValue(next); // optimistic
    setPendingTarget(target);
    const result = await submit(next);
    setPendingTarget(null);
    if (result.error) setValue(previous); // revert
  };

  const hasSelection = value !== null;

  return (
    <div
      className={cn(
        'ml-1 flex items-center gap-1 transition-opacity duration-150',
        hasSelection
          ? 'opacity-100'
          : 'opacity-30 group-hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <FeedbackButton
        kind="positive"
        selected={value === 'positive'}
        loading={isSaving && pendingTarget === 'positive'}
        disabled={isSaving}
        onClick={() => void handleClick('positive')}
      />
      <FeedbackButton
        kind="negative"
        selected={value === 'negative'}
        loading={isSaving && pendingTarget === 'negative'}
        disabled={isSaving}
        onClick={() => void handleClick('negative')}
      />
    </div>
  );
}

function FeedbackButton({
  kind,
  selected,
  loading,
  disabled,
  onClick,
}: {
  kind: 'positive' | 'negative';
  selected: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isPositive = kind === 'positive';
  const label = selected
    ? isPositive
      ? 'Remove positive feedback'
      : 'Remove negative feedback'
    : isPositive
      ? 'Mark as helpful'
      : 'Mark as unhelpful';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9BB7D4]/60',
        'disabled:cursor-wait',
        selected
          ? isPositive
            ? 'text-[#C9A84C] hover:bg-[#C9A84C]/10'
            : 'text-[#C2185B] hover:bg-[#C2185B]/10'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {loading ? <SpinnerIcon /> : isPositive ? <ThumbUpIcon /> : <ThumbDownIcon />}
    </button>
  );
}

function ThumbUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
      <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="mr-auto flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-2 w-2 animate-bounce rounded-full bg-secondary"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
