import { RedisService } from '../../services/redisService';
import type { TelegramWebHookCallBackQueryPayload } from '../../types/telegram';
import { TELEGRAM_BASE_URL } from '../../utils/constant';
import {
  formatNftSummaryHtml,
  formatTokenBalanceHtml,
  isValidSolanaAddress,
  makeVybeRequest,
  sendErrorMessage,
  updateMessage,
} from '../../utils/helpers';
import { balances } from './maincommands/balances';

// Constants
const TOKENS_PER_PAGE = 5;
const REDIS_TTL = 180000; // 3 minutes

/**
 * Handle NFT balance request
 */
async function handleNftBalanceRequest(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string
): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${userId}`, 'nftBalances', REDIS_TTL);
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Please enter the wallet address below you want to view the balances of',
  });
}

/**
 * Handle token balance request
 */
async function handleTokenBalanceRequest(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string
): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${userId}`, 'tokenBalances', REDIS_TTL);
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Please enter the wallet address below you want to view the balances of',
  });
}

/**
 * Handle NFT balance pagination
 */
async function handleNftBalancePagination(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
  page: number
): Promise<void> {
  const redis = RedisService.getInstance();
  const walletAddress = await redis.get(`userState-${userId}-nftBalances`);
  
  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Invalid wallet address',
    });
    return;
  }
  
  try {
    const data = await makeVybeRequest(
      `account/nft-balance/${walletAddress}?limit=${TOKENS_PER_PAGE}&page=${page}`,
      'GET',
    );
    
    const totalPages = Math.ceil(data.totalNftCollectionCount / TOKENS_PER_PAGE);
    
    if (page >= totalPages) {
      await updateMessage(baseUrl, {
        chat_id: chatId,
        message_id: messageId,
        text: `Invalid page number. Maximum page is ${totalPages - 1}`,
      });
      return;
    }
    
    const formattedMessage = formatNftSummaryHtml(data, page);

    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: formattedMessage.text,
      reply_markup: formattedMessage.reply_markup,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error fetching NFT balances:', error);
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Error fetching NFT balances. Please try again later.',
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
  page: number
): Promise<void> {
  const redis = RedisService.getInstance();
  const walletAddress = await redis.get(`userState-${userId}-tokenBalances`);
  
  if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Invalid wallet address',
    });
    return;
  }
  
  try {
    const data = await makeVybeRequest(
      `account/token-balance/${walletAddress}?limit=${TOKENS_PER_PAGE}&page=${page}`,
      'GET',
    );
    
    const totalPages = Math.ceil(data.totalTokenCount / TOKENS_PER_PAGE);
    
    if (page >= totalPages) {
      await updateMessage(baseUrl, {
        chat_id: chatId,
        message_id: messageId,
        text: `Invalid page number. Maximum page is ${totalPages - 1}`,
      });
      return;
    }
    
    const formattedMessage = formatTokenBalanceHtml(data, page);

    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: formattedMessage.text,
      reply_markup: formattedMessage.reply_markup,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error fetching token balances:', error);
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Error fetching token balances. Please try again later.',
    });
  }
}

/**
 * Handle main menu display
 */
async function displayMainMenu(
  chatId: number,
  messageId: number,
  baseUrl: string
): Promise<void> {
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: '🔓 Welcome to VybeSniper',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Balances', callback_data: '/balances' },
          { text: 'KYC Status', callback_data: '/kycs' },
        ],
      ],
    },
  });
}

/**
 * Main callback handler for Telegram webhook callbacks
 */
export const handleCallback = async (
  payload: TelegramWebHookCallBackQueryPayload,
) => {
  try {
    // Extract common data from payload
    const chatId = payload.callback_query.message.chat.id;
    const userId = payload.callback_query.from.id;
    const callbackData = payload.callback_query.data;
    const messageId = payload.callback_query.message.message_id;
    const baseUrl = TELEGRAM_BASE_URL;

    // Handle sub-commands
    if (callbackData.startsWith('/sub-')) {
      const subCommand = callbackData.substring(5);
      
      // Handle NFT balances request
      if (subCommand === 'nftBalances') {
        await handleNftBalanceRequest(userId, chatId, messageId, baseUrl);
        return;
      }
      
      // Handle token balances request
      if (subCommand === 'tokenBalances') {
        await handleTokenBalanceRequest(userId, chatId, messageId, baseUrl);
        return;
      }
      
      // Handle NFT balance pagination
      if (subCommand.startsWith('nft_balance_page_')) {
        const page = Number(subCommand.split('_')[3]);
        await handleNftBalancePagination(userId, chatId, messageId, baseUrl, page);
        return;
      }
      
      // Handle token balance pagination
      if (subCommand.startsWith('token_balance_page_')) {
        const page = Number(subCommand.split('_')[3]);
        await handleTokenBalancePagination(userId, chatId, messageId, baseUrl, page);
        return;
      }
      
      return;
    }

    // Handle main commands
    switch (callbackData) {
      case '/balances':
        await balances(chatId, messageId);
        break;
        
      case '/main':
        await displayMainMenu(chatId, messageId, baseUrl);
        break;
        
      default:
        await sendErrorMessage(baseUrl, chatId, 'Invalid command');
        break;
    }
  } catch (error) {
    console.error('Error in handleCallback:', error);
    throw error;
  }
};
