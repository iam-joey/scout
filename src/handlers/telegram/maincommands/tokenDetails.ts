import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { RedisService } from '../../../services/redisService';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import { formatPriceChange, formatLargeNumber } from '../utils/formatters';

const REDIS_TTL = 60;

/**
 * Prompt user to enter token mint address for token details
 */
export async function promptTokenMintAddress(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(
    `token_details_state:${chatId}`,
    'waiting_for_mint_address',
    REDIS_TTL,
  );

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Token Mint Address</b>\n\nPlease enter the <b>mint address</b> of the token to fetch details for:\n\n<i>Example: Enter the unique identifier for the token</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/tokens' }]],
    },
  });
}

/**
 * Fetch and display token details
 */
export async function fetchTokenDetails(chatId: number, mintAddress: string) {
  try {
    // Show initial loading state
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Token Details</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬜⬜⬜⬜</code> 20%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Update to 40%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Token Details</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬜⬜⬜</code> 40%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Fetch token details
    const response = await makeVybeRequest(`token/${mintAddress}`);

    if (!response) {
      throw new Error('No token data found');
    }

    // Update to 60%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Token Details</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬜⬜</code> 60%`,
      parse_mode: 'HTML' as 'HTML',
    });

    const data = response;

    // Update to 80%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Token Details</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬛⬜</code> 80%`,
      parse_mode: 'HTML' as 'HTML',
    });

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

    // Update to 100%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Token Details</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬛⬛</code> 100%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Send final result
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔍 Token Details</b>\n\n${formattedDetails}`,
      parse_mode: 'HTML' as 'HTML',
      disable_web_page_preview: disableWebPreview,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Fetch Another',
              callback_data: '/sub-tokens_details_fetch',
            },
          ],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    });
  } catch (error) {
    console.error('Error in fetchTokenDetails:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token details. Please verify the mint address and try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: '/sub-tokens_details_fetch',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/tokens' }],
        ],
      },
    });
  }
}
