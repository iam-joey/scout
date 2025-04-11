import { RedisService } from '../../services/redisService';
import type { TelegramMessagePayload } from '../../types/telegram';
import { TELEGRAM_BASE_URL } from '../../utils/constant';
import {
  formatNftSummaryHtml,
  formatTokenBalanceHtml,
  isValidSolanaAddress,
  makeVybeRequest,
  sendErrorMessage,
  sendMessage,
  updateMessage,
} from '../../utils/helpers';
import { sendMainMenu } from './mainMenu';

// Constants
const TOKENS_PER_PAGE = 5;
const REDIS_TTL = 180000; // 3 minutes

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
 * Handle welcome message
 */
async function handleWelcomeMessage(chatId: number, baseUrl: string): Promise<void> {
  await sendMessage(baseUrl, {
    chat_id: chatId,
    text: 'Welcome to the bot!',
  });
  await sendMainMenu(chatId);
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
    const messageId = payload.message.message_id;
    const baseUrl = TELEGRAM_BASE_URL;
    
    // Get user state from Redis
    const redis = RedisService.getInstance();
    const userState = await redis.get(`userState-${userId}`);

    // Handle commands and states
    switch (messageText) {
      case '/start':
        await handleWelcomeMessage(chatId, baseUrl);
        break;
        
      default:
        // Handle NFT balance request
        if (userState === 'nftBalances') {
          await handleNftBalanceResponse(messageText, chatId, userId, baseUrl);
        } 
        // Handle token balance request
        else if (userState === 'tokenBalances') {
          await handleTokenBalanceResponse(messageText, chatId, userId, baseUrl);
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
