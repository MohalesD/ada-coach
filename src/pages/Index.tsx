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

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
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
      else setSidebarRefreshKey((k) => k + 1); // bump so updated_at re-sorts
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
            {!hasMessages && !isLoading && !isLoadingHistory && (
              <div className="m-auto max-w-md text-center">
                <p className="text-accent text-[11px] font-semibold uppercase tracking-[0.2em]">
                  Start a session
                </p>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                  Tell Ada about your product idea, a customer you're trying to
                  understand, or an assumption you want to pressure-test.
                </p>
              </div>
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
