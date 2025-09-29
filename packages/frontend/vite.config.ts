import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const userId = env.VITE_OPERATIONS_USER_ID || "agent-noah";

  return {
    server: {
      host: "::",
      port: 5173,
      proxy: {
        "/v1/entities": {
          target: "http://localhost:3000",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/v1\/entities/, "/entities"),
        },
        "/v1": { 
          target: "http://localhost:3000", 
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log('[Proxy]', req.method, req.url, '->', options.target + req.url);
            });
          }
        },
      },
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
