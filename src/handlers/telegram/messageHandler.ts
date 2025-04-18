import { RedisService } from '../../services/redisService';
import type { TelegramMessagePayload } from '../../types/telegram';
import { TELEGRAM_BASE_URL, COMMON_TOKENS, MAX_PRICE_ALERTS } from '../../utils/constant';
import type { TokenSymbol } from '../../utils/constant';
import {
  formatNftSummaryHtml,
  formatTokenBalanceHtml,
  formatWalletPnlHtml,
  isValidSolanaAddress,
  makeVybeRequest,
  sendErrorMessage,
  sendMessage,
  updateMessage,
} from '../../utils/helpers';
import { displayMainMenu } from './mainMenu';
import { formatAlertsSummaryHtml, renderAlertSettingsMenu } from './maincommands/transfers';
import { showPriceAlertsMenu } from './maincommands/priceAlerts';
import type { UserTransfer } from '../../services/redisService';
import { searchAddress } from './maincommands/knownaccounts';
import { searchNftOwners } from './maincommands/nftowners';
import {
  updateLimit,
  updateTvlResolution,
  fetchTvlData,
  fetchTransactionsData,
} from './maincommands/programs';
import { fetchProgramDetails } from './maincommands/programDetails';
import {
  fetchInstructionsData,
  updateInstructionsRange,
} from './maincommands/instructionsData';
import {
  fetchActiveUsersData,
  updateActiveUsersRange,
} from './maincommands/activeUsersData';
import {
  fetchFindActiveUsersData,
  updateFindActiveUsersLimit,
  updateFindActiveUsersDays,
} from './maincommands/findActiveUsersData';
import { fetchTokenDetails, fetchTopTokenHolders, updateTokenTransfersFilter } from './maincommands/tokens';
import { fetchOhlcvData, displayOhlcvSettings, updateOhlcvTime, fetchMarkets } from './maincommands/prices';

// Constants
const TOKENS_PER_PAGE = 5;
const REDIS_TTL = 60; // 3 minutes

/**
 * Handle NFT balance request when user sends a wallet address
 */
async function handleNftBalanceResponse(
  walletAddress: string,
  chatId: number,
  userId: number,
  baseUrl: string,
): Promise<void> {
  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await sendErrorMessage(baseUrl, chatId, 'Invalid wallet address');
    return;
  }

  try {
    const data = await makeVybeRequest(
      `account/nft-balance/${walletAddress}?limit=${TOKENS_PER_PAGE}&page=0`,
      'GET',
    );

    const formattedMessage = formatNftSummaryHtml(data);

    await sendMessage(baseUrl, {
      chat_id: chatId,
      text: formattedMessage.text,
      reply_markup: formattedMessage.reply_markup,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    // Store wallet address in Redis for pagination
    const redis = RedisService.getInstance();
    await redis.set(
      `userState-${userId}-nftBalances`,
      walletAddress,
      REDIS_TTL,
    );
  } catch (error) {
    console.error('Error fetching NFT balances:', error);
    await sendErrorMessage(
      baseUrl,
      chatId,
      'Error fetching NFT balances. Please try again later.',
    );
  }
}

/**
 * Handle token balance request when user sends a wallet address
 */
async function handleTokenBalanceResponse(
  walletAddress: string,
  chatId: number,
  userId: number,
  baseUrl: string,
): Promise<void> {
  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await sendErrorMessage(baseUrl, chatId, 'Invalid wallet address');
    return;
  }

  try {
    const data = await makeVybeRequest(
      `account/token-balance/${walletAddress}?limit=${TOKENS_PER_PAGE}&page=0`,
      'GET',
    );

    const formattedMessage = formatTokenBalanceHtml(data);

    await sendMessage(baseUrl, {
      chat_id: chatId,
      text: formattedMessage.text,
      reply_markup: formattedMessage.reply_markup,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    // Store wallet address in Redis for pagination
    const redis = RedisService.getInstance();
    await redis.set(
      `userState-${userId}-tokenBalances`,
      walletAddress,
      REDIS_TTL,
    );
  } catch (error) {
    console.error('Error fetching token balances:', error);
    await sendErrorMessage(
      baseUrl,
      chatId,
      'Error fetching token balances. Please try again later.',
    );
  }
}

/**
 * Handle wallet PnL response when user sends a wallet address
 */
async function handleWalletPnlResponse(
  walletAddress: string,
  chatId: number,
  userId: number,
  baseUrl: string,
): Promise<void> {
  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await sendErrorMessage(baseUrl, chatId, 'Invalid wallet address');
    return;
  }

  try {
    const redis = RedisService.getInstance();
    const resolution = await redis.get(`userState-${userId}-pnlResolution`);

    if (!resolution) {
      await sendErrorMessage(
        baseUrl,
        chatId,
        'Time resolution not found. Please try again.',
      );
      return;
    }

    // Store wallet address in Redis for future use (do this before the request)
    await redis.set(`userState-${userId}-walletPnl`, walletAddress, REDIS_TTL);

    const data = await makeVybeRequest(
      `account/pnl/${walletAddress}?resolution=${resolution}&limit=5&page=0`,
      'GET',
    );

    // Handle case when there's no data
    if (!data || !data.summary) {
      await sendMessage(baseUrl, {
        chat_id: chatId,
        text: '<b>📊 No trading data available for this wallet.</b>',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: ' main menu', callback_data: '/main' }]],
        },
      });
      return;
    }

    // Make sure we have tokenMetrics array even if it's empty
    if (!data.tokenMetrics) {
      data.tokenMetrics = [];
    }

    // Format and send the message
    const formattedMessage = formatWalletPnlHtml(data, resolution, 0);

    await sendMessage(baseUrl, {
      chat_id: chatId,
      text: formattedMessage.text,
      reply_markup: formattedMessage.reply_markup,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error fetching wallet PnL:', error);
    await sendErrorMessage(
      baseUrl,
      chatId,
      'Error fetching wallet PnL. Please try again later.',
    );
  }
}

/**
 * Handle welcome message
 */
async function handleWelcomeMessage(
  chatId: number,
  baseUrl: string,
): Promise<void> {
  await displayMainMenu(chatId, undefined, baseUrl);
}

/**
 * Main message handler for Telegram messages
 */
export const handleMessage = async (payload: TelegramMessagePayload) => {
  try {
    // Extract common data from payload
    const chatId = payload.message.chat.id;
    const userId = payload.message.from.id;
    const messageText = payload.message.text || '';
    const baseUrl = TELEGRAM_BASE_URL;
    const messageId=payload.message.message_id;

    // Get user state from Redis
    const redis = RedisService.getInstance();
    const userState = await redis.get(`userState-${userId}`);
    const searchState = await redis.get(`known_accounts_search:${userId}`);
    const nftSearchState = await redis.get(`nft_owners_search:${userId}`);
    const programRankingState = await redis.get(
      `program_ranking_state:${userId}`,
    );
    const tvlState = await redis.get(`tvl_state:${userId}`);
    const transactionsState = await redis.get(`transactions_state:${userId}`);
    const programDetailsState = await redis.get(
      `program_details_state:${userId}`,
    );
    const instructionsState = await redis.get(`instructions_state:${userId}`);
    const activeUsersState = await redis.get(`activeusers_state:${userId}`);
    const findActiveUsersState = await redis.get(
      `findactiveusers_state:${userId}`,
    );
    const tokenDetailsState = await redis.get(`token_details_state:${userId}`);
    const tokenHoldersState = await redis.get(`token_holders_state:${userId}`);
    const tokenTransfersState = await redis.get(`token_transfers_state:${userId}`);
    const priceMarketsState = await redis.get(`prices_markets_state:${chatId}`);
    const transferAlertState = await redis.get(`userState-${userId}`);

    // Handle commands and states
    switch (messageText) {
      case '/start':
        await handleWelcomeMessage(chatId, baseUrl);
        break;
      case '/myalerts':
        const alertsSummary = await formatAlertsSummaryHtml(chatId);
        await sendMessage(baseUrl, {
          chat_id: chatId,
          text: alertsSummary.text,
          parse_mode: 'HTML' as 'HTML',
          reply_markup: alertsSummary.reply_markup,
        });
        break;
      case '/SOL':
      case '/ETH':
      case '/BTC':
        const alerts = await RedisService.getInstance().getOracleAlerts(userId);
        if (alerts && Object.keys(alerts).length >= MAX_PRICE_ALERTS) {
          await sendErrorMessage(
            baseUrl,  
            chatId,
            `You have reached the maximum number of price alerts (${MAX_PRICE_ALERTS}). Please remove an existing alert before adding a new one.`,
          );
          return;
        }
        const token = messageText.slice(1) as TokenSymbol; // Remove the /
        const priceFeedId = COMMON_TOKENS[token];
        await redis.set(`editing_alert_${chatId}`, priceFeedId, 60);
        await redis.set(`userState-${userId}`, 'price_value_input', 60);
        await sendMessage(baseUrl, {
          chat_id: chatId,
          text: `At what <b>price</b> do you want to be alerted for ${token}?`,
          parse_mode: 'HTML' as 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/alerts_prices' }]],
          },
        });
        break;
      default:
        // Handle NFT balance request
        if (userState === 'nftBalances') {
          await handleNftBalanceResponse(messageText, chatId, userId, baseUrl);
          await redis.del(`nft_balances:${chatId}`);
        }
        // Handle token balance request
        else if (userState === 'tokenBalances') {
          await handleTokenBalanceResponse(
            messageText,
            chatId,
            userId,
            baseUrl,
          );
          await redis.del(`token_balances:${chatId}`);
        }
        // Handle wallet PnL address request
        else if (userState === 'walletPnlAddress') {
          await handleWalletPnlResponse(messageText, chatId, userId, baseUrl);
          await redis.del(`wallet_pnl_address:${chatId}`);
        }
        // Handle known accounts search
        else if (searchState === 'waiting_for_address') {
          console.log('searchState');
          if (!isValidSolanaAddress(messageText)) {
            await sendErrorMessage(
              baseUrl,
              chatId,
              'Invalid wallet address. Please enter a valid Solana address.',
            );
            return;
          }
          const redis = RedisService.getInstance();
          await redis.del(`known_accounts_search:${chatId}`);
          await searchAddress(chatId, messageText);
        }
        // Handle NFT owners search
        else if (nftSearchState === 'waiting_for_address') {
          if (!isValidSolanaAddress(messageText)) {
            await sendErrorMessage(
              baseUrl,
              chatId,
              'Invalid NFT collection address. Please enter a valid Solana address.',
            );
            return;
          }
          const redis = RedisService.getInstance();
          await searchNftOwners(chatId, messageText);
          await redis.del(`nft_owners_search:${chatId}`);
        }
        // Handle program ranking limit input
        else if (programRankingState === 'waiting_for_limit') {
          await updateLimit(chatId, messageText);
        }
        // Handle TVL resolution input
        else if (tvlState === 'waiting_for_resolution') {
          await updateTvlResolution(chatId, messageText);
        }
        // Handle TVL program ID input
        else if (tvlState === 'waiting_for_program_id') {
          console.log('tvlState', tvlState);
          await fetchTvlData(chatId, messageText);
          await RedisService.getInstance().del(`tvl_state:${chatId}`);
        }
        // Handle Transactions program ID input
        else if (transactionsState === 'waiting_for_program_id') {
          console.log('transactionsState', transactionsState);
          await fetchTransactionsData(chatId, messageText);
          await RedisService.getInstance().del(`transactions_state:${chatId}`);
        }
        // Handle Program Details program ID input
        else if (programDetailsState === 'waiting_for_program_id') {
          console.log('programDetailsState', programDetailsState);
          await fetchProgramDetails(chatId, messageText);
          await RedisService.getInstance().del(
            `program_details_state:${chatId}`,
          );
        }
        // Handle Instructions Data program ID input
        else if (instructionsState === 'waiting_for_program_id') {
          console.log('instructionsState', instructionsState);
          await fetchInstructionsData(chatId, messageText);
          await RedisService.getInstance().del(`instructions_state:${chatId}`);
        }
        // Handle Instructions Data range input
        else if (instructionsState === 'waiting_for_range') {
          console.log('instructionsState', instructionsState);
          await updateInstructionsRange(chatId, messageText);
        }
        // Handle Active Users Data program ID input
        else if (activeUsersState === 'waiting_for_program_id') {
          console.log('activeUsersState', activeUsersState);
          await fetchActiveUsersData(chatId, messageText);
          await RedisService.getInstance().del(`activeusers_state:${chatId}`);
        }
        // Handle Active Users Data range input
        else if (activeUsersState === 'waiting_for_range') {
          console.log('activeUsersState', activeUsersState);
          await updateActiveUsersRange(chatId, messageText);
        }
        // Handle Find Program Active Users program ID input
        else if (findActiveUsersState === 'waiting_for_program_id') {
          console.log('findActiveUsersState', findActiveUsersState);
          await fetchFindActiveUsersData(chatId, messageText);
          await RedisService.getInstance().del(
            `findactiveusers_state:${chatId}`,
          );
        }
        // Handle Find Program Active Users limit input
        else if (findActiveUsersState === 'waiting_for_limit') {
          console.log('findActiveUsersState', findActiveUsersState);
          await updateFindActiveUsersLimit(chatId, messageText);
        }
        // Handle Find Program Active Users days input
        else if (findActiveUsersState === 'waiting_for_days') {
          console.log('findActiveUsersState', findActiveUsersState);
          await updateFindActiveUsersDays(chatId, messageText);
        }
        // Handle Token Details mint address input
        else if (tokenDetailsState === 'waiting_for_mint_address') {
          console.log('tokenDetailsState', tokenDetailsState);
          await fetchTokenDetails(chatId, messageText);
          await RedisService.getInstance().del(`token_details_state:${chatId}`);
          await RedisService.getInstance().del(`token_transfers_state:${chatId}`);
          await RedisService.getInstance().del(`token_holders_state:${chatId}`);
        }
        // Handle Token Holders mint address input
        else if (tokenHoldersState === 'waiting_for_mint_address') {
          console.log('tokenHoldersState', tokenHoldersState);
          await fetchTopTokenHolders(chatId, messageText);
          await RedisService.getInstance().del(`token_holders_state:${chatId}`);
          await RedisService.getInstance().del(`token_transfers_state:${chatId}`);
          await RedisService.getInstance().del(`token_details_state:${chatId}`);
        }
        // Handle Token Transfers filter inputs
        else if (tokenTransfersState && tokenTransfersState.startsWith('waiting_for_')) {
          console.log('tokenTransfersState', tokenTransfersState);
          const filterType = tokenTransfersState.replace('waiting_for_', '');
          const value = messageText.trim();

          // Get the last message ID from Redis
          const lastMessageId = await redis.get(`token_transfers_last_message:${chatId}`);
          const messageId = lastMessageId ? parseInt(lastMessageId) : undefined;

          // Handle special commands
          if (value.toLowerCase() === 'clear') {
            await updateTokenTransfersFilter(chatId, filterType, '', messageId);
          } else {
            await updateTokenTransfersFilter(chatId, filterType, value, messageId);
          }
        }
        // Handle market address input
        else if (priceMarketsState === 'waiting_for_address') {
          console.log('Handling market address input');
          const programId = messageText.trim();
          if (!isValidSolanaAddress(programId)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid program ID. Please enter a valid Solana address.');
            return;
          }
          
          // Show loading message
          await sendMessage(baseUrl, {
            chat_id: chatId,
            text: '⏳ <b>Fetching market data...</b>\n\nPlease wait while we fetch the market data for the provided program.',
            parse_mode: 'HTML' as 'HTML',
          });

          await fetchMarkets(chatId, programId);
          await redis.del(`prices_markets_state:${chatId}`);
        }
        // Handle OHLCV token address input
        else if (userState === 'ohlcv_token') {
          console.log('Handling OHLCV token address input');
          const tokenAddress = messageText.trim();
          if (!isValidSolanaAddress(tokenAddress)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid token address. Please enter a valid Solana address.');
            return;
          }
          
          // Store token address in Redis
          await redis.set(`ohlcv_token:${chatId}`, tokenAddress, REDIS_TTL);
          
          // Show loading message
          await sendMessage(baseUrl, {
            chat_id: chatId,
            text: '⏳ <b>Fetching OHLCV data...</b>\n\nPlease wait while we fetch the OHLCV data for the provided token.',
            parse_mode: 'HTML' as 'HTML',
          });

          await fetchOhlcvData(chatId, tokenAddress, 0);
          await redis.del(`userState-${userId}`);
        }
        // Handle OHLCV time start input
        else if (userState === 'ohlcv_timestart') {
          console.log('Handling OHLCV time start input');
          const timestamp = parseInt(messageText.trim());
          if (isNaN(timestamp)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid timestamp. Please enter a valid Unix timestamp.');
            return;
          }
          
          // Store start time in Redis
          await redis.set(`ohlcv_time_start:${chatId}`, timestamp.toString(), REDIS_TTL);
          
          // Get the last message ID from Redis
          const lastMessageId = await redis.get(`ohlcv_last_message:${chatId}`);
          const messageId = lastMessageId ? parseInt(lastMessageId) : undefined;
          
          // Send a new confirmation message
          const response = await sendMessage(TELEGRAM_BASE_URL, {
            chat_id: chatId,
            text: `<b>✅ Start Time Set</b>\n\nStart time has been set to: ${timestamp} (${new Date(timestamp * 1000).toUTCString()})\n\nPlease wait while we update the settings...`,
            parse_mode: 'HTML' as 'HTML',
          });
          
          // Display updated settings after a short delay
          setTimeout(async () => {
            await displayOhlcvSettings(chatId, response.message_id);
          }, 1500);
          
          await redis.del(`userState-${userId}`);
        }
        // Handle OHLCV time end input
        else if (userState === 'ohlcv_timeend') {
          console.log('Handling OHLCV time end input');
          const timestamp = parseInt(messageText.trim());
          if (isNaN(timestamp)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid timestamp. Please enter a valid Unix timestamp.');
            return;
          }
          
          // Store end time in Redis
          await redis.set(`ohlcv_time_end:${chatId}`, timestamp.toString(), REDIS_TTL);
          
          // Get the last message ID from Redis
          const lastMessageId = await redis.get(`ohlcv_last_message:${chatId}`);
          const messageId = lastMessageId ? parseInt(lastMessageId) : undefined;
          
          // Send a new confirmation message
          const response = await sendMessage(baseUrl, {
            chat_id: chatId,
            text: `<b>✅ End Time Set</b>\n\nEnd time has been set to: ${timestamp} (${new Date(timestamp * 1000).toUTCString()})\n\nPlease wait while we update the settings...`,
            parse_mode: 'HTML' as 'HTML',
          });
          
          // Display updated settings after a short delay
          setTimeout(async () => {
            await displayOhlcvSettings(chatId, response.message_id);
          }, 1500);
          
          await redis.del(`userState-${userId}`);
        }
        // Handle transfer address input
        else if (userState === 'transfer_address') {
          console.log('Handling transfer address input');
          const address = messageText.trim();
          if (!isValidSolanaAddress(address)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid address. Please enter a valid Solana address.');
            return;
          }
          
          // Import handleNewAlert from transfers
          const { handleNewAlert } = await import('./maincommands/transfers');

          await handleNewAlert(chatId, address);
          await redis.del(`userState-${userId}`);
          return;
        }

        // Handle transfer mint input
        else if (userState === 'transfer_mint') {
          console.log(payload)
          console.log("inside the transfer mint settings",chatId,messageId,messageText)
          const mintAddress = messageText.trim();
          if (mintAddress === '/clear') {
            const whaleAddress = await redis.get(`editing_alert_${chatId}`);
            if (!whaleAddress) {
              await sendErrorMessage(baseUrl, chatId, 'Session expired. Please try again.');
              return;
            }

            const transfersRaw = await redis.get('transfers') || '{}';
            const transfersData = JSON.parse(transfersRaw);
            const users = (transfersData[whaleAddress] || []) as UserTransfer[];
            const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
            if (!userAlert) {
              await sendErrorMessage(baseUrl, chatId, 'Alert not found.');
              return;
            }

            delete userAlert.filters.mintAddress;
            await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
            const response = await sendMessage(baseUrl, {
              chat_id: chatId,
              text: '✅ <b>Settings Updated</b>',
              parse_mode: 'HTML' as 'HTML',
              
            });
            await renderAlertSettingsMenu(chatId, response.result.message_id, whaleAddress);
            await redis.del(`userState-${userId}`);
            await redis.del(`editing_alert_${chatId}`);
            return;
          }

          if (!isValidSolanaAddress(mintAddress)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid mint address. Please enter a valid Solana address.');
            return;
          }

          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(baseUrl, chatId, 'Session expired. Please try again.');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          const users = (transfersData[whaleAddress] || []) as UserTransfer[];
          const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
          if (!userAlert) {
            await sendErrorMessage(baseUrl, chatId, 'Alert not found.');
            return;
          }

          userAlert.filters.mintAddress = mintAddress;
          await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
          const response = await sendMessage(baseUrl, {
            chat_id: chatId,
            text: '✅ <b>Settings Updated</b>',
            parse_mode: 'HTML' as 'HTML',
          });
          // console.log("the response is",response)
          await renderAlertSettingsMenu(chatId, response.result.message_id, whaleAddress);
          await redis.del(`userState-${userId}`);
          await redis.del(`editing_alert_${chatId}`);
          return;
        }

        // Handle transfer amount input
        else if (userState === 'transfer_amount') {
          if (messageText.startsWith('/')) {
            // Handle quick alert commands
            if (messageText.startsWith('/alert ')) {
              const token = messageText.split(' ')[1]?.toUpperCase() as TokenSymbol;
              if (!token || !COMMON_TOKENS[token]) {
                await sendErrorMessage(baseUrl, chatId, 'Invalid token. Use /alert SOL, /alert ETH, or /alert BTC');
                return;
              }

              const priceFeedId = COMMON_TOKENS[token];
              await redis.set(`editing_alert_${chatId}`, priceFeedId, 60);
              await redis.set(`userState-${userId}`, 'price_value_input', 60);
              
              await sendMessage(baseUrl, {
                chat_id: chatId,
                text: `At what <b>price</b> do you want to be alerted for ${token}?`,
                parse_mode: 'HTML' as 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/alerts_prices' }]],
                },
              });
              return;
            }

            
            
          }

          if (messageText.trim() === '/clear') {
            const whaleAddress = await redis.get(`editing_alert_${chatId}`);
            if (!whaleAddress) {
              await sendErrorMessage(baseUrl, chatId, 'Session expired. Please try again.');
              return;
            }

            const transfersRaw = await redis.get('transfers') || '{}';
            const transfersData = JSON.parse(transfersRaw);
            const users = (transfersData[whaleAddress] || []) as UserTransfer[];
            const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
            if (!userAlert) {
              await sendErrorMessage(baseUrl, chatId, 'Alert not found.');
              return;
            }

            delete userAlert.filters.amount;
            delete userAlert.filters.greater;
            await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
            const response = await sendMessage(baseUrl, {
              chat_id: chatId,
              text: '✅ <b>Settings Updated</b>',
              parse_mode: 'HTML' as 'HTML',
            });
            await renderAlertSettingsMenu(chatId, response.result.message_id, whaleAddress);
            await redis.del(`userState-${userId}`);
            await redis.del(`editing_alert_${chatId}`);
            return;
          }

          const amount = parseFloat(messageText.trim());
          if (isNaN(amount) || amount <= 0) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid amount. Please enter a positive number.');
            return;
          }

          const whaleAddress = await redis.get(`editing_alert_${chatId}`);
          if (!whaleAddress) {
            await sendErrorMessage(baseUrl, chatId, 'Session expired. Please try again.');
            return;
          }

          const transfersRaw = await redis.get('transfers') || '{}';
          const transfersData = JSON.parse(transfersRaw);
          const users = (transfersData[whaleAddress] || []) as UserTransfer[];
          const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
          if (!userAlert) {
            await sendErrorMessage(baseUrl, chatId, 'Alert not found.');
            return;
          }

          userAlert.filters.amount = amount;
          await redis.saveAlertTransfer(chatId, whaleAddress, userAlert.filters);
          const response = await sendMessage(baseUrl, {
            chat_id: chatId,
            text: '💰 <b>Set Amount Condition</b>\n\nSelect the condition for your amount filter:',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '> Greater Than', callback_data: '/sub-ta_gt' },
                  { text: '≤ Less/Equal', callback_data: '/sub-ta_le' },
                ],
              ],
            },
          });
          return;
        }

        // Handle price feed input
        else if (userState === 'price_feed_input') {
          const priceFeedId = messageText.trim();
          if (!priceFeedId) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid price feed ID');
            return;
          }

          await redis.set(`editing_alert_${chatId}`, priceFeedId, 60);
          await redis.set(`userState-${userId}`, 'price_value_input', 60);
          
          await sendMessage(baseUrl, {
            chat_id: chatId,
            text: 'At what <b>price</b> do you want to be alerted?',
            parse_mode: 'HTML' as 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/alerts_prices' }]],
            },
          });
          return;
        }

        // Handle price value input
        else if (userState === 'price_value_input') {
          const price = parseFloat(messageText.trim());
          if (isNaN(price) || price <= 0) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid price. Please enter a positive number.');
            return;
          }

          const priceFeedId = await redis.get(`editing_alert_${chatId}`);
          if (!priceFeedId) {
            await sendErrorMessage(baseUrl, chatId, 'Session expired. Please try again.');
            return;
          }

          const existing = await redis.getOracleAlerts(chatId) || {};
          const prev = existing[priceFeedId];
          const name = prev?.name || priceFeedId;
          const active = prev?.active ?? true;
          await redis.saveOraclePriceAlert(chatId, priceFeedId, { price, name, active });

          await sendMessage(baseUrl, {
            chat_id: chatId,
            text: `✅ Price updated: "<b>${name}</b>" will alert at $${price}${active?'' : ' (inactive)'}.`, 
            parse_mode: 'HTML' as 'HTML',
          });
          
          await showPriceAlertsMenu(chatId);
          await redis.del(`userState-${userId}`);
          await redis.del(`editing_alert_${chatId}`);
          return;
        }
        // Handle price name input
        else if (userState === 'price_name_input') {
          const name = messageText.trim();
          if (!name) {
            await sendErrorMessage(baseUrl, chatId, 'Name cannot be empty. Please enter a valid name.');
            return;
          }
          const priceFeedId = await redis.get(`editing_alert_${chatId}`);
          if (!priceFeedId) {
            await sendErrorMessage(baseUrl, chatId, 'Session expired. Please start again.');
            return;
          }
          // Determine price: new or existing
          const priceStr = await redis.get(`editing_price_${chatId}`);
          let priceNum: number;
          if (priceStr) {
            priceNum = parseFloat(priceStr);
          } else {
            const alerts = await redis.getOracleAlerts(chatId);
            priceNum = alerts && alerts[priceFeedId] ? alerts[priceFeedId].price : NaN;
          }
          if (isNaN(priceNum) || priceNum <= 0) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid price data. Please start again.');
            return;
          }
          // Save alert with name
          await redis.saveOraclePriceAlert(chatId, priceFeedId, { price: priceNum, name, active: true });
          await sendMessage(baseUrl, {
            chat_id: chatId,
            text: `✅ Alert "<b>${name}</b>" set for $${priceNum}.`,
            parse_mode: 'HTML' as 'HTML',
          });

          await showPriceAlertsMenu(chatId);
          await redis.del(`userState-${userId}`);
          await redis.del(`editing_alert_${chatId}`);
          await redis.del(`editing_price_${chatId}`);
          return;
        }

        // Handle unknown commands
        else {
          await sendErrorMessage(baseUrl, chatId, 'Invalid command');
        }
        break;
    }
  } catch (error) {
    console.error('Error in handleMessage:', error);
    throw error;
  }
};
