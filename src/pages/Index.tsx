import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { isAdmin, useAuth } from '@/lib/auth-context';
import ConversationSidebar from '@/components/ConversationSidebar';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ChatResponse = {
  reply: string;
  conversation_id: string;
  message_id: string;
  error?: string;
};

const ERROR_MESSAGE = 'Ada is taking a moment. Please try again.';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  // Core send — accepts an optional message override so scenarios can inject
  // their opening message without coupling to the input field state.
  const send = async (override?: string) => {
    const trimmed = (override ?? input).trim();
    if (!trimmed || isLoading) return;

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
      if (isNew) setSidebarRefreshKey((k) => k + 1);
      else setSidebarRefreshKey((k) => k + 1);
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
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
    setError(null);
    setInput('');
  };

  const loadConversation = async (id: string) => {
    if (id === conversationId || isLoadingHistory) return;
    setIsLoadingHistory(true);
    setError(null);
    setConversationId(id);
    setMessages([]);

    const { data, error: queryErr } = await supabase
      .from('messages')
      .select('id, role, content')
      .eq('conversation_id', id)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true });

    if (queryErr) {
      console.error('load conversation error:', queryErr);
      setError('Could not load this conversation.');
      setIsLoadingHistory(false);
      return;
    }

    setMessages((data ?? []) as ChatMessage[]);
    setIsLoadingHistory(false);
  };

  const selectScenario = (scenario: Scenario) => {
    // Reset to a clean new conversation then fire the opening message
    setMessages([]);
    setConversationId(null);
    setError(null);
    setInput('');
    void send(scenario.openingMessage);
  };

  const hasMessages = messages.length > 0;
  const showAdminLink = isAdmin(profile);
  const displayName = profile?.display_name || user?.email || 'You';

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
            <div className="flex items-center gap-3">
              {showAdminLink && (
                <Link
                  to="/admin"
                  className="text-xs font-semibold uppercase tracking-wider text-accent hover:underline"
                >
                  Admin
                </Link>
              )}
              <span
                className="hidden max-w-[160px] truncate text-sm text-muted-foreground sm:inline"
                title={user?.email ?? undefined}
              >
                {displayName}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void signOut()}
              >
                Log out
              </Button>
            </div>
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

            {isLoading && <TypingIndicator />}

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
          <div className="mx-auto flex max-w-3xl items-end gap-3 px-6 py-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Ada anything about customer discovery..."
              rows={1}
              disabled={isLoading}
              className="min-h-[44px] resize-none"
            />
            <Button
              onClick={() => void send()}
              disabled={!input.trim() || isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Send
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
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
  return (
    <div
      className={cn(
        'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        isUser
          ? 'ml-auto whitespace-pre-wrap bg-secondary text-secondary-foreground'
          : 'mr-auto bg-muted text-foreground',
      )}
    >
      {isUser ? (
        message.content
      ) : (
        <div
          className={cn(
            'prose prose-sm max-w-none text-foreground',
            '[&_p]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0',
            '[&_strong]:font-semibold [&_strong]:text-foreground',
            '[&_em]:italic',
            '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
            '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_li]:my-1',
            '[&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
            '[&_a]:text-primary [&_a]:underline',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
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
