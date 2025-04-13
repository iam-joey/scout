const VYBE_API_BASE_URL = 'https://api.vybenetwork.xyz';
const VYBE_API_KEY = process.env.VYBE_NETWORK_KEY!;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const TELEGRAM_BASE_URL = process.env.TELEGRAM_BASE_URL!;

export { VYBE_API_BASE_URL, VYBE_API_KEY, TELEGRAM_BASE_URL, type HttpMethod };
