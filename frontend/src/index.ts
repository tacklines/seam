import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
import { detectLocale, setLocale, isRtl } from "./lib/i18n.js";

// Initialize theme from localStorage or system preference
const saved = localStorage.getItem("seam-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const theme = saved || (prefersDark ? "dark" : "light");
document.documentElement.className = `sl-theme-${theme}`;

setBasePath(
  "https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/",
);

const detected = detectLocale();
setLocale(detected);
if (isRtl()) document.documentElement.dir = "rtl";

import "./components/shared/app-shell.js";
