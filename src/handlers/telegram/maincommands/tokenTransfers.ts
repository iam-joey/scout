import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { RedisService } from '../../../services/redisService';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import { formatTokenAmount, formatTimestamp, createPaginationButtons } from '../utils/formatters';

const REDIS_TTL = 60;

type FilterValue = string | undefined;

interface TokenTransfersFilter {
  mintAddress: FilterValue;
  fromAddress: FilterValue;
  toAddress: FilterValue;
  limit: number;
}

/**
 * Prompt user to configure transaction history filters
 */
export async function promptTokenTransfersConfig(chatId: number, messageId?: number) {
  try {
    const redis = RedisService.getInstance();
    const filterKey = `token_transfers_filter:${chatId}`;
    const filterStr = await redis.get(filterKey);
    const filter: TokenTransfersFilter = filterStr
      ? JSON.parse(filterStr)
      : { limit: 10 };

    // Store the message ID for later updates
    if (messageId) {
      await redis.set(
        `token_transfers_last_message:${chatId}`,
        messageId.toString(),
        REDIS_TTL * 5,
      );
    }

    const message = `<b>🔍 Token Transfers Filter</b>\n\n` +
      `Configure filters for token transfers:\n\n` +
      `<b>🪙 Token:</b> ${filter.mintAddress || 'Not set'}\n` +
      `<b>📤 From:</b> ${filter.fromAddress || 'Not set'}\n` +
      `<b>📥 To:</b> ${filter.toAddress || 'Not set'}\n` +
      `<b>🔢 Limit:</b> ${filter.limit} per page\n\n` +
      `<i>Click a filter to set/update its value</i>`;

    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🪙 Set Token',
              callback_data: '/sub-tokens_transfers_filter_mintAddress',
            },
          ],
          [
            {
              text: '📤 Set From',
              callback_data: '/sub-tokens_transfers_filter_fromAddress',
            },
          ],
          [
            {
              text: '📥 Set To',
              callback_data: '/sub-tokens_transfers_filter_toAddress',
            },
          ],
          [
            {
              text: '🔄 Clear All',
              callback_data: '/sub-tokens_transfers_clear',
            },
          ],
          [
            {
              text: '🔍 Search',
              callback_data: '/sub-tokens_transfers_page_0',
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
    console.error('Error in promptTokenTransfersConfig:', error);
  }
}

/**
 * Prompt user to enter a specific filter value for token transfers
 */
export async function promptTokenTransfersFilterValue(
  chatId: number,
  filterType: string,
  messageId?: number,
) {
  const redis = RedisService.getInstance();
  await redis.set(
    `token_transfers_state:${chatId}`,
    `waiting_for_${filterType}`,
    REDIS_TTL,
  );

  if (messageId) {
    await redis.set(
      `token_transfers_last_message:${chatId}`,
      messageId.toString(),
      REDIS_TTL * 5,
    );
  }

  const filterNames: { [key: string]: string } = {
    mintAddress: 'token mint address',
    fromAddress: 'sender address',
    toAddress: 'recipient address',
  };

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: `<b>🔍 Enter Filter Value</b>\n\nPlease enter the ${
      filterNames[filterType]
    } to filter by:\n\n<i>Type 'clear' to remove this filter</i>`,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/sub-tokens_transfers_fetch' }]],
    },
  });
}

/**
 * Clear all token transfer filters
 */
export async function clearAllTokenTransfersFilters(chatId: number, messageId?: number) {
  try {
    const redis = RedisService.getInstance();
    const defaultFilter: TokenTransfersFilter = {
      mintAddress: undefined,
      fromAddress: undefined,
      toAddress: undefined,
      limit: 10
    };
    await redis.set(
      `token_transfers_filter:${chatId}`,
      JSON.stringify(defaultFilter),
      REDIS_TTL * 5,
    );

    await promptTokenTransfersConfig(chatId, messageId);
  } catch (error) {
    console.error('Error clearing token transfers filters:', error);
  }
}

/**
 * Update token transfers filter with the provided value
 */
export async function updateTokenTransfersFilter(
  chatId: number,
  filterType: keyof TokenTransfersFilter,
  value: string,
  messageId?: number,
) {
  try {
    const redis = RedisService.getInstance();
    const filterKey = `token_transfers_filter:${chatId}`;
    const filterStr = await redis.get(filterKey);
    const filter: TokenTransfersFilter = filterStr
      ? JSON.parse(filterStr)
      : { limit: 10 };

    if (filterType !== 'limit') {
      filter[filterType] = value.toLowerCase() === 'clear' ? undefined : value;
    }

    await redis.set(filterKey, JSON.stringify(filter), REDIS_TTL * 5);
    await promptTokenTransfersConfig(chatId, messageId);
  } catch (error) {
    console.error('Error updating token transfers filter:', error);
  }
}

/**
 * Fetch and display token transfers with pagination
 */
export async function fetchTokenTransfers(
  chatId: number,
  page: number = 0,
  messageId?: number,
) {
  try {
    // Show initial loading state
    const loadingMessage = await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Token Transfers</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬜⬜⬜⬜</code> 20%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Get filter settings from Redis
    const redis = RedisService.getInstance();
    const filterKey = `token_transfers_filter:${chatId}`;
    const filterStr = await redis.get(filterKey);
    const filter: TokenTransfersFilter = filterStr
      ? JSON.parse(filterStr)
      : { limit: 10 };

    // Update to 40%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      text: `<b>🔄 Fetching Token Transfers</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬜⬜⬜</code> 40%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Build query parameters
    let queryParams = `page=${page}&limit=${filter.limit}`;
    if (filter.mintAddress) queryParams += `&mintAddress=${filter.mintAddress}`;
    if (filter.fromAddress) queryParams += `&fromAddress=${filter.fromAddress}`;
    if (filter.toAddress) queryParams += `&toAddress=${filter.toAddress}`;

    // Fetch token transfers
    const response = await makeVybeRequest(`token-transfers?${queryParams}`);

    if (!response || !response.transfers) {
      throw new Error('No token transfers data found');
    }

    // Update to 60%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      text: `<b>🔄 Fetching Token Transfers</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬜⬜</code> 60%`,
      parse_mode: 'HTML' as 'HTML',
    });

    const { transfers, totalTransfers } = response;

    // Format transfers data
    let message = `<b>📊 Token Transfers</b>\n\n`;

    // Add filter summary
    if (filter.mintAddress || filter.fromAddress || filter.toAddress) {
      message += '<b>🔍 Active Filters:</b>\n';
      if (filter.mintAddress) message += `Token: <code>${filter.mintAddress}</code>\n`;
      if (filter.fromAddress) message += `From: <code>${filter.fromAddress}</code>\n`;
      if (filter.toAddress) message += `To: <code>${filter.toAddress}</code>\n`;
      message += '\n';
    }

    transfers.forEach((transfer: any) => {
      message += `<b>🔄 Transfer</b>\n`;
      message += `From: <code>${transfer.fromAddress}</code>\n`;
      message += `To: <code>${transfer.toAddress}</code>\n`;
      message += `Amount: ${formatTokenAmount(transfer.amount, transfer.decimals)}\n`;
      message += `Token: <code>${transfer.mintAddress}</code>\n`;
      message += `Time: ${formatTimestamp(transfer.timestamp)}\n\n`;
    });

    // Create pagination buttons
    const paginationButtons = createPaginationButtons(
      page,
      Math.ceil(totalTransfers / filter.limit) - 1,
      '/sub-tokens_transfers_page_',
    );

    // Update to 100%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      text: `<b>🔄 Fetching Token Transfers</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬛⬛</code> 100%`,
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
              text: '🔍 Update Filters',
              callback_data: '/sub-tokens_transfers_fetch',
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
    console.error('Error in fetchTokenTransfers:', error);
    const errorMessage = {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token transfers. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: `/sub-tokens_transfers_page_${page}`,
            },
          ],
          [
            {
              text: '🔄 Configure Filters',
              callback_data: '/sub-tokens_transfers_fetch',
            },
          ],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    };

    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...errorMessage,
        message_id: messageId,
      });
    } else {
      await sendMessage(TELEGRAM_BASE_URL, errorMessage);
    }
  }
}

/**
 * Handle token transfers pagination
 */
export async function handleTokenTransfersPagination(
  chatId: number,
  page: number,
  messageId: number,
) {
  await fetchTokenTransfers(chatId, page, messageId);
}
