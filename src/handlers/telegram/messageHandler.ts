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
