import { TELEGRAM_BASE_URL } from '../../../utils/constant';

// Token list settings interface
export interface TokenListSettings {
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit: number;
}
import { RedisService } from '../../../services/redisService';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import {
  formatPriceChange,
  formatLargeNumber,
  createPaginationButtons,
} from '../utils/formatters';

const REDIS_TTL = 60;

// Token list settings interface
interface TokenListSettings {
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit: number;
}

/**
 * Initialize token list settings
 */
export async function initializeTokenListSettings(chatId: number) {
  try {
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const existingSettings = await redis.get(tokenListSettingsKey);

    if (!existingSettings) {
      const defaultSettings: TokenListSettings = {
        sortBy: undefined,
        sortDirection: undefined,
        limit: 10,
      };
      await redis.set(
        tokenListSettingsKey,
        JSON.stringify(defaultSettings),
        REDIS_TTL * 5,
      );
    }
  } catch (error) {
    console.error('Error initializing token list settings:', error);
  }
}

/**
 * Display token list settings
 */
export async function displayTokenListSettings(
  chatId: number,
  messageId?: number,
) {
  try {
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const settingsStr = await redis.get(tokenListSettingsKey);
    const settings: TokenListSettings = settingsStr
      ? JSON.parse(settingsStr)
      : { limit: 10 };

    const message =
      `<b>⚙️ Token List Settings</b>\n\n` +
      `<b>📊 Sort By:</b> ${settings.sortBy || 'None'}\n` +
      `<b>↕️ Direction:</b> ${settings.sortDirection || 'None'}\n` +
      `<b>🔢 Limit:</b> ${settings.limit} tokens per page`;

    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📈 Sort by Price',
              callback_data: '/sub-tokens_list_sort_price',
            },
            {
              text: '📊 Sort by Market Cap',
              callback_data: '/sub-tokens_list_sort_marketcap',
            },
          ],
          [
            {
              text: '⬆️ Ascending',
              callback_data: '/sub-tokens_list_direction_asc',
            },
            {
              text: '⬇️ Descending',
              callback_data: '/sub-tokens_list_direction_desc',
            },
          ],
          [
            {
              text: '🔄 Clear Sort',
              callback_data: '/sub-tokens_list_sort_clear',
            },
          ],
          [
            {
              text: '📋 View Token List',
              callback_data: '/sub-tokens_list_page_0',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/tokens' }],
        ],
      },
    };

    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...payload,
        message_id: messageId,
      });
    } else {
      await sendMessage(TELEGRAM_BASE_URL, payload);
    }
  } catch (error) {
    console.error('Error displaying token list settings:', error);
  }
}

/**
 * Update token list sort option
 */
export async function updateTokenListSort(
  chatId: number,
  sortBy: string,
  messageId: number,
) {
  try {
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const settingsStr = await redis.get(tokenListSettingsKey);
    const settings: TokenListSettings = settingsStr
      ? JSON.parse(settingsStr)
      : { limit: 10 };

    settings.sortBy = sortBy;
    await redis.set(
      tokenListSettingsKey,
      JSON.stringify(settings),
      REDIS_TTL * 5,
    );

    await displayTokenListSettings(chatId, messageId);
  } catch (error) {
    console.error('Error updating token list sort:', error);
  }
}

/**
 * Update token list sort direction
 */
export async function updateTokenListSortDirection(
  chatId: number,
  direction: 'asc' | 'desc',
  messageId: number,
) {
  try {
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const settingsStr = await redis.get(tokenListSettingsKey);
    const settings: TokenListSettings = settingsStr
      ? JSON.parse(settingsStr)
      : { limit: 10 };

    settings.sortDirection = direction;
    await redis.set(
      tokenListSettingsKey,
      JSON.stringify(settings),
      REDIS_TTL * 5,
    );

    await displayTokenListSettings(chatId, messageId);
  } catch (error) {
    console.error('Error updating token list sort direction:', error);
  }
}

/**
 * Clear token list sort settings
 */
export async function clearTokenListSort(chatId: number, messageId: number) {
  try {
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const settingsStr = await redis.get(tokenListSettingsKey);
    const settings: TokenListSettings = settingsStr
      ? JSON.parse(settingsStr)
      : { limit: 10 };

    settings.sortBy = undefined;
    settings.sortDirection = undefined;
    await redis.set(
      tokenListSettingsKey,
      JSON.stringify(settings),
      REDIS_TTL * 5,
    );

    await displayTokenListSettings(chatId, messageId);
  } catch (error) {
    console.error('Error clearing token list sort:', error);
  }
}

/**
 * Fetch and display token list with pagination
 */
export async function fetchTokenList(
  chatId: number,
  page: number = 0,
  messageId?: number,
) {
  try {
    // Show initial loading state
    const loadingMessage = await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Token List</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬜⬜⬜⬜</code> 20%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Get settings from Redis
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const settingsStr = await redis.get(tokenListSettingsKey);
    const settings: TokenListSettings = settingsStr
      ? JSON.parse(settingsStr)
      : { limit: 10 };

    // Update to 40%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      text: `<b>🔄 Fetching Token List</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬜⬜⬜</code> 40%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Build query parameters
    let queryParams = `page=${page}&limit=${settings.limit}`;
    if (settings.sortBy) {
      queryParams += `&sortBy=${settings.sortBy}`;
    }
    if (settings.sortDirection) {
      queryParams += `&sortDirection=${settings.sortDirection}`;
    }

    // Fetch token list
    const response = await makeVybeRequest(`tokens?${queryParams}`);

    if (!response || !response.tokens) {
      throw new Error('No token list data found');
    }

    // Update to 60%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      text: `<b>🔄 Fetching Token List</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬜⬜</code> 60%`,
      parse_mode: 'HTML' as 'HTML',
    });

    const { tokens, totalTokens } = response;

    // Format token list
    let message = `<b>📋 Token List</b>\n\n`;

    if (settings.sortBy) {
      message += `<b>📊 Sorted by:</b> ${settings.sortBy}\n`;
      message += `<b>↕️ Direction:</b> ${settings.sortDirection || 'asc'}\n\n`;
    }

    tokens.forEach((token: any, index: number) => {
      const position = page * settings.limit + index + 1;
      message += `<b>${position}. ${token.name}</b> (${token.symbol})\n`;
      message += `   💰 Price: $${token.price ? token.price.toFixed(6) : 'N/A'}\n`;
      message += `   📈 24h: ${formatPriceChange(token.price1d)}\n`;
      message += `   🏦 Market Cap: $${formatLargeNumber(token.marketCap)}\n`;
      message += `   🆔 <code>${token.mintAddress}</code>\n\n`;
    });

    // Create pagination buttons
    const paginationButtons = createPaginationButtons(
      page,
      Math.ceil(totalTokens / settings.limit) - 1,
      '/sub-tokens_list_page_',
    );

    // Update to 100%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      text: `<b>🔄 Fetching Token List</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬛⬛</code> 100%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Send final result
    const finalMessage = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          paginationButtons,
          [
            {
              text: '⚙️ Settings',
              callback_data: '/sub-tokens_list_settings',
            },
          ],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    };

    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...finalMessage,
        message_id: messageId,
      });
    } else {
      await sendMessage(TELEGRAM_BASE_URL, finalMessage);
    }

    // Delete the loading message
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      text: '',
    });
  } catch (error) {
    console.error('Error in fetchTokenList:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token list. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: '/sub-tokens_list_page_0',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/tokens' }],
        ],
      },
    });
  }
}
