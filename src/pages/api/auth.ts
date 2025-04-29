import { NextApiRequest, NextApiResponse } from 'next';

// Middleware to check for a simple internal API key
export function withApiKeyAuth(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const providedApiKey = req.headers['x-internal-api-key'];
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    // Basic check: Ensure keys are present and match
    // In a real application, use a more secure comparison method (e.g., timing-safe comparison)
    if (!expectedApiKey || !providedApiKey || providedApiKey !== expectedApiKey) {
      console.warn('Unauthorized API access attempt detected.');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // If authorized, proceed to the actual handler
    try {
      await handler(req, res);
    } catch (error: any) {
      // Catch any unhandled errors from the wrapped handler
      console.error('Unhandled error in API handler:', error);
      res.status(500).json({ error: 'Internal Server Error', details: error.message || 'Unknown error' });
    }
  };
}

