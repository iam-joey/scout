const VYBE_API_BASE_URL = 'https://api.vybenetwork.xyz';
const VYBE_API_KEY = process.env.VYBE_NETWORK_KEY!;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const TELEGRAM_BASE_URL = process.env.TELEGRAM_BASE_URL!;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

export type TokenSymbol = 'sol' | 'eth' | 'btc';

export const COMMON_TOKENS: Record<TokenSymbol, string> = {
  'sol': 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
  'eth': 'JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB',
  'btc': 'GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU'
};

const MAX_PRICE_ALERTS = 3;

export { VYBE_API_BASE_URL, VYBE_API_KEY, TELEGRAM_BASE_URL, MAX_PRICE_ALERTS, type HttpMethod };
