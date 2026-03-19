import react from "@vitejs/plugin-react";
import webSpatial from "@webspatial/vite-plugin";
import { defineConfig } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";

const isAvp = process.env.XR_ENV === "avp";

export default defineConfig({
  optimizeDeps: isAvp
    ? {
        exclude: [
          "@webspatial/core-sdk",
          "@webspatial/react-sdk",
          "@webspatial/react-sdk/default",
          "@webspatial/react-sdk/default/jsx-runtime",
          "@webspatial/react-sdk/default/jsx-dev-runtime",
        ],
      }
    : undefined,
  plugins: [
    react(),
    webSpatial(),
    createHtmlPlugin({
      inject: {
        data: {
          XR_ENV: process.env.XR_ENV,
        },
      },
    }),
  ],
});
