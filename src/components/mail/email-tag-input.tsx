"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailTagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function EmailTagInput({
  value,
  onChange,
  placeholder = "输入邮箱后回车添加",
  className,
}: EmailTagInputProps) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) return;
    if (value.includes(email)) return;
    onChange([...value, email]);
    setInput("");
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div
      className={cn(
        "flex min-h-[2rem] flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className
      )}
      onClick={() => ref.current?.focus()}
    >
      {value.map((email, i) => (
        <span
          key={email}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800"
        >
          {email}
          <button
            type="button"
            className="text-indigo-400 hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              remove(i);
            }}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={ref}
        type="email"
        className="min-w-[140px] flex-1 border-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        placeholder={value.length === 0 ? placeholder : ""}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && !input && value.length > 0) {
            remove(value.length - 1);
          } else if (e.key === "," || e.key === ";") {
            e.preventDefault();
            add(input);
          }
        }}
        onBlur={() => {
          if (input.trim()) add(input);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text");
          const emails = text.split(/[,;\s]+/).filter(Boolean);
          const valid = emails.filter((em) => EMAIL_RE.test(em.trim().toLowerCase()));
          if (valid.length > 0) {
            const newEmails = valid
              .map((em) => em.trim().toLowerCase())
              .filter((em) => !value.includes(em));
            onChange([...value, ...newEmails]);
            setInput("");
          }
        }}
      />
    </div>
  );
}
