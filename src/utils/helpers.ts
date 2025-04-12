import type { TelegramSendMessage } from '../types/telegram';
import { VYBE_API_BASE_URL, VYBE_API_KEY, type HttpMethod } from './constant';
import { PublicKey } from '@solana/web3.js';

interface TokenMetric {
  tokenAddress: string;
  tokenSymbol: string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  buys: {
    volumeUsd: number;
    tokenAmount: number;
    transactionCount: number;
  };
  sells: {
    volumeUsd: number;
    tokenAmount: number;
    transactionCount: number;
  };
}

interface BestPerformingToken {
  tokenSymbol: string;
  tokenAddress: string;
  tokenName: string;
  tokenLogoUrl: string;
  pnlUsd: number;
}

async function requestTelegram(
  base_url: string,
  endpPoint: string,
  body: TelegramSendMessage,
) {
  try {
    const url = `${base_url}/${endpPoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('Error response from Telegram API:', response);
    }
    const jsonResponse = await response.json();

    return jsonResponse;
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

export async function sendMessage(base_url: string, body: TelegramSendMessage) {
  return requestTelegram(base_url, 'sendMessage', body);
}

export async function sendErrorMessage(
  base_url: string,
  chatId: number,
  text: string,
  callbackData?: string,
) {
  await sendMessage(base_url, {
    chat_id: chatId,
    text: `⚠️ ${text}`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: ' 🔙 Main Menu',
            callback_data: callbackData || '/main',
          },
        ],
      ],
    },
  });
}

export const formatWalletPnlHtml = (data: any, resolution: string, page: number = 0) => {
  // Extract data and ensure we have a valid totalTokenCount for pagination
  const { summary, tokenMetrics } = data;
  // Use summary.uniqueTokensTraded as a fallback for totalTokenCount if it's not provided
  const totalTokenCount = data.totalTokenCount || (summary?.uniqueTokensTraded || 0);
  
  // Handle case when there's no trading data
  if (!summary || !tokenMetrics || tokenMetrics.length === 0) {
    return {
      text: '<b>📊 No trading data available for this wallet.</b>',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: ' 🔙 Main Menu', callback_data: '/main' }],
        ],
      },
    };
  }

  const summaryHtml = `
<b>📊 Wallet PnL Summary (${resolution.toUpperCase()})</b>

<b>📈 Win Rate:</b> ${summary.winRate ? summary.winRate.toFixed(2) : '0.00'}%
<b>💰 Realized PnL:</b> $${summary.realizedPnlUsd ? summary.realizedPnlUsd.toFixed(2) : '0.00'}
<b>📈 Unrealized PnL:</b> $${summary.unrealizedPnlUsd ? summary.unrealizedPnlUsd.toFixed(2) : '0.00'}
<b>🪙 Unique Tokens Traded:</b> ${summary.uniqueTokensTraded || 0}
<b>💱 Average Trade:</b> $${summary.averageTradeUsd ? summary.averageTradeUsd.toFixed(2) : '0.00'}
<b>🔄 Total Trades:</b> ${summary.tradesCount || 0}
<b>✅ Winning Trades:</b> ${summary.winningTradesCount || 0}
<b>❌ Losing Trades:</b> ${summary.losingTradesCount || 0}
<b>📊 Total Volume:</b> $${summary.tradesVolumeUsd ? summary.tradesVolumeUsd.toFixed(2) : '0.00'}
`;

  // Only add best/worst performing tokens if they exist
  let performanceHtml = '';
  if (summary.bestPerformingToken?.tokenSymbol) {
    performanceHtml += `
<b>🏆 Best Performing Token:</b> ${summary.bestPerformingToken.tokenSymbol} ($${summary.bestPerformingToken.pnlUsd.toFixed(2)})`;
  }
  if (summary.worstPerformingToken?.tokenSymbol) {
    performanceHtml += `
<b>👎 Worst Performing Token:</b> ${summary.worstPerformingToken.tokenSymbol} ($${summary.worstPerformingToken.pnlUsd.toFixed(2)})`;
  }

  const summaryWithPerformance = summaryHtml + performanceHtml;

  const tokenMetricsHtml = tokenMetrics.map((token: TokenMetric) => `
<b>🪙 ${token.tokenSymbol}</b>
<b>📈 Realized PnL:</b> $${token.realizedPnlUsd ? token.realizedPnlUsd.toFixed(2) : '0.00'}
<b>📊 Unrealized PnL:</b> $${token.unrealizedPnlUsd ? token.unrealizedPnlUsd.toFixed(2) : '0.00'}
<b>🛒 Buys:</b> ${token.buys?.transactionCount || 0} trades ($${token.buys?.volumeUsd ? token.buys.volumeUsd.toFixed(2) : '0.00'})
<b>💰 Sells:</b> ${token.sells?.transactionCount || 0} trades ($${token.sells?.volumeUsd ? token.sells.volumeUsd.toFixed(2) : '0.00'})
`).join('\n');

  // Calculate pagination
  // Ensure we have at least 1 page if there are any tokens
  const totalPages = Math.max(1, Math.ceil(totalTokenCount / 5));
  const paginationButtons = [];

  // Add page indicator
  const pageInfo = `\n\nPage ${page + 1} of ${Math.max(1, totalPages)}`;

  if (page > 0) {
    paginationButtons.push({
      text: '⬅️ Previous',
      callback_data: `/sub-pnl_page_${page - 1}`,
    });
  }

  if (page < totalPages - 1) {
    paginationButtons.push({
      text: 'Next ➡️',
      callback_data: `/sub-pnl_page_${page + 1}`,
    });
  }

  return {
    text: summaryWithPerformance + (tokenMetrics.length > 0 ? '\n\n<b>Token Details:</b>' + tokenMetricsHtml + pageInfo : ''),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        ...(tokenMetrics.length > 0 ? [paginationButtons] : []),
        [{ text: ' 🔙 Main Menu', callback_data: '/main' }],
      ],
    },
    disable_web_page_preview: true,
  };
};

export async function updateMessage(
  base_url: string,
  body: TelegramSendMessage,
) {
  return requestTelegram(base_url, 'editMessageText', body);
}

export const makeVybeRequest = async (
  endpoint: string,
  method: HttpMethod = 'GET',
  body?: unknown,
) => {
  try {
    const response = await fetch(`${VYBE_API_BASE_URL}/${endpoint}`, {
      method,
      headers: {
        accept: 'application/json',
        'X-API-KEY': VYBE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    console.log(response);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data=await response.json();
    return data;
  } catch (error) {
    console.error('Error making Vybe request:', error);
    throw error;
  }
};

export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  if (address.length < 32 || address.length > 44) {
    return false;
  }

  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

const escapeHtml = (str = '') =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const formatNftSummaryHtml = (
  data: any,
  page: number = 0,
  limit: number = 5
) => {
  const totalPages = Math.ceil(data.totalNftCollectionCount / limit);
  // API already returns paginated data, so we don't need to slice
  const collections = data.data;

  const summary = `
<b>🧾 NFT Portfolio Summary</b>

<b>👤 Owner:</b> <code>${escapeHtml(data.ownerAddress)}</code>
<b>📅 Date:</b> ${new Date(data.date).toDateString()}
<b>💰 Total Value:</b> ${data.totalSol} SOL ($${Number(data.totalUsd).toFixed(2)})
<b>📦 Total Collections:</b> ${data.totalNftCollectionCount}
<b>🔍 Current Page:</b> ${page + 1} of ${totalPages}

`;

  const collectionsHtml = collections
    .map((item: any) => {
      const name = escapeHtml(item.name || 'Unknown Collection');
      const logoUrl = item.logoUrl
        ? `
<b>🖼️ Logo:</b> <a href="${escapeHtml(item.logoUrl)}">${escapeHtml(item.logoUrl)}</a>`
        : '';

      return `
<b>🎨 ${name}</b>
<b>📍 Collection:</b> <code>${escapeHtml(item.collectionAddress)}</code>
<b>🖼️ Items Owned:</b> ${item.totalItems}
<b>💸 Value:</b> ${item.valueSol} SOL ($${Number(item.valueUsd).toFixed(2)})
<b>🧩 Slot:</b> ${item.slot}
${logoUrl}
`;
    })
    .join('');

  const paginationButtons = [];

  if (page > 0) {
    paginationButtons.push({
      text: '⬅️ Previous',
      callback_data: `/sub-nft_balance_page_${page - 1}`,
    });
  }

  if (page < totalPages - 1) {
    paginationButtons.push({
      text: 'Next ➡️',
      callback_data: `/sub-nft_balance_page_${page + 1}`,
    });
  }

  return {
    text: summary + collectionsHtml,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        paginationButtons,
        [
          {
            text: ' 🔙 Main Menu',
            callback_data: '/main',
          },
        ],
      ],
    },
    disable_web_page_preview: true,
  };
};

export const formatTokenBalanceHtml = (
  data: any,
  page: number = 0,
  limit: number = 5,
) => {
  const totalPages = Math.ceil(data.totalTokenCount / limit);
  // API already returns paginated data, so we don't need to slice
  const paginatedData = data.data;

  const summary = `
<b>💰 Token Portfolio Summary</b>

<b>👤 Owner:</b> <code>${escapeHtml(data.ownerAddress)}</code>
<b>📅 Date:</b> ${new Date(data.date).toDateString()}
<b>💰 Total Value:</b> $${Number(data.totalTokenValueUsd).toFixed(2)}
<b>📈 24h Change:</b> ${data.totalTokenValueUsd1dChange >= 0 ? '+' : ''}${Number(data.totalTokenValueUsd1dChange).toFixed(2)}%
<b>📦 Total Tokens:</b> ${data.totalTokenCount}
<b>🔍 Current Page:</b> ${page + 1} of ${totalPages}

`;

  const tokens = paginatedData
    .map((token: any) => {
      const priceChange = Number(token.priceUsd1dChange);
      const changeIndicator = priceChange >= 0 ? '📈' : '📉';

      return `
<b>🪙 ${escapeHtml(token.name)} (${escapeHtml(token.symbol)})</b>
<b>💰 Amount:</b> ${Number(token.amount).toFixed(6)}
<b>💵 Value:</b> $${Number(token.valueUsd).toFixed(2)}
<b>📊 Price:</b> $${Number(token.priceUsd).toFixed(2)} ${changeIndicator} ${priceChange.toFixed(2)}%
<b>📁 Category:</b> ${escapeHtml(token.category)}
`;
    })
    .join('\n');

  const paginationButtons = [];

  if (page > 0) {
    paginationButtons.push({
      text: '⬅️ Previous',
      callback_data: `/sub-token_balance_page_${page - 1}`,
    });
  }

  if (page < totalPages - 1) {
    paginationButtons.push({
      text: 'Next ➡️',
      callback_data: `/sub-token_balance_page_${page + 1}`,
    });
  }

  return {
    text: summary + tokens,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        paginationButtons,
        [
          {
            text: ' 🔙 Main Menu',
            callback_data: '/main',
          },
        ],
      ],
    },
  };
};
