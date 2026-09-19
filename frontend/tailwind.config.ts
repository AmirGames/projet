import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
      },
      fontFamily: {
        body: "var(--font-body)",
        heading: "var(--font-heading)",
      },
    },
  },
  plugins: [],
};

export default config;
