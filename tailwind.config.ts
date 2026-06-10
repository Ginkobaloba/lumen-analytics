import type { Config } from "tailwindcss";

/*
  Brand values are pinned from PARADIGM_PLAN.md Section 3 until
  @paradigm/brand-tokens ships v1.0.0 (currently 0.1.0-scaffold with empty
  slots). When it ships, replace the `brand`, `metric`, and `anomaly` blocks
  with the package preset. Terracotta is Lumen-local (not in the Paradigm
  palette); see docs/demos/lumen/decisions.md.
*/

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
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
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        brand: {
          green: "#1F9D57", // Paradigm Green
          pine: "#178049",
          spruce: "#0F5E36",
          forest: "#0A3D24", // Deep Forest
          meadow: "#6DC893",
        },
        surface: {
          paper: "#FFFFFF",
          bone: "#F4F5F4",
          ash: "#E6E8E7",
          iron: "#3A403D",
          onyx: "#181C1B",
          ink: "#0E1110",
        },
        // Metric semantics: green = good, gray = neutral, terracotta = bad.
        metric: {
          good: "#1E7D3A", // AA on white (5.19:1)
          neutral: "#3A403D",
          bad: "#A84A33", // terracotta, darkened for AA text use
        },
        // Anomaly severity: muted gold for moderate, terracotta for high.
        anomaly: {
          moderate: "#D9A441", // Amber marker fill
          "moderate-text": "#8A6A00", // AA text variant (5.07:1)
          high: "#BE5B41", // terracotta marker fill
          "high-text": "#A84A33",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
