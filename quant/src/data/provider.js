// Phase 1 — market data provider abstraction.
//
// The strategy must never name a vendor. Providers are registered here and
// selected by id, so Yahoo can be replaced by a paid tick-accurate feed without
// touching a line of strategy code.
//
// Every provider returns series built by makeSeries(), which means every candle
// carries source, timezone, openTime, closeTime and CLOSED/DEVELOPING state.

/**
 * @typedef {object} MarketDataProvider
 * @property {string} id
 * @property {string} kind                       'historical' | 'live'
 * @property {(symbol: string) => boolean} supports
 * @property {(req: SeriesRequest) => Promise<Series>} getSeries
 * @property {() => Promise<CalendarEvent[]>} [getCalendar]
 */

/** Canonical symbols the strategy is allowed to ask for. */
export const SYMBOLS = {
  XAUUSD: 'XAUUSD',       // gold spot
  GOLD_FUT: 'GC',         // COMEX gold futures
  DXY: 'DXY',             // US dollar index
  US10Y: 'US10Y',         // US 10-year yield
};

const registry = new Map();

export function registerProvider(provider) {
  for (const field of ['id', 'kind', 'supports', 'getSeries']) {
    if (!provider[field]) throw new Error(`Provider is missing "${field}"`);
  }
  registry.set(provider.id, provider);
  return provider;
}

export function getProvider(id) {
  const p = registry.get(id);
  if (!p) throw new Error(`No provider registered with id "${id}". Registered: ${[...registry.keys()].join(', ') || '(none)'}`);
  return p;
}

export function listProviders() {
  return [...registry.values()].map((p) => ({ id: p.id, kind: p.kind }));
}
