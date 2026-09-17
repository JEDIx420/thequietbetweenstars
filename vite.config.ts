import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' || process.env.NODE_ENV === 'production' ? '/thequietbetweenstars/' : '/',
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('three')) {
            return 'three-bundle';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    port: 3000,
  },
});
