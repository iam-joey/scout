import { RedisService } from '../../services/redisService';
import type { TelegramMessagePayload } from '../../types/telegram';
import { TELEGRAM_BASE_URL } from '../../utils/constant';
import {
  formatNftSummaryHtml,
  formatTokenBalanceHtml,
  formatWalletPnlHtml,
  isValidSolanaAddress,
  makeVybeRequest,
  sendErrorMessage,
  sendMessage,
} from '../../utils/helpers';
import { displayMainMenu } from './mainMenu';
import { searchAddress } from './maincommands/knownaccounts';
import { searchNftOwners } from './maincommands/nftowners';
import { updateLimit, updateTvlResolution, fetchTvlData, fetchTransactionsData } from './maincommands/programs';
import { fetchProgramDetails } from './maincommands/programDetails';
import { fetchInstructionsData, updateInstructionsRange } from './maincommands/instructionsData';
import { fetchActiveUsersData, updateActiveUsersRange } from './maincommands/activeUsersData';
import { fetchFindActiveUsersData, updateFindActiveUsersLimit, updateFindActiveUsersDays } from './maincommands/findActiveUsersData';
import { fetchTokenDetails, fetchTopTokenHolders } from './maincommands/tokens';

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
  baseUrl: string
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
      REDIS_TTL
    );
  } catch (error) {
    console.error('Error fetching NFT balances:', error);
    await sendErrorMessage(
      baseUrl,
      chatId,
      'Error fetching NFT balances. Please try again later.'
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
  baseUrl: string
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
      REDIS_TTL
    );
  } catch (error) {
    console.error('Error fetching token balances:', error);
    await sendErrorMessage(
      baseUrl,
      chatId,
      'Error fetching token balances. Please try again later.'
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
  baseUrl: string
): Promise<void> {
  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await sendErrorMessage(baseUrl, chatId, 'Invalid wallet address');
    return;
  }
  
  try {
    const redis = RedisService.getInstance();
    const resolution = await redis.get(`userState-${userId}-pnlResolution`);
    
    if (!resolution) {
      await sendErrorMessage(baseUrl, chatId, 'Time resolution not found. Please try again.');
      return;
    }

    // Store wallet address in Redis for future use (do this before the request)
    await redis.set(
      `userState-${userId}-walletPnl`,
      walletAddress,
      REDIS_TTL
    );

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
          inline_keyboard: [
            [{ text: ' main menu', callback_data: '/main' }],
          ],
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
      'Error fetching wallet PnL. Please try again later.'
    );
  }
}

/**
 * Handle welcome message
 */
async function handleWelcomeMessage(chatId: number, baseUrl: string): Promise<void> {
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
    
    // Get user state from Redis
    const redis = RedisService.getInstance();
    const userState = await redis.get(`userState-${userId}`);
    const searchState = await redis.get(`known_accounts_search:${userId}`);
    const nftSearchState = await redis.get(`nft_owners_search:${userId}`);
    const programRankingState = await redis.get(`program_ranking_state:${userId}`);
    const tvlState = await redis.get(`tvl_state:${userId}`);
    const transactionsState = await redis.get(`transactions_state:${userId}`);
    const programDetailsState = await redis.get(`program_details_state:${userId}`);
    const instructionsState = await redis.get(`instructions_state:${userId}`);
    const activeUsersState = await redis.get(`activeusers_state:${userId}`);
    const findActiveUsersState = await redis.get(`findactiveusers_state:${userId}`);
    const tokenDetailsState = await redis.get(`token_details_state:${userId}`);
    const tokenHoldersState = await redis.get(`token_holders_state:${userId}`);

    // Handle commands and states
    switch (messageText) {
      case '/start':
        await handleWelcomeMessage(chatId, baseUrl);
        break;
      
      default:
        // Handle NFT balance request
        if (userState === 'nftBalances') {
          console.log("inside nftBalances")
          await handleNftBalanceResponse(messageText, chatId, userId, baseUrl);
        } 
        // Handle token balance request
        else if (userState === 'tokenBalances') {
          console.log("inside tokenBalances")
          await handleTokenBalanceResponse(messageText, chatId, userId, baseUrl);
        } 
        // Handle wallet PnL address request
        else if (userState === 'walletPnlAddress') {
          console.log("inside walletPnlAddress")
          await handleWalletPnlResponse(messageText, chatId, userId, baseUrl);
        }
        // Handle known accounts search
        else if (searchState === 'waiting_for_address') {
          console.log("searchState");
          if (!isValidSolanaAddress(messageText)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid wallet address. Please enter a valid Solana address.');
            return;
          }
          const redis = RedisService.getInstance();
          await redis.del(`known_accounts_search:${chatId}`);
          await searchAddress(chatId, messageText);
        }
        // Handle NFT owners search
        else if (nftSearchState === 'waiting_for_address') {
          console.log("nftSearchState");
          if (!isValidSolanaAddress(messageText)) {
            await sendErrorMessage(baseUrl, chatId, 'Invalid NFT collection address. Please enter a valid Solana address.');
            return;
          }
          const redis = RedisService.getInstance();
          await redis.del(`nft_owners_search:${chatId}`);
          await searchNftOwners(chatId, messageText);
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
          console.log("tvlState", tvlState);
          await fetchTvlData(chatId, messageText);
          await RedisService.getInstance().del(`tvl_state:${chatId}`);
        }
        // Handle Transactions program ID input
        else if (transactionsState === 'waiting_for_program_id') {
          console.log("transactionsState", transactionsState);
          await fetchTransactionsData(chatId, messageText);
          await RedisService.getInstance().del(`transactions_state:${chatId}`);
          
        }
        // Handle Program Details program ID input
        else if (programDetailsState === 'waiting_for_program_id') {
          console.log("programDetailsState", programDetailsState);
          await fetchProgramDetails(chatId, messageText);
          await RedisService.getInstance().del(`program_details_state:${chatId}`);
        }
        // Handle Instructions Data program ID input
        else if (instructionsState === 'waiting_for_program_id') {
          console.log("instructionsState", instructionsState);
          await fetchInstructionsData(chatId, messageText);
          await RedisService.getInstance().del(`instructions_state:${chatId}`);
        }
        // Handle Instructions Data range input
        else if (instructionsState === 'waiting_for_range') {
          console.log("instructionsState", instructionsState);
          await updateInstructionsRange(chatId, messageText);
          
        }
        // Handle Active Users Data program ID input
        else if (activeUsersState === 'waiting_for_program_id') {
          console.log("activeUsersState", activeUsersState);
          await fetchActiveUsersData(chatId, messageText);
          await RedisService.getInstance().del(`activeusers_state:${chatId}`);
        }
        // Handle Active Users Data range input
        else if (activeUsersState === 'waiting_for_range') {
          console.log("activeUsersState", activeUsersState);
          await updateActiveUsersRange(chatId, messageText);
        }
        // Handle Find Program Active Users program ID input
        else if (findActiveUsersState === 'waiting_for_program_id') {
          console.log("findActiveUsersState", findActiveUsersState);
          await fetchFindActiveUsersData(chatId, messageText);
          await RedisService.getInstance().del(`findactiveusers_state:${chatId}`);
        }
        // Handle Find Program Active Users limit input
        else if (findActiveUsersState === 'waiting_for_limit') {
          console.log("findActiveUsersState", findActiveUsersState);
          await updateFindActiveUsersLimit(chatId, messageText);
        }
        // Handle Find Program Active Users days input
        else if (findActiveUsersState === 'waiting_for_days') {
          console.log("findActiveUsersState", findActiveUsersState);
          await updateFindActiveUsersDays(chatId, messageText);
        }
        // Handle Token Details mint address input
        else if (tokenDetailsState === 'waiting_for_mint_address') {
          console.log("tokenDetailsState", tokenDetailsState);
          await fetchTokenDetails(chatId, messageText);
          await RedisService.getInstance().del(`token_details_state:${chatId}`);
        }
        // Handle Token Holders mint address input
        else if (tokenHoldersState === 'waiting_for_mint_address') {
          console.log("tokenHoldersState", tokenHoldersState);
          await fetchTopTokenHolders(chatId, messageText);
          await RedisService.getInstance().del(`token_holders_state:${chatId}`);
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
