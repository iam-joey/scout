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
        [{ text: '📈 Top Token Holders', callback_data: '/sub-tokens_holders_fetch' }],
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
/**
 * Prompt user to enter token mint address for top token holders
 */
export async function promptTokenMintAddressForHolders(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`token_holders_state:${chatId}`, 'waiting_for_mint_address', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Token Mint Address</b>\n\nPlease enter the <b>mint address</b> of the token to fetch top holders for:\n\n<i>Example: Enter the unique identifier for the token</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/tokens' }]
      ]
    }
  });
}

/**
 * Create pagination buttons for a given page
 */
function createHoldersPaginationButtons(
  currentPage: number
): { text: string; callback_data: string }[] {
  const buttons = [];
  if (currentPage > 0) {
    buttons.push({
      text: '⬅️ Previous',
      callback_data: `/sub-tokens_holders_page_${currentPage - 1}`,
    });
  }
  
  buttons.push({
    text: '➡️ Next',
    callback_data: `/sub-tokens_holders_page_${currentPage + 1}`,
  });
  
  return buttons;
}

/**
 * Fetch and display top token holders with pagination
 */
export async function fetchTopTokenHolders(chatId: number, mintAddress: string, page: number = 0) {
  try {
    const redis = RedisService.getInstance();
    
    // Store mint address in Redis for pagination
    await redis.set(`token_holders_mint:${chatId}`, mintAddress, REDIS_TTL * 5);
    
    // Send loading message
    if (page === 0) {
      await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: `<b>⏳ Processing</b>\n\nFetching top holders for token mint address: <code>${mintAddress}</code>\n\nPlease wait...`,
        parse_mode: 'HTML' as 'HTML'
      });
    }
    
    // Fetch top token holders
    const limit = 10;
    const response = await makeVybeRequest(`token/${mintAddress}/top-holders?page=${page}&limit=${limit}`);
    if (!response || !response.data || response.data.length === 0) {
      if (page === 0) {
        throw new Error('No token holders data found');
      } else {
        // If we're on a page with no data, but not the first page, show message and return to previous page
        await sendMessage(TELEGRAM_BASE_URL, {
          chat_id: chatId,
          text: '<b>ℹ️ Notice</b>\n\nNo more token holders found.',
          parse_mode: 'HTML' as 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Previous Page', callback_data: `/sub-tokens_holders_page_${page - 1}` }],
              [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
            ]
          }
        });
        return;
      }
    }
    
    // Format the token holders data
    const data = response.data;
    
    // Get token info from the first holder (if available)
    const tokenSymbol = data.length > 0 && data[0].tokenSymbol ? data[0].tokenSymbol : 'Unknown';
    
    let formattedHolders = data.map((holder: any, index: number) => 
      `<b>${page * limit + index + 1}. ${holder.ownerName || 'Wallet'}:</b> <code>${holder.ownerAddress}</code>\n` +
      `<b>Balance:</b> ${formatLargeNumber(parseFloat(holder.balance || '0'))}\n` +
      `<b>Percentage:</b> ${holder.percentageOfSupplyHeld ? (holder.percentageOfSupplyHeld * 100).toFixed(2) : '0'}%\n` +
      `<b>Value (USD):</b> $${holder.valueUsd || 'N/A'}`
    ).join('\n\n');
    
    // Create pagination buttons
    const paginationButtons = createHoldersPaginationButtons(page);
    
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>📈 Top Token Holders</b>\n\n<b>Token:</b> ${tokenSymbol}\n<b>Mint Address:</b> <code>${mintAddress}</code>\n<b>Page:</b> ${page + 1}\n\n${formattedHolders}`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          paginationButtons,
          [{ text: '🔄 Refresh', callback_data: `/sub-tokens_holders_page_${page}` }],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in fetchTopTokenHolders:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token holders. Please verify the mint address and try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-tokens_holders_fetch' }],
          [{ text: '🔙 Back', callback_data: '/tokens' }]
        ]
      }
    });
  }
}

/**
 * Handle token holders pagination
 */
export async function handleTokenHoldersPagination(chatId: number, page: number, messageId: number) {
  try {
    const redis = RedisService.getInstance();
    const mintAddress = await redis.get(`token_holders_mint:${chatId}`);
    
    if (!mintAddress) {
      await updateMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        message_id: messageId,
        text: '<b>❌ Error</b>\n\nToken information expired. Please fetch token holders again.',
        parse_mode: 'HTML' as 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Fetch Token Holders', callback_data: '/sub-tokens_holders_fetch' }],
            [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
          ]
        }
      });
      return;
    }
    
    // Fetch top token holders
    const limit = 10;
    const response = await makeVybeRequest(`token/${mintAddress}/top-holders?page=${page}&limit=${limit}`);
    
    if (!response || !response.data || response.data.length === 0) {
      if (page === 0) {
        await updateMessage(TELEGRAM_BASE_URL, {
          chat_id: chatId,
          message_id: messageId,
          text: '<b>❌ Error</b>\n\nNo token holders data found.',
          parse_mode: 'HTML' as 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: '/sub-tokens_holders_fetch' }],
              [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
            ]
          }
        });
        return;
      } else {
        // If we're on a page with no data, but not the first page, show message and return to previous page
        await updateMessage(TELEGRAM_BASE_URL, {
          chat_id: chatId,
          message_id: messageId,
          text: '<b>ℹ️ Notice</b>\n\nNo more token holders found.',
          parse_mode: 'HTML' as 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Previous Page', callback_data: `/sub-tokens_holders_page_${page - 1}` }],
              [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
            ]
          }
        });
        return;
      }
    }
    
    // Format the token holders data
    const data = response.data;
    
    // Get token info from the first holder (if available)
    const tokenSymbol = data.length > 0 && data[0].tokenSymbol ? data[0].tokenSymbol : 'Unknown';
    
    let formattedHolders = data.map((holder: any, index: number) => 
      `<b>${page * limit + index + 1}. ${holder.ownerName || 'Wallet'}:</b> <code>${holder.ownerAddress}</code>\n` +
      `<b>Balance:</b> ${formatLargeNumber(parseFloat(holder.balance || '0'))}\n` +
      `<b>Percentage:</b> ${holder.percentageOfSupplyHeld ? (holder.percentageOfSupplyHeld * 100).toFixed(2) : '0'}%\n` +
      `<b>Value (USD):</b> $${holder.valueUsd || 'N/A'}`
    ).join('\n\n');
    
    // Create pagination buttons
    const paginationButtons = createHoldersPaginationButtons(page);
    
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: `<b>📈 Top Token Holders</b>\n\n<b>Token:</b> ${tokenSymbol}\n<b>Mint Address:</b> <code>${mintAddress}</code>\n<b>Page:</b> ${page + 1}\n\n${formattedHolders}`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          paginationButtons,
          [{ text: '🔄 Refresh', callback_data: `/sub-tokens_holders_page_${page}` }],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in handleTokenHoldersPagination:', error);
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token holders. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-tokens_holders_fetch' }],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }]
        ]
      }
    });
  }
}

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
