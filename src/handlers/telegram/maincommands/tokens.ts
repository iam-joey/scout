import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

// Constants
const REDIS_TTL = 60;

// Token list settings interface
interface TokenListSettings {
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit: number;
}

/**
 * Display tokens menu
 */
export async function displayTokensMenu(chatId: number, messageId?: number) {
  // Initialize token list settings
  await initializeTokenListSettings(chatId);

  const payload = {
    chat_id: chatId,
    text: '💸 Token Insights - Choose an option below:',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔍 Token Details',
            callback_data: '/sub-tokens_details_fetch',
          },
        ],
        [
          {
            text: '📈 Top Token Holders',
            callback_data: '/sub-tokens_holders_fetch',
          },
        ],
        [
          {
            text: '📊 Tokens Transfer History',
            callback_data: '/sub-tokens_transfers_fetch',
          },
        ],
        [
          {
            text: '📋 Get All Tokens',
            callback_data: '/sub-tokens_list_settings',
          },
        ],
        [{ text: '🔙 Back to Main Menu', callback_data: '/main' }],
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
}

/**
 * Initialize token list settings
 */
async function initializeTokenListSettings(chatId: number) {
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
  await redis.set(
    `token_holders_state:${chatId}`,
    'waiting_for_mint_address',
    REDIS_TTL,
  );

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Token Mint Address</b>\n\nPlease enter the <b>mint address</b> of the token to fetch top holders for:\n\n<i>Example: Enter the unique identifier for the token</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/tokens' }]],
    },
  });
}

/**
 * Create pagination buttons for a given page
 */
function createHoldersPaginationButtons(
  currentPage: number,
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
export async function fetchTopTokenHolders(
  chatId: number,
  mintAddress: string,
  page: number = 0,
) {
  try {
    const redis = RedisService.getInstance();

    // Store mint address in Redis for pagination
    await redis.set(`token_holders_mint:${chatId}`, mintAddress, REDIS_TTL * 5);

    // Send loading message
    if (page === 0) {
      await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: `<b>⏳ Processing</b>\n\nFetching top holders for token mint address: <code>${mintAddress}</code>\n\nPlease wait...`,
        parse_mode: 'HTML' as 'HTML',
      });
    }

    // Fetch top token holders
    const limit = 10;
    const response = await makeVybeRequest(
      `token/${mintAddress}/top-holders?page=${page}&limit=${limit}`,
    );
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
              [
                {
                  text: '⬅️ Previous Page',
                  callback_data: `/sub-tokens_holders_page_${page - 1}`,
                },
              ],
              [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
            ],
          },
        });
        return;
      }
    }

    // Format the token holders data
    const data = response.data;

    // Get token info from the first holder (if available)
    const tokenSymbol =
      data.length > 0 && data[0].tokenSymbol ? data[0].tokenSymbol : 'Unknown';

    let formattedHolders = data
      .map(
        (holder: any, index: number) =>
          `<b>${page * limit + index + 1}. ${holder.ownerName || 'Wallet'}:</b> <code>${holder.ownerAddress}</code>\n` +
          `<b>Balance:</b> ${formatLargeNumber(parseFloat(holder.balance || '0'))}\n` +
          `<b>Percentage:</b> ${holder.percentageOfSupplyHeld ? (holder.percentageOfSupplyHeld * 100).toFixed(2) : '0'}%\n` +
          `<b>Value (USD):</b> $${holder.valueUsd || 'N/A'}`,
      )
      .join('\n\n');

    // Create pagination buttons
    const paginationButtons = createHoldersPaginationButtons(page);

    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>📈 Top Token Holders</b>\n\n<b>Token:</b> ${tokenSymbol}\n<b>Mint Address:</b> <code>${mintAddress}</code>\n<b>Page:</b> ${page + 1}\n\n${formattedHolders}`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          paginationButtons,
          [
            {
              text: '🔄 Refresh',
              callback_data: `/sub-tokens_holders_page_${page}`,
            },
          ],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    });
  } catch (error) {
    console.error('Error in fetchTopTokenHolders:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token holders. Please verify the mint address and try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: '/sub-tokens_holders_fetch',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/tokens' }],
        ],
      },
    });
  }
}

/**
 * Handle token holders pagination
 */
export async function handleTokenHoldersPagination(
  chatId: number,
  page: number,
  messageId: number,
) {
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
            [
              {
                text: '🔄 Fetch Token Holders',
                callback_data: '/sub-tokens_holders_fetch',
              },
            ],
            [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
          ],
        },
      });
      return;
    }

    // Fetch top token holders
    const limit = 10;
    const response = await makeVybeRequest(
      `token/${mintAddress}/top-holders?page=${page}&limit=${limit}`,
    );

    if (!response || !response.data || response.data.length === 0) {
      if (page === 0) {
        await updateMessage(TELEGRAM_BASE_URL, {
          chat_id: chatId,
          message_id: messageId,
          text: '<b>❌ Error</b>\n\nNo token holders data found.',
          parse_mode: 'HTML' as 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔄 Try Again',
                  callback_data: '/sub-tokens_holders_fetch',
                },
              ],
              [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
            ],
          },
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
              [
                {
                  text: '⬅️ Previous Page',
                  callback_data: `/sub-tokens_holders_page_${page - 1}`,
                },
              ],
              [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
            ],
          },
        });
        return;
      }
    }

    // Format the token holders data
    const data = response.data;

    // Get token info from the first holder (if available)
    const tokenSymbol =
      data.length > 0 && data[0].tokenSymbol ? data[0].tokenSymbol : 'Unknown';

    let formattedHolders = data
      .map(
        (holder: any, index: number) =>
          `<b>${page * limit + index + 1}. ${holder.ownerName || 'Wallet'}:</b> <code>${holder.ownerAddress}</code>\n` +
          `<b>Balance:</b> ${formatLargeNumber(parseFloat(holder.balance || '0'))}\n` +
          `<b>Percentage:</b> ${holder.percentageOfSupplyHeld ? (holder.percentageOfSupplyHeld * 100).toFixed(2) : '0'}%\n` +
          `<b>Value (USD):</b> $${holder.valueUsd || 'N/A'}`,
      )
      .join('\n\n');

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
          [
            {
              text: '🔄 Refresh',
              callback_data: `/sub-tokens_holders_page_${page}`,
            },
          ],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
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
          [
            {
              text: '🔄 Try Again',
              callback_data: '/sub-tokens_holders_fetch',
            },
          ],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    });
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
    const settingsJson = await redis.get(tokenListSettingsKey);

    if (!settingsJson) {
      await initializeTokenListSettings(chatId);
      return await displayTokenListSettings(chatId, messageId);
    }

    const settings: TokenListSettings = JSON.parse(settingsJson);

    // Create sort options buttons
    const sortOptions = [
      'mintAddress',
      'currentSupply',
      'marketCap',
      'name',
      'price',
      'symbol',
    ];

    const sortByButtons = sortOptions.map((option) => ({
      text: `${settings.sortBy === option ? '✅ ' : ''}${option}`,
      callback_data: `/sub-tokens_list_sort_${option}`,
    }));

    // Split sort options into rows of 2
    const sortByRows = [];
    for (let i = 0; i < sortByButtons.length; i += 2) {
      sortByRows.push(sortByButtons.slice(i, i + 2));
    }

    // Direction buttons
    const directionButtons = [
      {
        text: `${settings.sortDirection === 'asc' ? '✅ ' : ''}Ascending`,
        callback_data: '/sub-tokens_list_direction_asc',
      },
      {
        text: `${settings.sortDirection === 'desc' ? '✅ ' : ''}Descending`,
        callback_data: '/sub-tokens_list_direction_desc',
      },
    ];

    // Current settings description
    let settingsDescription = '<b>Current Settings:</b>\n';
    if (settings.sortBy && settings.sortDirection) {
      settingsDescription += `Sort by: <b>${settings.sortBy}</b> (${settings.sortDirection === 'asc' ? 'Ascending' : 'Descending'})\n`;
    } else {
      settingsDescription += 'No sorting applied (default order)\n';
    }
    settingsDescription += `Limit: <b>${settings.limit}</b> tokens per page`;

    const payload = {
      chat_id: chatId,
      text: `<b>⚙️ Token List Settings</b>\n\n${settingsDescription}\n\n<b>Sort By:</b>`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...sortByRows,
          directionButtons,
          [
            {
              text: '🔄 Clear Sorting',
              callback_data: '/sub-tokens_list_clear_sort',
            },
          ],
          [
            {
              text: '📋 Fetch Tokens',
              callback_data: '/sub-tokens_list_fetch_0',
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
    const payload = {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to display token list settings.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: '/tokens' }]],
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
    const settingsJson = await redis.get(tokenListSettingsKey);

    if (!settingsJson) {
      await initializeTokenListSettings(chatId);
      return await updateTokenListSort(chatId, sortBy, messageId);
    }

    const settings: TokenListSettings = JSON.parse(settingsJson);

    // If the same sort option is selected, toggle it off
    if (settings.sortBy === sortBy) {
      settings.sortBy = undefined;
      settings.sortDirection = undefined;
    } else {
      settings.sortBy = sortBy;
      // Set default direction to desc if not already set
      if (!settings.sortDirection) {
        settings.sortDirection = 'desc';
      }
    }

    await redis.set(
      tokenListSettingsKey,
      JSON.stringify(settings),
      REDIS_TTL * 5,
    );
    await displayTokenListSettings(chatId, messageId);
  } catch (error) {
    console.error('Error updating token list sort:', error);
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: '<b>❌ Error</b>\n\nUnable to update sort settings.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: '/tokens' }]],
      },
    });
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
    const settingsJson = await redis.get(tokenListSettingsKey);

    if (!settingsJson) {
      await initializeTokenListSettings(chatId);
      return await updateTokenListSortDirection(chatId, direction, messageId);
    }

    const settings: TokenListSettings = JSON.parse(settingsJson);

    // Only update direction if a sort option is selected
    if (settings.sortBy) {
      settings.sortDirection = direction;
      await redis.set(
        tokenListSettingsKey,
        JSON.stringify(settings),
        REDIS_TTL * 5,
      );
    }

    await displayTokenListSettings(chatId, messageId);
  } catch (error) {
    console.error('Error updating token list sort direction:', error);
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: '<b>❌ Error</b>\n\nUnable to update sort direction.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: '/tokens' }]],
      },
    });
  }
}

/**
 * Clear token list sort settings
 */
export async function clearTokenListSort(chatId: number, messageId: number) {
  try {
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const settingsJson = await redis.get(tokenListSettingsKey);

    if (!settingsJson) {
      await initializeTokenListSettings(chatId);
      return await displayTokenListSettings(chatId, messageId);
    }

    const settings: TokenListSettings = JSON.parse(settingsJson);
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
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: '<b>❌ Error</b>\n\nUnable to clear sort settings.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: '/tokens' }]],
      },
    });
  }
}

/**
 * Create token list pagination buttons
 */
function createTokenListPaginationButtons(
  currentPage: number,
): { text: string; callback_data: string }[] {
  const buttons = [];
  if (currentPage > 0) {
    buttons.push({
      text: '⬅️ Previous',
      callback_data: `/sub-tokens_list_fetch_${currentPage - 1}`,
    });
  }

  buttons.push({
    text: '➡️ Next',
    callback_data: `/sub-tokens_list_fetch_${currentPage + 1}`,
  });

  return buttons;
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
    const redis = RedisService.getInstance();
    const tokenListSettingsKey = `token_list_settings:${chatId}`;
    const settingsJson = await redis.get(tokenListSettingsKey);

    if (!settingsJson) {
      await initializeTokenListSettings(chatId);
      return await fetchTokenList(chatId, page, messageId);
    }

    const settings: TokenListSettings = JSON.parse(settingsJson);
    const limit = settings.limit;

    // Build query parameters
    let queryParams = `limit=${limit}&page=${page}`;

    if (settings.sortBy && settings.sortDirection) {
      if (settings.sortDirection === 'asc') {
        queryParams += `&sortByAsc=${settings.sortBy}`;
      } else {
        queryParams += `&sortByDesc=${settings.sortBy}`;
      }
    }

    // Send loading message if this is the first page and no messageId
    if (page === 0 && !messageId) {
      await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: `<b>⏳ Processing</b>\n\nFetching token list...\n\nPlease wait...`,
        parse_mode: 'HTML' as 'HTML',
      });
    }

    // Fetch token list
    const response = await makeVybeRequest(`tokens?${queryParams}`);

    if (!response || !response.data || response.data.length === 0) {
      if (page === 0) {
        const message = {
          chat_id: chatId,
          text: '<b>❌ Error</b>\n\nNo tokens found.',
          parse_mode: 'HTML' as 'HTML',
          reply_markup: {
            inline_keyboard: [
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
            ...message,
            message_id: messageId,
          });
        } else {
          await sendMessage(TELEGRAM_BASE_URL, message);
        }
        return;
      } else {
        // If we're on a page with no data, but not the first page, show message and return to previous page
        const message = {
          chat_id: chatId,
          text: '<b>ℹ️ Notice</b>\n\nNo more tokens found.',
          parse_mode: 'HTML' as 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '⬅️ Previous Page',
                  callback_data: `/sub-tokens_list_fetch_${page - 1}`,
                },
              ],
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
            ...message,
            message_id: messageId,
          });
        } else {
          await sendMessage(TELEGRAM_BASE_URL, message);
        }
        return;
      }
    }

    // Format the token list data
    const data = response.data;

    let formattedTokens = data
      .map(
        (token: any, index: number) =>
          `<b>${page * limit + index + 1}. ${token.name || 'Unknown'}</b> (${token.symbol || 'N/A'})\n` +
          `<b>Price:</b> $${token.price !== undefined ? token.price.toFixed(6) : 'N/A'}\n` +
          `<b>Market Cap:</b> $${formatLargeNumber(token.marketCap)}\n` +
          `<b>Current Supply:</b> ${formatLargeNumber(token.currentSupply)}\n` +
          `<b>24h Change:</b> ${formatPriceChange(token.price1d)}\n` +
          `<b>Mint:</b> <code>${token.mintAddress}</code>`,
      )
      .join('\n\n');

    // Create pagination buttons
    const paginationButtons = createTokenListPaginationButtons(page);

    // Create sort description
    let sortDescription = '';
    if (settings.sortBy && settings.sortDirection) {
      sortDescription = `Sorted by: <b>${settings.sortBy}</b> (${settings.sortDirection === 'asc' ? 'Ascending' : 'Descending'})`;
    }

    const message = {
      chat_id: chatId,
      text: `<b>📋 Token List</b>\n\n${sortDescription ? sortDescription + '\n\n' : ''}${formattedTokens}`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          paginationButtons,
          [{ text: '⚙️ Settings', callback_data: '/sub-tokens_list_settings' }],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    };

    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...message,
        message_id: messageId,
      });
    } else {
      await sendMessage(TELEGRAM_BASE_URL, message);
    }
  } catch (error) {
    console.error('Error in fetchTokenList:', error);
    const message = {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token list. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: `/sub-tokens_list_fetch_0` }],
          [{ text: '⚙️ Settings', callback_data: '/sub-tokens_list_settings' }],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    };

    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...message,
        message_id: messageId,
      });
    } else {
      await sendMessage(TELEGRAM_BASE_URL, message);
    }
  }
}

/**
 * Prompt user to configure transaction history filters
 */
export async function promptTokenTransfersConfig(chatId: number, messageId?: number) {
  try {
    const redis = RedisService.getInstance();
    
    // Initialize token transfers filters if they don't exist
    const filtersKey = `token_transfers_filters:${chatId}`;
    const existingFilters = await redis.get(filtersKey);
    
    if (!existingFilters) {
      const defaultFilters = {
        mintAddress: '',
        senderAddress: '',
        receiverAddress: '',
        page: 0,
        limit: 5,
      };
      await redis.set(filtersKey, JSON.stringify(defaultFilters), REDIS_TTL * 5);
    }

    // Set the state to configuring filters
    await redis.set(
      `token_transfers_state:${chatId}`,
      'configuring_filters',
      REDIS_TTL,
    );

    // Get current filters
    const filters = JSON.parse(await redis.get(filtersKey) || '{}');

    // Prepare current filters summary
    let filterSummary = '<b>🔍 Current Filters:</b>\n';
    if (filters.mintAddress) {
      filterSummary += `<b>🪙 Mint:</b> <code>${filters.mintAddress}</code>\n`;
    }
    if (filters.senderAddress) {
      filterSummary += `<b>📤 Sender:</b> <code>${filters.senderAddress}</code>\n`;
    }
    if (filters.receiverAddress) {
      filterSummary += `<b>📥 Receiver:</b> <code>${filters.receiverAddress}</code>\n`;
    }
    if (!filters.mintAddress && !filters.senderAddress && !filters.receiverAddress) {
      filterSummary += '<i>No filters applied</i>\n';
    }

    const message = {
      chat_id: chatId,
      text: `<b>📊 Tokens Transfer History</b>\n\nConfigure filters to view token transactions. All filters are optional.\n\n${filterSummary}\nSelect a filter to configure:`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `🪙 ${filters.mintAddress ? '✅ ' : ''}Token`,
              callback_data: '/sub-tokens_transfers_config_mint',
            },
          ],
          [
            {
              text: `📤 ${filters.senderAddress ? '✅ ' : ''}From`,
              callback_data: '/sub-tokens_transfers_config_sender',
            },
          ],
          [
            {
              text: `📥 ${filters.receiverAddress ? '✅ ' : ''}To`,
              callback_data: '/sub-tokens_transfers_config_receiver',
            },
          ],
          [
            {
              text: '🔍 Search Transactions',
              callback_data: '/sub-tokens_transfers_fetch_data',
            },
          ],
          [
            {
              text: '🔄 Clear All Filters',
              callback_data: '/sub-tokens_transfers_clear_all',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/tokens' }],
        ],
      },
    };

    let finalMessageId = messageId;
    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...message,
        message_id: messageId,
      });
    } else {
      const response = await sendMessage(TELEGRAM_BASE_URL, message);
      finalMessageId = response?.result?.message_id;
    }

    // Store the message ID for future updates
    if (finalMessageId) {
      await redis.set(
        `token_transfers_last_message:${chatId}`,
        finalMessageId.toString(),
        REDIS_TTL,
      );
    }
  } catch (error) {
    console.error('Error in promptTokenTransfersConfig:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to configure filters. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: '/tokens' }]],
      },
    });
  }
}

/**
 * Prompt user to enter a specific filter value for token transfers
 */
export async function promptTokenTransfersFilterValue(chatId: number, filterType: string, messageId?: number) {
  const redis = RedisService.getInstance();
  await redis.set(
    `token_transfers_state:${chatId}`,
    `waiting_for_${filterType}`,
    REDIS_TTL,
  );

  let promptText = '';
  switch (filterType) {
    case 'mint':
      promptText = '<b>🪙 Enter Mint Address</b>\n\nPlease enter the <b>mint address</b> of the token to fetch transfers for:';
      break;
    case 'sender':
      promptText = '<b>📤 Enter Sender Address</b>\n\nPlease enter the <b>sender address</b> to filter transfers by:';
      break;
    case 'receiver':
      promptText = '<b>📥 Enter Receiver Address</b>\n\nPlease enter the <b>receiver address</b> to filter transfers by:';
      break;
    default:
      promptText = '<b>Enter Filter Value</b>\n\nPlease enter the value for the selected filter:';
  }

  const message = {
    chat_id: chatId,
    text: promptText,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '🔙 Back to Filters', callback_data: '/sub-tokens_transfers_fetch' }
      ]],
    },
  };

  // Always send a new message when asking for filter input
  await sendMessage(TELEGRAM_BASE_URL, message);
}

/**
 * Clear all token transfer filters
 */
export async function clearAllTokenTransfersFilters(chatId: number, messageId?: number) {
  try {
    const redis = RedisService.getInstance();
    const filtersKey = `token_transfers_filters:${chatId}`;
    
    // Reset filters to default
    const defaultFilters = {
      mintAddress: '',
      senderAddress: '',
      receiverAddress: '',
      page: 0,
      limit: 5,
    };
    
    await redis.set(filtersKey, JSON.stringify(defaultFilters), REDIS_TTL * 5);
    
    // Update the existing message with the filters menu
    await promptTokenTransfersConfig(chatId, messageId);
  } catch (error) {
    console.error('Error clearing token transfers filters:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to clear filters. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Back to Filters', callback_data: '/sub-tokens_transfers_fetch' }
        ]],
      },
    });
  }
}

/**
 * Update token transfers filter with the provided value
 */
export async function updateTokenTransfersFilter(chatId: number, filterType: string, value: string, messageId?: number) {
  try {
    const redis = RedisService.getInstance();
    const filtersKey = `token_transfers_filters:${chatId}`;
    const filtersJson = await redis.get(filtersKey);
    
    if (!filtersJson) {
      // Initialize with default filters if not found
      const defaultFilters = {
        mintAddress: '',
        senderAddress: '',
        receiverAddress: '',
        page: 0,
        limit: 5,
      };
      await redis.set(filtersKey, JSON.stringify(defaultFilters), REDIS_TTL * 5);
      return await updateTokenTransfersFilter(chatId, filterType, value);
    }
    
    const filters = JSON.parse(filtersJson);
    
    // Handle filter clearing
    if (value.trim() === '') {
      // Clear the specified filter
      switch (filterType) {
        case 'mint':
          filters.mintAddress = '';
          break;
        case 'sender':
          filters.senderAddress = '';
          break;
        case 'receiver':
          filters.receiverAddress = '';
          break;
        default:
          throw new Error(`Unknown filter type: ${filterType}`);
      }
    } else {
      // Validate Solana address format if value is provided
      if (!value.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        throw new Error(`Invalid Solana address format for ${filterType}`);
      }
      
      // Update the appropriate filter
      switch (filterType) {
        case 'mint':
          filters.mintAddress = value.trim();
          break;
        case 'sender':
          filters.senderAddress = value.trim();
          break;
        case 'receiver':
          filters.receiverAddress = value.trim();
          break;
        default:
          throw new Error(`Unknown filter type: ${filterType}`);
      }
    }
    
    // Reset page when filters change
    filters.page = 0;
    
    // Save updated filters
    await redis.set(filtersKey, JSON.stringify(filters), REDIS_TTL * 5);
    
    // Clear the waiting state
    await redis.del(`token_transfers_state:${chatId}`);
    
    // Prepare current filters summary
    let filterSummary = '<b>🔍 Current Filters:</b>\n';
    if (filters.mintAddress) {
      filterSummary += `<b>🪙 Mint:</b> <code>${filters.mintAddress}</code>\n`;
    }
    if (filters.senderAddress) {
      filterSummary += `<b>📤 Sender:</b> <code>${filters.senderAddress}</code>\n`;
    }
    if (filters.receiverAddress) {
      filterSummary += `<b>📥 Receiver:</b> <code>${filters.receiverAddress}</code>\n`;
    }
    if (!filters.mintAddress && !filters.senderAddress && !filters.receiverAddress) {
      filterSummary += '<i>No filters applied</i>\n';
    }
    
    // First send a confirmation message
    const filterAction = value.trim() === '' ? 'Cleared' : 'Updated';
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>✅ Filter ${filterAction}</b>\n\n${filterType.charAt(0).toUpperCase() + filterType.slice(1)} address ${value.trim() === '' ? 'cleared' : `set to:\n<code>${value}</code>`}`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Then show the updated filters menu
    await promptTokenTransfersConfig(chatId);
  } catch (error) {
    console.error('Error updating token transfers filter:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to update filter. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Back to Filters', callback_data: '/sub-tokens_transfers_fetch' }
        ]],
      },
    });
  }
}

/**
 * Create pagination buttons for token transfers
 */
export function createTokenTransfersPaginationButtons(
  currentPage: number,
): { text: string; callback_data: string }[] {
  const buttons = [];

  // Previous page button (if not on first page)
  if (currentPage > 0) {
    buttons.push({
      text: '⬅️ Previous',
      callback_data: `/sub-tokens_transfers_page_${currentPage - 1}`,
    });
  }

  // Current page indicator
  buttons.push({
    text: `📄 ${currentPage + 1}`,
    callback_data: 'current_page', // This is a dummy callback, won't do anything
  });

  // Next page button
  buttons.push({
    text: 'Next ➡️',
    callback_data: `/sub-tokens_transfers_page_${currentPage + 1}`,
  });

  return buttons;
}

/**
 * Format token transfer amount with decimals
 */
function formatTokenAmount(amount: number, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const divisor = Math.pow(10, decimals);
  return (amount / divisor).toFixed(Math.min(decimals, 6));
}

/**
 * Format timestamp to readable date
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
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
    const redis = RedisService.getInstance();
    const filtersKey = `token_transfers_filters:${chatId}`;
    const filtersJson = await redis.get(filtersKey);
    
    if (!filtersJson) {
      throw new Error('Filters not found');
    }
    
    const filters = JSON.parse(filtersJson);
    filters.page = page;
    
    // Update the stored filters with the new page
    await redis.set(filtersKey, JSON.stringify(filters), REDIS_TTL * 5);
    
    // Construct the API URL with filters
    let apiUrl = `token/transfers?page=${page}&limit=${filters.limit}`;
    
    if (filters.mintAddress) {
      apiUrl += `&mintAddress=${filters.mintAddress}`;
    }
    
    if (filters.senderAddress) {
      apiUrl += `&senderAddress=${filters.senderAddress}`;
    }
    
    if (filters.receiverAddress) {
      apiUrl += `&receiverAddress=${filters.receiverAddress}`;
    }
    
    // Send loading message
    const loadingMessage = {
      chat_id: chatId,
      text: '<b>⏳ Processing</b>\n\nFetching token transfers...\n\nPlease wait...',
      parse_mode: 'HTML' as 'HTML',
    };
    
    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...loadingMessage,
        message_id: messageId,
      });
    } else {
      const sentMessage = await sendMessage(TELEGRAM_BASE_URL, loadingMessage);
      messageId = sentMessage?.result?.message_id;
    }
    
    // Fetch token transfers
    const response = await makeVybeRequest(apiUrl);
    
    if (!response || !response.transfers || response.transfers.length === 0) {
      const noDataMessage = {
        chat_id: chatId,
        text: '<b>ℹ️ No Data</b>\n\nNo token transfers found with the current filters.',
        parse_mode: 'HTML' as 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Configure Filters', callback_data: '/sub-tokens_transfers_fetch' }],
            [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
          ],
        },
      };
      
      if (messageId) {
        await updateMessage(TELEGRAM_BASE_URL, {
          ...noDataMessage,
          message_id: messageId,
        });
      } else {
        await sendMessage(TELEGRAM_BASE_URL, noDataMessage);
      }
      return;
    }
    
    // Format transfers data
    let transfersHtml = '';
    response.transfers.forEach((transfer: any, index: number) => {
      const amount = formatTokenAmount(transfer.amount, transfer.decimal);
      transfersHtml += `<b>🔄 Transfer #${index + 1}</b>\n`;
      transfersHtml += `<b>🪙 Amount:</b> ${amount}${transfer.calculatedAmount ? ` (${transfer.calculatedAmount})` : ''}\n`;
      transfersHtml += `<b>📤 From:</b> <code>${transfer.senderAddress}</code>\n`;
      transfersHtml += `<b>📥 To:</b> <code>${transfer.receiverAddress}</code>\n`;
      transfersHtml += `<b>🕒 Time:</b> ${formatTimestamp(transfer.blockTime)}\n`;
      
      if (transfer.valueUsd) {
        transfersHtml += `<b>💵 Value:</b> $${transfer.valueUsd}\n`;
      }
      
      transfersHtml += `<b>🔗 Tx:</b> <a href="https://solscan.io/tx/${transfer.signature}">View on Solscan</a>\n\n`;
    });
    
    // Create filter summary
    let filterSummary = '<b>🔍 Applied Filters:</b>\n';
    if (filters.mintAddress) {
      filterSummary += `<b>🪙 Mint:</b> <code>${filters.mintAddress}</code>\n`;
    }
    if (filters.senderAddress) {
      filterSummary += `<b>📤 Sender:</b> <code>${filters.senderAddress}</code>\n`;
    }
    if (filters.receiverAddress) {
      filterSummary += `<b>📥 Receiver:</b> <code>${filters.receiverAddress}</code>\n`;
    }
    if (!filters.mintAddress && !filters.senderAddress && !filters.receiverAddress) {
      filterSummary += '<i>No filters applied</i>\n';
    }
    
    // Prepare the final message
    const message = {
      chat_id: chatId,
      text: `<b>🔄 Token Transfers</b>\n\n${filterSummary}\n${transfersHtml}`,
      parse_mode: 'HTML' as 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          createTokenTransfersPaginationButtons(page),
          [{ text: '🔄 Configure Filters', callback_data: '/sub-tokens_transfers_fetch' }],
          [{ text: '🔙 Tokens Menu', callback_data: '/tokens' }],
        ],
      },
    };
    
    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        ...message,
        message_id: messageId,
      });
    } else {
      await sendMessage(TELEGRAM_BASE_URL, message);
    }
  } catch (error) {
    console.error('Error in fetchTokenTransfers:', error);
    const errorMessage = {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch token transfers. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: `/sub-tokens_transfers_page_${page}` }],
          [{ text: '🔄 Configure Filters', callback_data: '/sub-tokens_transfers_fetch' }],
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

export async function fetchTokenDetails(chatId: number, mintAddress: string) {
  try {
    // Send loading message
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>⏳ Processing</b>\n\nFetching token details for mint address: <code>${mintAddress}</code>\n\nPlease wait...`,
      parse_mode: 'HTML' as 'HTML',
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
