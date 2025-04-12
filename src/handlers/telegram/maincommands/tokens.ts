import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { makeVybeRequest, sendMessage, updateMessage } from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

// Constants
const REDIS_TTL = 60;

/**
 * Display tokens menu
 */
export async function displayTokensMenu(chatId: number, messageId?: number) {
  const payload = {
    chat_id: chatId,
    text: '💸 Token Insights - Choose an option below:',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔍 Token Details', callback_data: '/sub-tokens_details_fetch' }],
        [{ text: '🔙 Back to Main Menu', callback_data: '/main' }]
      ]
    }
  };

  if (messageId) {
    await updateMessage(TELEGRAM_BASE_URL, { ...payload, message_id: messageId });
  } else {
    await sendMessage(TELEGRAM_BASE_URL, payload);
  }
}

/**
 * Prompt user to enter token mint address for token details
 */
export async function promptTokenMintAddress(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`token_details_state:${chatId}`, 'waiting_for_mint_address', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Token Mint Address</b>\n\nPlease enter the <b>mint address</b> of the token to fetch details for:\n\n<i>Example: Enter the unique identifier for the token</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/tokens' }]
      ]
    }
  });
}

/**
 * Format price change with arrow indicator
 */
function formatPriceChange(change: number | undefined): string {
  if (change === undefined || change === null) return 'N/A';
  
  const arrow = change >= 0 ? '🟢 ↗️' : '🔴 ↘️';
  return `${arrow} ${change.toFixed(2)}%`;
}

/**
 * Format large numbers with appropriate suffixes
 */
function formatLargeNumber(num: number | undefined): string {
  if (num === undefined || num === null) return 'N/A';
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  
  return num.toString();
}

/**
 * Fetch and display token details
 */
export async function fetchTokenDetails(chatId: number, mintAddress: string) {
  try {
    // Send loading message
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>⏳ Processing</b>\n\nFetching token details for mint address: <code>${mintAddress}</code>\n\nPlease wait...`,
      parse_mode: 'HTML' as 'HTML'
    });
    
    // Fetch token details
    const response = await makeVybeRequest(`token/${mintAddress}`);
    
    if (!response) {
      throw new Error('No token data found');
    }
    
    const data = response;
    
    // Format the token details
    let formattedDetails = 
      `<b>🪙 Token:</b> ${data.name || 'N/A'} (${data.symbol || 'N/A'})\n` +
      `<b>💰 Price:</b> $${data.price !== undefined ? data.price.toFixed(6) : 'N/A'}\n` +
      `<b>📈 24h Change:</b> ${formatPriceChange(data.price1d)}\n` +
      `<b>📊 7d Change:</b> ${formatPriceChange(data.price7d)}\n` +
      `<b>🏦 Market Cap:</b> $${formatLargeNumber(data.marketCap)}\n` +
      `<b>💱 24h Volume (Token):</b> ${formatLargeNumber(data.tokenAmountVolume24h)}\n` +
      `<b>💵 24h Volume (USD):</b> $${formatLargeNumber(data.usdValueVolume24h)}\n` +
      `<b>🔢 Decimals:</b> ${data.decimal !== undefined ? data.decimal : 'N/A'}\n` +
      `<b>📊 Current Supply:</b> ${formatLargeNumber(data.currentSupply)}\n` +
      `<b>🏷️ Category:</b> ${data.category || 'N/A'}\n` +
      `<b>🔖 Subcategory:</b> ${data.subcategory || 'N/A'}\n` +
      `<b>✅ Verified:</b> ${data.verified ? 'Yes' : 'No'}\n` +
      `<b>🆔 Mint Address:</b> <code>${data.mintAddress || mintAddress}</code>\n`;
    
    // Add logo if available
    let disableWebPreview = true;
    if (data.logoUrl) {
      formattedDetails += `\n<b>🖼️ Logo:</b> <a href="${data.logoUrl}">View Logo</a>`;
      disableWebPreview = false;
    }
    
    // Add update time if available
    if (data.updateTime) {
      const updateDate = new Date(data.updateTime * 1000);
      formattedDetails += `\n<b>🕒 Last Updated:</b> ${updateDate.toLocaleString()}`;
    }
    
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔍 Token Details</b>\n\n${formattedDetails}`,
      parse_mode: 'HTML' as 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Fetch Another', callback_data: '/sub-tokens_details_fetch' }],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in fetchTokenDetails:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token details. Please verify the mint address and try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-tokens_details_fetch' }],
          [{ text: '🔙 Back', callback_data: '/tokens' }]
        ]
      }
    });
  }
}
