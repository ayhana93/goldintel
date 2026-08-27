import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { fetchAllMarketData } from '../../shared/marketFeed.ts';

// Returns the full market dataset (gold multi-timeframe + DXY + US10Y) for the dashboard.
// Fetch logic lives in base44/shared/marketFeed.ts, shared with generateSignals.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await fetchAllMarketData();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}