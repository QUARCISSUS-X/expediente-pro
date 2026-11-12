import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Dos salidas con la misma interfaz:
//  - normal: dist/index.html, un solo archivo (web y app de escritorio)
//  - `vite build --mode extension`: dist-ext/, con los scripts en archivos aparte, porque las extensiones de
//    Firefox y Chrome no permiten scripts en línea (lo arma scripts/extension.mjs)
// archivos de menos de 4 MB: el revisor de Firefox no analiza archivos más grandes
const trozos = (id: string) => {
  if (!id.includes('node_modules')) return undefined;
  for (const k of ['exceljs', 'pdfmake', 'docx', 'jszip', 'react-dom', '@fontsource']) if (id.includes(`node_modules/${k}/`)) return k.replace('@', '');
  return 'otros';
};

export default defineConfig(({ mode }) => {
  const extension = mode === 'extension';
  return {
    base: extension ? './' : '/',
    plugins: extension ? [react()] : [react(), viteSingleFile({ removeViteModuleLoader: true })],
    resolve: {
      alias: [
        { find: 'exceljs', replacement: 'exceljs/dist/exceljs.min.js' },
        // trabajo en segundo plano (src/ui/trabajo.ts): dentro del HTML único, o en archivo aparte en la extensión
        { find: /^virtual:trabajador$/, replacement: `/src/export/trabajador.ts?worker${extension ? '' : '&inline'}` },
      ],
    },
    // el worker de la extensión también va en trozos de menos de 4 MB
    worker: extension ? { format: 'es', rollupOptions: { output: { manualChunks: trozos } } } : { format: 'iife' },
    build: {
      outDir: extension ? 'dist-ext' : 'dist',
      emptyOutDir: true,
      assetsInlineLimit: 100_000_000,
      chunkSizeWarningLimit: 20_000,
      cssCodeSplit: false,
      target: 'es2020',
      modulePreload: extension ? { polyfill: false } : undefined,
      rollupOptions: extension ? { output: { manualChunks: trozos } } : undefined,
    },
  };
});
