"use client";

import { useState, useEffect } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModuleGuideProps {
  moduleKey: string;
  title?: string;
  children: React.ReactNode;
}

export function ModuleGuide({ moduleKey, title = "使用说明", children }: ModuleGuideProps) {
  const storageKey = `module-guide-collapsed-${moduleKey}`;
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      setCollapsed(saved === "true");
    }
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  return (
    <div className="mb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        {title}
        {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </Button>
      {!collapsed && (
        <div className="mt-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
