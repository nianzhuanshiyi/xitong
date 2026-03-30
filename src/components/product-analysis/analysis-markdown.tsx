"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function AnalysisMarkdown({ content }: { content: string }) {
  const text = String(content ?? "").trim();
  if (!text) {
    return <p className="text-sm text-muted-foreground">暂无内容</p>;
  }

  return (
    <div
      className={cn(
        "analysis-md w-full max-w-full text-sm leading-relaxed text-slate-800"
      )}
      style={{
        overflowWrap: "break-word",
        wordBreak: "break-word",
        maxWidth: "100%",
      }}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        /* react-markdown v10：正文必须作为 children 字符串传入 */
        components={{
          h1: ({ children, ...props }) => (
            <h1
              className="mt-6 max-w-full border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900 first:mt-0"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="mt-5 max-w-full text-lg font-semibold text-slate-900"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className="mt-4 max-w-full text-base font-semibold text-slate-900"
              {...props}
            >
              {children}
            </h3>
          ),
          p: ({ children, ...props }) => (
            <p className="my-2 max-w-full text-slate-700" {...props}>
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul
              className="my-2 max-w-full list-inside list-disc space-y-1 text-slate-700"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className="my-2 max-w-full list-inside list-decimal space-y-1 text-slate-700"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="max-w-full leading-relaxed" {...props}>
              {children}
            </li>
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-semibold text-slate-900" {...props}>
              {children}
            </strong>
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
              target="_blank"
              rel="noreferrer noopener"
              {...props}
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (isBlock) {
              return (
                <code
                  className={cn(
                    "block max-w-full overflow-x-auto font-mono text-xs text-gray-800",
                    className
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-800"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre
              className="my-3 max-w-full overflow-x-auto rounded-lg border bg-gray-50 p-4 text-xs text-gray-800 [&>code]:bg-transparent [&>code]:p-0"
              {...props}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="my-3 max-w-full border-l-4 border-indigo-200 bg-indigo-50/50 py-2 pl-4 text-slate-700"
              {...props}
            >
              {children}
            </blockquote>
          ),
          hr: (props) => <hr className="my-6 max-w-full border-slate-200" {...props} />,
          table: ({ children, ...props }) => (
            <div className="my-4 w-full max-w-full overflow-x-auto rounded-lg border border-slate-200">
              <table
                className="w-full max-w-full border-collapse border border-slate-300 text-left text-sm"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-slate-100 text-slate-900" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
          tr: ({ children, ...props }) => (
            <tr
              className="border-b border-slate-200 odd:bg-white even:bg-slate-50/90"
              {...props}
            >
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border border-slate-300 px-3 py-2 font-semibold [overflow-wrap:break-word]"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="border border-slate-300 px-3 py-2 align-top text-slate-700 [overflow-wrap:break-word]"
              {...props}
            >
              {children}
            </td>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
