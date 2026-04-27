"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-text-1 mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold text-text-1 mt-3 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-medium text-text-1 mt-2.5 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-text-1 leading-relaxed mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text-1">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-text-2">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-text-1 leading-relaxed pl-0.5">{children}</li>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className="block text-xs font-mono text-text-2 leading-relaxed">
          {children}
        </code>
      );
    }
    return (
      <code className="inline text-xs font-mono bg-surface-2 text-violet px-1 py-0.5 rounded">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-surface-2 border border-border rounded-xl p-3 mb-2 last:mb-0 overflow-x-auto text-xs">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-violet/40 pl-3 mb-2 last:mb-0 italic text-text-2">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-violet hover:text-violet/80 underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="border-border my-3" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 last:mb-0">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border/50 last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="text-left text-text-2 font-medium px-2 py-1.5">{children}</th>
  ),
  td: ({ children }) => (
    <td className="text-text-1 px-2 py-1.5">{children}</td>
  ),
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
