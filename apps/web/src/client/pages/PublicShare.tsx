import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon } from 'lucide-react';
import type { PublicShareResponse, ShareSourceSnapshot } from '@prompthub/shared';
import { getPublicShare } from '../api/shares';

function SourceSnapshotBlock({ snapshot }: { snapshot?: ShareSourceSnapshot | null }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!snapshot?.systemPrompt && !snapshot?.userPrompt) return null;

  const sections = [
    { key: 'system', title: 'System Prompt', content: snapshot.systemPrompt },
    { key: 'user', title: 'User Prompt', content: snapshot.userPrompt },
  ].filter((section) => section.content);

  return (
    <div className="mb-5 space-y-2">
      {sections.map((section) => {
        const isExpanded = !!expanded[section.key];
        return (
          <div key={section.key} className="overflow-hidden rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium"
              aria-expanded={isExpanded}
            >
              <span>{section.title}</span>
              {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
            </button>
            {isExpanded && (
              <div className="max-h-80 overflow-y-auto border-t border-border bg-muted/20 p-4 font-mono text-sm whitespace-pre-wrap break-words">
                {section.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContentView({ content, raw }: { content: string; raw: boolean }) {
  if (raw) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    );
  }

  return (
    <div className="markdown-content rounded-lg border border-border bg-card p-5 text-[15px] leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function PublicSharePage() {
  const { shareId } = useParams();
  const [share, setShare] = useState<PublicShareResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rawMode, setRawMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!shareId) {
        setShare({ available: false });
        setIsLoading(false);
        return;
      }

      try {
        const response = await getPublicShare(shareId);
        if (!cancelled) {
          setShare(response.data);
        }
      } catch {
        if (!cancelled) {
          setShare({ available: false });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!share?.available) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FileTextIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">分享已关闭</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            该分享链接当前不可用，内容不会被展示。
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-5 py-8 md:py-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold md:text-3xl">{share.title}</h1>
          {share.description && (
            <p className="mt-3 max-h-32 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
              {share.description}
            </p>
          )}
        </div>

        <SourceSnapshotBlock snapshot={share.sourceSnapshot} />

        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setRawMode(!rawMode)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {rawMode ? 'Markdown 阅读' : '原文阅读'}
          </button>
        </div>
        <ContentView content={share.content} raw={rawMode} />
      </div>
    </main>
  );
}
