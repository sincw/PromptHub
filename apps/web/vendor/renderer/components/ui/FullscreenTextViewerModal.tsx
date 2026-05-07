import { useEffect, useMemo, useState } from "react";
import { CheckIcon, CopyIcon, FileTextIcon, WrapTextIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { defaultSchema } from "hast-util-sanitize";
import { Modal } from "./Modal";

export type FullscreenTextViewerMode = "raw" | "markdown";

interface FullscreenTextViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  content: string;
  initialMode?: FullscreenTextViewerMode;
}

export function FullscreenTextViewerModal({
  isOpen,
  onClose,
  title,
  subtitle,
  content,
  initialMode = "markdown",
}: FullscreenTextViewerModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FullscreenTextViewerMode>(initialMode);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setCopied(false);
  }, [initialMode, isOpen]);

  const sanitizeSchema: any = useMemo(() => {
    const schema = { ...defaultSchema, attributes: { ...defaultSchema.attributes } };
    schema.attributes.code = [...(schema.attributes.code || []), ["className"]];
    schema.attributes.span = [...(schema.attributes.span || []), ["className"]];
    schema.attributes.pre = [...(schema.attributes.pre || []), ["className"]];
    return schema;
  }, []);

  const rehypePlugins = useMemo(
    () => [
      [rehypeHighlight, { ignoreMissing: true }] as any,
      [rehypeSanitize, sanitizeSchema] as any,
    ],
    [sanitizeSchema],
  );

  const markdownComponents = useMemo(() => ({
    h1: (props: any) => <h1 className="text-3xl font-bold mb-4 text-foreground" {...props} />,
    h2: (props: any) => <h2 className="text-2xl font-semibold mb-3 mt-6 text-foreground" {...props} />,
    h3: (props: any) => <h3 className="text-xl font-semibold mb-3 mt-5 text-foreground" {...props} />,
    h4: (props: any) => <h4 className="text-base font-semibold mb-2 mt-4 text-foreground" {...props} />,
    p: (props: any) => <p className="mb-4 leading-relaxed text-foreground/90" {...props} />,
    ul: (props: any) => <ul className="list-disc pl-6 mb-4 space-y-1.5" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-6 mb-4 space-y-1.5" {...props} />,
    li: (props: any) => <li className="leading-relaxed" {...props} />,
    code: (props: any) => <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[13px]" {...props} />,
    pre: (props: any) => (
      <pre className="p-4 rounded-lg bg-muted overflow-x-auto text-[13px] leading-relaxed mb-4" {...props} />
    ),
    blockquote: (props: any) => (
      <blockquote className="border-l-4 border-border pl-4 text-muted-foreground italic mb-4" {...props} />
    ),
    hr: () => <hr className="my-6 border-border" />,
    table: (props: any) => <table className="table-auto border-collapse w-full text-sm mb-4" {...props} />,
    th: (props: any) => <th className="border border-border px-3 py-2 bg-muted text-left font-medium" {...props} />,
    td: (props: any) => <td className="border border-border px-3 py-2" {...props} />,
    a: (props: any) => <a className="text-primary hover:underline" {...props} target="_blank" rel="noreferrer" />,
    strong: (props: any) => <strong className="font-semibold text-foreground" {...props} />,
    em: (props: any) => <em className="italic text-foreground/90" {...props} />,
  }), []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="fullscreen"
      headerActions={
        <>
          <div className="inline-flex h-9 rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setMode("markdown")}
              className={`inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                mode === "markdown" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileTextIcon className="w-3.5 h-3.5" />
              <span>{t("prompt.viewMarkdown", "Markdown")}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("raw")}
              className={`inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                mode === "raw" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <WrapTextIcon className="w-3.5 h-3.5" />
              <span>{t("prompt.viewRaw", "Plain Text")}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background text-xs font-medium hover:bg-accent transition-colors"
          >
            {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
            <span>{copied ? t("prompt.copied", "Copied") : t("common.copy", "Copy")}</span>
          </button>
        </>
      }
    >
      {content ? (
        mode === "raw" ? (
          <div className="min-h-full rounded-xl border border-border bg-card p-5 font-mono text-[14px] leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </div>
        ) : (
          <div className="min-h-full rounded-xl border border-border bg-card p-5 text-[15px] leading-relaxed markdown-content space-y-3 break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={rehypePlugins}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {t("prompt.noContent", "No content")}
        </div>
      )}
    </Modal>
  );
}
