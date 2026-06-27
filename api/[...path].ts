export default async function handler(req: any, res: any) {
  try {
    const serverModule = await import('../dist/server.cjs');
    const app = serverModule.default?.default || serverModule.default || serverModule;
    return app(req, res);
  } catch (err: any) {
    console.error('Vercel API boot failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Vercel API boot failed.',
      error: err?.message || 'Unknown API boot error',
      code: err?.code || null
    });
  }
}
