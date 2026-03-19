import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { snapdom } from "@zumer/snapdom";
import html2canvas from "html2canvas";
import "./index.css";
import App from "./App";

// WebSpatial AndroidXR uses DOM capture to turn enable-xr surfaces into native panels.
// Expose both libraries globally so the SDK can pick the fast path when available.
(window as Window & {
  snapdom?: typeof snapdom;
  html2canvas?: typeof html2canvas;
}).snapdom = snapdom;
(window as Window & {
  snapdom?: typeof snapdom;
  html2canvas?: typeof html2canvas;
}).html2canvas = html2canvas;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
