export default async function handler(req: any, res: any) {
  try {
    const { default: app } = await import('../server.ts');
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
