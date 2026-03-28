import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: "var(--destructive)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-sans)", "sans-serif"],
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        "gradient-primary-soft":
          "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.12) 100%)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px -4px rgba(99, 102, 241, 0.08)",
        "card-hover":
          "0 8px 28px -6px rgba(99, 102, 241, 0.18), 0 4px 12px -4px rgba(15, 23, 42, 0.08)",
        sidebar: "4px 0 24px -8px rgba(30, 27, 75, 0.35)",
      },
      blur: {
        xs: "2px",
      },
      keyframes: {
        "page-enter": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "page-enter": "page-enter 0.38s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    function ({
      addVariant,
    }: {
      addVariant: (name: string, definition: string | string[]) => void;
    }) {
      addVariant("data-open", [
        "&:where([data-state=open])",
        "&:where([data-open]:not([data-open=false]))",
      ]);
      addVariant("data-closed", [
        "&:where([data-state=closed])",
        "&:where([data-closed]:not([data-closed=false]))",
      ]);
      addVariant(
        "supports-backdrop-filter",
        "@supports (backdrop-filter: blur(0)) or (-webkit-backdrop-filter: blur(0)) { & }"
      );
    },
  ],
};

export default config;
