import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || '';

  return {
    plugins: [
      react(),
      {
        name: 'groq-api-dev-middleware',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (req, res) => {
            if (req.method === 'OPTIONS') {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              res.statusCode = 200;
              res.end();
              return;
            }

            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const payload = body ? JSON.parse(body) : {};
                const key = payload.apiKey || apiKey;
                if (!key) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Missing Groq API key' }));
                  return;
                }

                // Query live models from Groq or use standard active list
                let candidateModels = [
                  payload.model || 'llama-3.1-8b-instant',
                  'llama-3.3-70b-versatile',
                  'llama-3.2-3b-preview',
                  'llama-3.2-1b-preview',
                  'qwen-qwq-32b',
                ];

                try {
                  const mRes = await fetch('https://api.groq.com/openai/v1/models', {
                    headers: { Authorization: `Bearer ${key}` },
                  });
                  if (mRes.ok) {
                    const mData = await mRes.json();
                    if (Array.isArray(mData?.data)) {
                      const live = mData.data
                        .map((m: { id?: string }) => (m.id || '') as string)
                        .filter(
                          (id: string) =>
                            (id.includes('llama') || id.includes('qwen')) &&
                            !id.includes('whisper') &&
                            !id.includes('guard') &&
                            !id.includes('vision')
                        );
                      if (live.length > 0) {
                        candidateModels = live;
                      }
                    }
                  }
                } catch {
                  // Use default candidate models
                }

                let lastErr = null;
                for (const m of candidateModels) {
                  try {
                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${key}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        model: m,
                        messages: payload.messages || [{ role: 'user', content: 'Hello' }],
                        max_tokens: payload.max_tokens || 1024,
                        temperature: payload.temperature ?? 0.7,
                      }),
                    });

                    if (response.ok) {
                      const data = await response.json();
                      res.statusCode = 200;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(data));
                      return;
                    } else {
                      lastErr = await response.json().catch(() => ({}));
                    }
                  } catch (e: unknown) {
                    lastErr = { error: (e as Error).message };
                  }
                }

                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: lastErr || 'Model request failed' }));
              } catch (err: unknown) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: (err as Error).message }));
              }
            });
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
