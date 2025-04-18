  import { RedisService } from '../../services/redisService';
  import type { UserTransfer } from '../../services/redisService';
  import type { TelegramWebHookCallBackQueryPayload } from '../../types/telegram';
  import { MAX_PRICE_ALERTS, TELEGRAM_BASE_URL } from '../../utils/constant';
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
    deleteMessage,
    formatNftSummaryHtml,
    formatTokenBalanceHtml,
    formatWalletPnlHtml,
    isValidSolanaAddress,
    makeVybeRequest,
    sendErrorMessage,
    sendMessage,
    updateMessage,
  } from '../../utils/helpers';
  import { balances } from './maincommands/balances';
  import { displayMainMenu as displayMainMenuFromMain } from './mainMenu';
  import {
    showAlertsMenu,
    showAlertsMainMenu,
    promptNewAlertAddress,
    renderAlertSettingsMenu,
  } from './maincommands/transfers';
import {
    showPriceAlertsMenu,
    promptNewPriceAlert,
    renderPriceAlertSettings,
  } from './maincommands/priceAlerts';
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
                // Handle transfer alert settings

        if (callbackData.startsWith('/sub-ta_e')) {
          const redis = RedisService.getInstance();
          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          
          // Find the alert by index
          const alertIndex = parseInt(callbackData.replace('/sub-ta_e', '')) - 1;
          const userAlerts = [];
          
          for (const [address, users] of Object.entries(transfersData)) {
            const userArray = users as UserTransfer[];
            const userAlert = userArray.find(u => u.userId === chatId);
            if (userAlert) userAlerts.push({ address, filters: userAlert.filters });
          }
          
          if (alertIndex >= 0 && alertIndex < userAlerts.length) {
            const address = userAlerts[alertIndex].address;
            await redis.set(`editing_alert_${chatId}`, address, 60);
            await renderAlertSettingsMenu(chatId, messageId, address);
            return;
          }
        }

        // Handle toggle send
        if (callbackData === '/sub-ta_tsnd' || callbackData === '/sub-ta_trcv') {
          const redis = RedisService.getInstance();
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          const users = (transfersData[whaleAddress] || []) as UserTransfer[];
          const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
          if (!userAlert) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
            return;
          }

          const isSendToggle = callbackData === '/sub-ta_tsnd';
          const currentValue = isSendToggle ? userAlert.filters.send : userAlert.filters.receive;
          const otherValue = isSendToggle ? userAlert.filters.receive : userAlert.filters.send;

          // Only allow toggle off if the other option is true
          if (currentValue && !otherValue) {
            const response=await sendMessage(TELEGRAM_BASE_URL, {
              chat_id: chatId,
              text: 'At least one of Send or Receive must be enabled',
              parse_mode: 'HTML' as 'HTML',
            });
            const messageId=response.result.message_id;

            setTimeout(async () => {
              await deleteMessage(TELEGRAM_BASE_URL, chatId, messageId);
            }, 1000); 
            return;
          }

          // Update the value
          if (isSendToggle) {
            userAlert.filters.send = !currentValue;
          } else {
            userAlert.filters.receive = !currentValue;
          }

          await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
          await renderAlertSettingsMenu(chatId, messageId, whaleAddress);
          return;
        }

        // Handle set mint
        if (callbackData === '/sub-ta_smin') {
          const redis = RedisService.getInstance();
          console.log('Editing alert:', chatId, messageId);
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          await redis.set(`userState-${userId}`, 'transfer_mint', 60);
          console.log('Setting user state to transfer_mint');
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: '🧬 <b>Set Mint Address</b>\n\nPlease enter the SPL token mint address to filter by, or send /clear to remove the filter:',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back', callback_data: '/alerts' }]],
            },
          });
          return;
        }

        // Handle set amount
        if (callbackData === '/sub-ta_amt') {
          const redis = RedisService.getInstance();
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          await redis.set(`userState-${userId}`, 'transfer_amount', 60);
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: '💰 <b>Set Amount</b>\n\nPlease enter the amount to filter by, or send /clear to remove the filter:',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back', callback_data: '/alerts' }]],
            },
          });
          return;
        }

        // Handle greater than
        if (callbackData === '/sub-ta_gt') {
          const redis = RedisService.getInstance();
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          const users = (transfersData[whaleAddress] || []) as UserTransfer[];
          const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
          if (!userAlert) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
            return;
          }

          userAlert.filters.greater = true;
          await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
          await renderAlertSettingsMenu(chatId, messageId, whaleAddress);
          return;
        }

        // Handle less than or equal
        if (callbackData === '/sub-ta_le') {
          const redis = RedisService.getInstance();
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          const users = (transfersData[whaleAddress] || []) as UserTransfer[];
          const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
          if (!userAlert) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
            return;
          }

          userAlert.filters.greater = false;
          await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
          await renderAlertSettingsMenu(chatId, messageId, whaleAddress);
          return;
        }

        // Handle toggle active
        if (callbackData === '/sub-ta_tact') {
          const redis = RedisService.getInstance();
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          const users = (transfersData[whaleAddress] || []) as UserTransfer[];
          const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
          if (!userAlert) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
            return;
          }

          userAlert.filters.active = !userAlert.filters.active;
          await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
          await renderAlertSettingsMenu(chatId, messageId, whaleAddress);
          return;
        }

        // Handle delete
        if (callbackData === '/sub-ta_del') {
          const redis = RedisService.getInstance();
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          const users = (transfersData[whaleAddress] || []) as UserTransfer[];
          const userIndex = users.findIndex((u: UserTransfer) => u.userId === chatId);
          
          if (userIndex === -1) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
            return;
          }

          users.splice(userIndex, 1);
          if (users.length === 0) {
            delete transfersData[whaleAddress];
          } else {
            transfersData[whaleAddress] = users;
          }

          await redis.set('transfers', JSON.stringify(transfersData));
          await redis.del(`editing_alert_${chatId}`);
          await showAlertsMenu(chatId, messageId);
          return;
        }
        
        if(callbackData.startsWith('/sub-ta_add')) {
          await promptNewAlertAddress(chatId, messageId);   
          return;     
        }

        // Handle delete alert
        if (callbackData === '/sub-ta_del') {
          const redis = RedisService.getInstance();
          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          
          if (transfersData[whaleAddress]) {
            const users = transfersData[whaleAddress] as UserTransfer[];
            transfersData[whaleAddress] = users.filter(u => u.userId !== chatId);
            
            if (transfersData[whaleAddress].length === 0) {
              delete transfersData[whaleAddress];
            }
            
            await redis.set('transfers', JSON.stringify(transfersData));
            await redis.del(`editing_alert_${chatId}`);
          }

          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: '✅ Alert deleted successfully',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Alerts', callback_data: '/alerts' }]],
            },
          });
          return;
        }
        console.log('Unknown callback data:', callbackData);

        if(callbackData.startsWith('/sub-pa_edit_')) {
          const redis = RedisService.getInstance();
          const priceFeedId = callbackData.replace('/sub-pa_edit_', '');
          await redis.set(`editing_alert_${chatId}`, priceFeedId, 60);
          await renderPriceAlertSettings(chatId, messageId, priceFeedId);
          return;
        }

        if(callbackData.startsWith('/sub-pa_price_')) {
          const redis = RedisService.getInstance();
          const priceFeedId = callbackData.replace('/sub-pa_price_', '');
          await redis.set(`editing_alert_${chatId}`, priceFeedId, 60);
          await redis.set(`userState-${userId}`, 'price_value_input', 60);
          
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: 'Enter the new price you want to set for this alert:',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/alerts_prices' }]],
            },
          });
          return;
        }

        if(callbackData.startsWith('/sub-pa_name_')) {
          const redis = RedisService.getInstance();
          const priceFeedId = callbackData.replace('/sub-pa_name_', '');
          await redis.set(`editing_alert_${chatId}`, priceFeedId, 60);
          await redis.set(`userState-${userId}`, 'price_name_input', 60);
          await updateMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            message_id: messageId,
            text: 'Enter the new name you want to set for this alert:',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/alerts_prices' }]]
            },
          });
          return;
        }

        if(callbackData.startsWith('/sub-pa_del')){
          const redis = RedisService.getInstance();
          const priceFeedId = await redis.get(`editing_alert_${chatId}`);
          if (!priceFeedId) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Session expired');
            return;
          }
          await redis.deleteOracleAlert(chatId, priceFeedId);
          await sendMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            text: '✅ <b>Alert Deleted</b>',
            parse_mode: 'HTML' as 'HTML',
          });
          await showPriceAlertsMenu(chatId);
          return;
        }

        if(callbackData.startsWith('/sub-pa_add')){
          const alerts = await RedisService.getInstance().getOracleAlerts(chatId);
          if (alerts && Object.keys(alerts).length >= MAX_PRICE_ALERTS) {
            await sendErrorMessage(
              baseUrl,  
              chatId,
              `You have reached the maximum number of price alerts (${MAX_PRICE_ALERTS}). Please remove an existing alert before adding a new one.`,
            );
            return;
          }
          await promptNewPriceAlert(chatId);
          return;
        }

        if(callbackData.startsWith('/sub-pa_active_')) {
          const redis = RedisService.getInstance();
          const priceFeedId = callbackData.replace('/sub-pa_active_', '');
          const alerts = await redis.getOracleAlerts(chatId) || {};
          const filter = alerts[priceFeedId];
          if (!filter) {
            await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
            return;
          }
          const newActive = !filter.active;
          await redis.saveOraclePriceAlert(chatId, priceFeedId, { price: filter.price, name: filter.name, active: newActive });
          // Re-render settings menu
          await renderPriceAlertSettings(chatId, messageId, priceFeedId);
          return;
        }

        console.log("return from here");
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
        case '/alerts':
          await showAlertsMainMenu(chatId, messageId);
          break;
        case '/alerts_transfers':
          await showAlertsMenu(chatId, messageId);
          break;
        case '/alerts_prices':
          await showPriceAlertsMenu(chatId, messageId);
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
