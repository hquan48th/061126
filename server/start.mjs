process.env.NODE_ENV = 'production';
await import('tsx/esm/api').then(({ tsImport }) => tsImport('./index.ts', import.meta.url));
