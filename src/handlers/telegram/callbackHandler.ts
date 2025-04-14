import { RedisService } from '../../services/redisService';
import type { TelegramWebHookCallBackQueryPayload } from '../../types/telegram';
import { TELEGRAM_BASE_URL } from '../../utils/constant';
import {
  knownAccounts,
  handleKnownAccountsRequest,
  startSearch,
} from './maincommands/knownaccounts';
import { startNftOwnersSearch } from './maincommands/nftowners';
import {
  displayProgramsMenu,
  initializeRankingFlow,
  handleSetLimit,
  showIntervalOptions,
  updateInterval,
  fetchRankings,
  initializeProgramDefaults,
  initializeTvlFlow,
  promptTvlResolution,
  promptProgramIdForTvl,
  initializeTransactionsFlow,
  updateTransactionsRange,
  promptProgramIdForTransactions,
} from './maincommands/programs';
import {
  initializeProgramDetailsFlow,
  promptProgramIdForDetails,
} from './maincommands/programDetails';
import {
  initializeInstructionsFlow,
  promptProgramIdForInstructions,
  promptInstructionsRange,
  updateInstructionsType,
} from './maincommands/instructionsData';
import {
  initializeActiveUsersFlow,
  promptProgramIdForActiveUsers,
  promptActiveUsersRange,
  updateActiveUsersType,
} from './maincommands/activeUsersData';
import {
  initializeFindActiveUsersFlow,
  promptProgramIdForFindActiveUsers,
  promptFindActiveUsersLimit,
  promptFindActiveUsersDays,
} from './maincommands/findActiveUsersData';
import {
  displayTokensMenu,
  promptTokenMintAddress,
  promptTokenMintAddressForHolders,
  handleTokenHoldersPagination,
  displayTokenListSettings,
  updateTokenListSort,
  updateTokenListSortDirection,
  clearTokenListSort,
  fetchTokenList,
  promptTokenTransfersConfig,
  promptTokenTransfersFilterValue,
  fetchTokenTransfers,
  handleTokenTransfersPagination,
  clearAllTokenTransfersFilters,
} from './maincommands/tokens';
import {
  formatNftSummaryHtml,
  formatTokenBalanceHtml,
  formatWalletPnlHtml,
  isValidSolanaAddress,
  makeVybeRequest,
  sendErrorMessage,
  updateMessage,
} from '../../utils/helpers';
import { balances } from './maincommands/balances';
import { displayMainMenu as displayMainMenuFromMain } from './mainMenu';
import {
  displayPriceProgramsMenu,
  fetchPricePrograms,
  handlePriceProgramsPagination,
  promptMarketsAddress,
  handleMarketsPagination,
  fetchMarkets,
  displayOhlcvSettings,
  updateOhlcvResolution,
  promptOhlcvTime,
  promptOhlcvToken,
  fetchOhlcvData,
} from './maincommands/prices';

// Constants
const TOKENS_PER_PAGE = 5;
const REDIS_TTL = 60;

/**
 * Handle NFT balance request
 */
async function handleNftBalanceRequest(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${userId}`, 'nftBalances', REDIS_TTL);
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Please enter the wallet address below to check NFT balances:',
  });
}

/**
 * Handle token balance request
 */
async function handleTokenBalanceRequest(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${userId}`, 'tokenBalances', REDIS_TTL);
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Please enter the wallet address below to check token balances:',
  });
}

/**
 * Handle wallet PnL request
 */
async function handleWalletPnlRequest(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${userId}`, 'walletPnl', REDIS_TTL);
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Please select the time resolution:',
    reply_markup: {
      inline_keyboard: [
        ['1d', '7d', '30d'].map((resolution) => ({
          text: `📅 ${resolution.toUpperCase()}`,
          callback_data: `/sub-pnl_${resolution}`,
        })),
        [
          {
            text: '🔙 Main Menu',
            callback_data: '/main',
          },
        ],
      ],
    },
  });
}

/**
 * Handle wallet PnL resolution selection
 */
async function handleWalletPnlResolution(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
  resolution: string,
): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${userId}-pnlResolution`, resolution, REDIS_TTL);
  await redis.set(`userState-${userId}`, 'walletPnlAddress', REDIS_TTL);
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Please enter the wallet address below to view the PnL:',
  });
}

/**
 * Create pagination buttons for a given page
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @param callbackPrefix - Prefix for callback data (e.g., 'sub-pnl_page_')
 */
function createPaginationButtons(
  currentPage: number,
  totalPages: number,
  callbackPrefix: string,
): { text: string; callback_data: string }[] {
  const buttons = [];
  if (currentPage > 0) {
    buttons.push({
      text: '⬅️ Previous',
      callback_data: `${callbackPrefix}${currentPage - 1}`,
    });
  }
  if (currentPage < totalPages) {
    buttons.push({
      text: '➡️ Next',
      callback_data: `${callbackPrefix}${currentPage + 1}`,
    });
  }
  return buttons;
}

/**
 * Handle wallet PnL pagination
 */
async function handleWalletPnlPagination(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
  page: number,
): Promise<void> {
  const redis = RedisService.getInstance();
  const walletAddress = await redis.get(`userState-${userId}-walletPnl`);
  const resolution = await redis.get(`userState-${userId}-pnlResolution`);

  if (!walletAddress || !isValidSolanaAddress(walletAddress) || !resolution) {
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Invalid wallet address or resolution',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔙 Wallet PnL',
              callback_data: '/walletPnl',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ],
      },
    });
    return;
  }

  try {
    const data = await makeVybeRequest(
      `account/pnl/${walletAddress}?resolution=${resolution}&limit=5&page=${page}`,
      'GET',
    );

    if (!data || !data.summary) {
      await updateMessage(baseUrl, {
        chat_id: chatId,
        message_id: messageId,
        text: 'No trading data available for this wallet.',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔙  Wallet PnL',
                callback_data: '/walletPnl',
              },
            ],
            [
              {
                text: '🔙 Main Menu',
                callback_data: '/main',
              },
            ],
          ],
        },
      });
      return;
    }

    const formattedMessage = formatWalletPnlHtml(data, resolution, page);
    const currentPage = page;
    const totalPages = Math.ceil(data.summary.totalTrades / 5) - 1;
    const paginationButtons = createPaginationButtons(
      currentPage,
      totalPages,
      '/sub-pnl_page_',
    );

    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: formattedMessage.text,
      reply_markup: {
        inline_keyboard: [
          paginationButtons.length > 0
            ? [
                ...paginationButtons.map((button) => ({
                  text: button.text,
                  callback_data: button.callback_data,
                })),
              ]
            : [],
          [
            {
              text: '🔙  Wallet PnL',
              callback_data: '/walletPnl',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ].filter(Boolean),
      },
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error fetching wallet PnL:', error);
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Error fetching wallet PnL. Please try again later.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔙  Wallet PnL',
              callback_data: '/walletPnl',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ],
      },
    });
  }
}

/**
 * Handle NFT balance pagination
 */
async function handleNftBalancePagination(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
  page: number,
): Promise<void> {
  const redis = RedisService.getInstance();
  const walletAddress = await redis.get(`userState-${userId}-nftBalances`);

  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Invalid wallet address',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔙  NFT Balances',
              callback_data: '/balances',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ],
      },
    });
    return;
  }

  try {
    const data = await makeVybeRequest(
      `account/nft-balance/${walletAddress}?limit=${TOKENS_PER_PAGE}&page=${page}`,
      'GET',
    );

    const formattedMessage = formatNftSummaryHtml(data);
    const currentPage = page;
    const totalPages = Math.ceil(data.total / TOKENS_PER_PAGE) - 1;
    const paginationButtons = createPaginationButtons(
      currentPage,
      totalPages,
      '/sub-nft_balance_page_',
    );

    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: formattedMessage.text,
      reply_markup: {
        inline_keyboard: [
          paginationButtons.length > 0
            ? [
                ...paginationButtons.map((button) => ({
                  text: button.text,
                  callback_data: button.callback_data,
                })),
              ]
            : [],
          [
            {
              text: '🔙  NFT Balances',
              callback_data: '/balances',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ].filter(Boolean),
      },
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error fetching NFT balances:', error);
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Error fetching NFT balances. Please try again later.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔙  NFT Balances',
              callback_data: '/balances',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ],
      },
    });
  }
}

/**
 * Handle token balance pagination
 */
async function handleTokenBalancePagination(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
  page: number,
): Promise<void> {
  const redis = RedisService.getInstance();
  const walletAddress = await redis.get(`userState-${userId}-tokenBalances`);

  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Invalid wallet address',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔙  Token Balances',
              callback_data: '/balances',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ],
      },
    });
    return;
  }

  try {
    const data = await makeVybeRequest(
      `account/token-balance/${walletAddress}?limit=${TOKENS_PER_PAGE}&page=${page}`,
      'GET',
    );

    const formattedMessage = formatTokenBalanceHtml(data);
    const currentPage = page;
    const totalPages = Math.ceil(data.total / TOKENS_PER_PAGE) - 1;
    const paginationButtons = createPaginationButtons(
      currentPage,
      totalPages,
      '/sub-token_balance_page_',
    );

    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: formattedMessage.text,
      reply_markup: {
        inline_keyboard: [
          paginationButtons.length > 0
            ? [
                ...paginationButtons.map((button) => ({
                  text: button.text,
                  callback_data: button.callback_data,
                })),
              ]
            : [],
          [
            {
              text: '🔙  Token Balances',
              callback_data: '/balances',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ].filter(Boolean),
      },
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error fetching token balances:', error);
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Error fetching token balances. Please try again later.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔙  Token Balances',
              callback_data: '/balances',
            },
          ],
          [
            {
              text: '🔙 Main Menu',
              callback_data: '/main',
            },
          ],
        ],
      },
    });
  }
}

/**
 * Handle main menu display
 */
async function displayMainMenu(
  chatId: number,
  messageId: number,
  baseUrl: string,
): Promise<void> {
  await displayMainMenuFromMain(chatId, messageId, baseUrl);
}

/**
 * Main callback handler for Telegram webhook callbacks
 */
export const handleCallback = async (
  payload: TelegramWebHookCallBackQueryPayload,
): Promise<void> => {
  const callbackData = payload.callback_query.data;
  const chatId = payload.callback_query.message.chat.id;
  const messageId = payload.callback_query.message.message_id;
  const userId = payload.callback_query.from.id;
  const baseUrl = TELEGRAM_BASE_URL;

  try {
    // Handle sub-commands
    if (callbackData.startsWith('/sub-')) {
      const subCommand = callbackData.replace('/sub-', '');

      if (subCommand.startsWith('knownaccounts_')) {
        const label = subCommand.replace('knownaccounts_', '');
        if (label === 'search') {
          await RedisService.getInstance().del(`userState-${userId}`);
          await RedisService.getInstance().del(
            `known_accounts_search:${userId}`,
          );
          await RedisService.getInstance().del(`nft_owners_search:${userId}`);
          await startSearch(chatId, messageId);
        } else {
          await handleKnownAccountsRequest(chatId, messageId, label);
        }
        return;
      }


      if (subCommand === 'nftBalances') {
        await handleNftBalanceRequest(userId, chatId, messageId, baseUrl);
        return;
      }

      if (subCommand === 'tokenBalances') {
        await handleTokenBalanceRequest(userId, chatId, messageId, baseUrl);
        return;
      }

      if (subCommand.startsWith('nft_balance_page_')) {
        const page = Number(subCommand.split('_')[3]);
        await handleNftBalancePagination(
          userId,
          chatId,
          messageId,
          baseUrl,
          page,
        );
        return;
      }

      if (subCommand.startsWith('token_balance_page_')) {
        const page = Number(subCommand.split('_')[3]);
        await handleTokenBalancePagination(
          userId,
          chatId,
          messageId,
          baseUrl,
          page,
        );
        return;
      }

      if (subCommand.startsWith('pnl_page_')) {
        const page = Number(subCommand.split('_')[2]);
        await handleWalletPnlPagination(
          userId,
          chatId,
          messageId,
          baseUrl,
          page,
        );
        return;
      }

      if (subCommand.startsWith('pnl_')) {
        await handleWalletPnlResolution(
          userId,
          chatId,
          messageId,
          baseUrl,
          subCommand.split('_')[1],
        );
        return;
      }

      if (subCommand.startsWith('tokens_')) {
        const tokenCommand = subCommand.replace('tokens_', '');

        if (tokenCommand === 'details_fetch') {
          await promptTokenMintAddress(chatId);
        } else if (tokenCommand === 'holders_fetch') {
          await promptTokenMintAddressForHolders(chatId);
        } else if (tokenCommand.startsWith('holders_page_')) {
          const page = Number(tokenCommand.split('_')[2]);
          await handleTokenHoldersPagination(chatId, page, messageId);
        } else if (tokenCommand === 'list_settings') {
          await displayTokenListSettings(chatId, messageId);
        } else if (tokenCommand.startsWith('list_sort_')) {
          const sortBy = tokenCommand.replace('list_sort_', '');
          await updateTokenListSort(chatId, sortBy, messageId);
        } else if (tokenCommand.startsWith('list_direction_')) {
          const direction = tokenCommand.replace('list_direction_', '') as
            | 'asc'
            | 'desc';
          await updateTokenListSortDirection(chatId, direction, messageId);
        } else if (tokenCommand === 'list_clear_sort') {
          await clearTokenListSort(chatId, messageId);
        } else if (tokenCommand.startsWith('list_fetch_')) {
          const page = Number(tokenCommand.split('_')[2]);
          await fetchTokenList(chatId, page, messageId);
        } else if (tokenCommand === 'transfers_fetch') {
          await promptTokenTransfersConfig(chatId, messageId);
        } else if (tokenCommand.startsWith('transfers_config_')) {
          const filterType = tokenCommand.replace('transfers_config_', '');
          await promptTokenTransfersFilterValue(chatId, filterType, messageId);
        } else if (tokenCommand === 'transfers_clear_all') {
          await clearAllTokenTransfersFilters(chatId, messageId);
        } else if (tokenCommand === 'transfers_fetch_data') {
          await fetchTokenTransfers(chatId, 0, messageId);
        } else if (tokenCommand.startsWith('transfers_page_')) {
          const page = Number(tokenCommand.split('_')[2]);
          await handleTokenTransfersPagination(chatId, page, messageId);
        }
        return;
      }

      if (subCommand.startsWith('programs_')) {
        const programCommand = subCommand.replace('programs_', '');

        if (programCommand === 'ranking') {
          await initializeProgramDefaults(chatId);
          await RedisService.getInstance().del(
            `program_ranking_state:${chatId}`,
          );
          await initializeRankingFlow(chatId, messageId);
        } else if (programCommand === 'set_limit') {
          await handleSetLimit(chatId);
        } else if (programCommand === 'set_interval') {
          await showIntervalOptions(chatId, messageId);
        } else if (programCommand === 'interval_1d') {
          await updateInterval(chatId, messageId, '1d');
        } else if (programCommand === 'interval_7d') {
          await updateInterval(chatId, messageId, '7d');
        } else if (programCommand === 'interval_30d') {
          await updateInterval(chatId, messageId, '30d');
        } else if (programCommand === 'fetch') {
          await fetchRankings(chatId, messageId);
        }
        // TVL related commands
        else if (programCommand === 'tvl') {
          await initializeProgramDefaults(chatId);
          await RedisService.getInstance().del(`tvl_state:${chatId}`);
          await initializeTvlFlow(chatId, messageId);
        } else if (programCommand === 'tvl_resolution') {
          await promptTvlResolution(chatId);
        } else if (programCommand === 'tvl_fetch') {
          await promptProgramIdForTvl(chatId);
        }
        // Transactions data related commands
        else if (programCommand === 'transactions') {
          await initializeProgramDefaults(chatId);
          await RedisService.getInstance().del(`transactions_state:${chatId}`);
          await initializeTransactionsFlow(chatId, messageId);
        } else if (programCommand.startsWith('transactions_range_')) {
          const range = programCommand.replace('transactions_range_', '');
          await updateTransactionsRange(chatId, messageId, range);
        } else if (programCommand === 'transactions_fetch') {
          await promptProgramIdForTransactions(chatId);
        }
        // Program Details related commands
        else if (programCommand === 'details') {
          await initializeProgramDefaults(chatId);
          await RedisService.getInstance().del(
            `program_details_state:${chatId}`,
          );
          await initializeProgramDetailsFlow(chatId, messageId);
        } else if (programCommand === 'details_fetch') {
          await promptProgramIdForDetails(chatId);
        }
        // Instructions Data related commands
        else if (programCommand === 'instructions') {
          await initializeProgramDefaults(chatId);
          await RedisService.getInstance().del(`instructions_state:${chatId}`);
          await initializeInstructionsFlow(chatId, messageId);
        } else if (programCommand === 'instructions_fetch') {
          await promptProgramIdForInstructions(chatId);
        } else if (programCommand === 'instructions_range') {
          await promptInstructionsRange(chatId);
        } else if (programCommand.startsWith('instructions_type_')) {
          const type = programCommand.replace('instructions_type_', '');
          await updateInstructionsType(chatId, messageId, type);
        }
        // Active Users Data related commands
        else if (programCommand === 'activeusers') {
          await initializeProgramDefaults(chatId);
          await RedisService.getInstance().del(`activeusers_state:${chatId}`);
          await initializeActiveUsersFlow(chatId, messageId);
        } else if (programCommand === 'activeusers_fetch') {
          await promptProgramIdForActiveUsers(chatId);
        } else if (programCommand === 'activeusers_range') {
          await promptActiveUsersRange(chatId);
        } else if (programCommand.startsWith('activeusers_type_')) {
          const type = programCommand.replace('activeusers_type_', '');
          await updateActiveUsersType(chatId, messageId, type);
        }
        // Find Program Active Users related commands
        else if (programCommand === 'findactiveusers') {
          await initializeProgramDefaults(chatId);
          await RedisService.getInstance().del(
            `findactiveusers_state:${chatId}`,
          );
          await initializeFindActiveUsersFlow(chatId, messageId);
        } else if (programCommand === 'findactiveusers_fetch') {
          await promptProgramIdForFindActiveUsers(chatId);
        } else if (programCommand === 'findactiveusers_limit') {
          await promptFindActiveUsersLimit(chatId);
        } else if (programCommand === 'findactiveusers_days') {
          await promptFindActiveUsersDays(chatId);
        }
        return;
      }
      // Handle price programs commands
      if (subCommand.startsWith('prices_programs_')) {
        const action = subCommand.replace('prices_programs_', '');
        if (action === 'fetch') {
          console.log('Fetching price programs');
          await fetchPricePrograms(chatId, 0, messageId);
        } else if (action.startsWith('page_')) {
          console.log('Handling price programs pagination');
          const page = parseInt(action.replace('page_', ''));
          await handlePriceProgramsPagination(chatId, page, messageId);
        }
      }
      
      // Handle market commands
      if (subCommand.startsWith('prices_markets_')) {
        const action = subCommand.replace('prices_markets_', '');
        if (action === 'prompt') {
          console.log('Prompting for market address');
          await promptMarketsAddress(chatId, messageId);
        }
        return;
      }

      // Handle OHLCV commands
      if (subCommand.startsWith('prices_ohlcv_')) {
        const action = subCommand.replace('prices_ohlcv_', '');
        
        if (action === 'settings') {
          await displayOhlcvSettings(chatId, messageId);
        }
        else if (action.startsWith('resolution_')) {
          const resolution = action.replace('resolution_', '');
          await updateOhlcvResolution(chatId, resolution, messageId);
        }
        else if (action === 'timestart') {
          await promptOhlcvTime(chatId, messageId, 'start');
        }
        else if (action === 'timeend') {
          await promptOhlcvTime(chatId, messageId, 'end');
        }
        else if (action === 'fetch') {
          await promptOhlcvToken(chatId, messageId);
        }
        return;
      }
      
      // Handle markets pagination (short form)
      if (callbackData.startsWith('/sub-m_')) {
        try {
          console.log('Handling markets pagination:', callbackData);
          const redis = RedisService.getInstance();
          const programId = await redis.get(`markets_program:${chatId}`);
          
          if (!programId) {
            await updateMessage(TELEGRAM_BASE_URL, {
              chat_id: chatId,
              message_id: messageId,
              text: '<b>❌ Error</b>\n\nSession expired. Please try again.',
              parse_mode: 'HTML' as 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back', callback_data: '/prices' }]],
              },
            });
            return;
          }

          const page = parseInt(callbackData.replace('/sub-m_', ''));
          console.log('Fetching page', page, 'for program', programId);
          
          // Show loading message
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: '⏳ <b>Loading market data...</b>',
            parse_mode: 'HTML' as 'HTML',
          });
          
          await fetchMarkets(chatId, programId, page, messageId);
        } catch (error) {
          console.error('Error handling markets pagination:', error);
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: '<b>❌ Error</b>\n\nFailed to load market data. Please try again.',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back', callback_data: '/prices' }]],
            },
          });
        }
        return;
      }

      // Handle OHLCV pagination (short form)
      if (callbackData.startsWith('/sub-o_')) {
        try {
          const redis = RedisService.getInstance();
          const tokenAddress = await redis.get(`ohlcv_token:${chatId}`);
          
          if (!tokenAddress) {
            await updateMessage(TELEGRAM_BASE_URL, {
              chat_id: chatId,
              message_id: messageId,
              text: '<b>❌ Error</b>\n\nSession expired. Please try again.',
              parse_mode: 'HTML' as 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back', callback_data: '/sub-prices_ohlcv_settings' }]],
              },
            });
            return;
          }

          const page = parseInt(callbackData.replace('/sub-o_', ''));
          
          // Show loading message
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: '⏳ <b>Loading OHLCV data...</b>',
            parse_mode: 'HTML' as 'HTML',
          });
          
          await fetchOhlcvData(chatId, tokenAddress, page, messageId);
        } catch (error) {
          console.error('Error handling OHLCV pagination:', error);
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: '<b>❌ Error</b>\n\nFailed to load OHLCV data. Please try again.',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back', callback_data: '/sub-prices_ohlcv_settings' }]],
            },
          });
        }
        return;
      }
      
      return;
    }

    // Handle main commands
    switch (callbackData) {
      case '/main':
        await displayMainMenu(chatId, messageId, baseUrl);
        break;
      case '/balances':
        await balances(chatId, messageId);
        break;
      case '/walletPnl':
        await handleWalletPnlRequest(userId, chatId, messageId, baseUrl);
        break;
      case '/knownaccounts':
        await knownAccounts(chatId, messageId);
        break;
      case '/nftowners':
        await RedisService.getInstance().del(`userState-${userId}`);
        await RedisService.getInstance().del(`nft_owners_search:${chatId}`);
        await RedisService.getInstance().del(`known_accounts_search:${userId}`);
        await startNftOwnersSearch(chatId, messageId);
        break;
      case '/programs':
        await displayProgramsMenu(chatId, messageId);
        break;
      case '/tokens':
        await displayTokensMenu(chatId, messageId);
        break;
      case '/prices':
        console.log('Displaying price programs menu');
        await displayPriceProgramsMenu(chatId, messageId);
        break;
      default:
        console.log('Unknown callback:', callbackData);
        await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Unknown callback');
        break;
    }
  } catch (error) {
    console.error('Error in handleCallback:', error);
    throw error;
  }
};
