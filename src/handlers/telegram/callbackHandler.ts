import { RedisService } from '../../services/redisService';
import type { TelegramWebHookCallBackQueryPayload } from '../../types/telegram';
import { TELEGRAM_BASE_URL } from '../../utils/constant';
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

// Constants
const TOKENS_PER_PAGE = 5;
const REDIS_TTL = 180000; // 3 minutes
const PNL_RESOLUTIONS = ['1d', '7d', '30d'];

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
 * Handle wallet PnL request
 */
async function handleWalletPnlRequest(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string
): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${userId}`, 'walletPnl', REDIS_TTL);
  await updateMessage(baseUrl, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Please select the time resolution:',
    reply_markup: {
      inline_keyboard: [
        PNL_RESOLUTIONS.map(resolution => ({
          text: resolution.toUpperCase(),
          callback_data: `/sub-pnl_${resolution}`,
        })),
        [{
          text: 'Back to main menu',
          callback_data: '/main',
        }],
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
  resolution: string
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
 * Handle wallet PnL pagination
 */
async function handleWalletPnlPagination(
  userId: number,
  chatId: number,
  messageId: number,
  baseUrl: string,
  page: number
): Promise<void> {
  const redis = RedisService.getInstance();
  const walletAddress = await redis.get(`userState-${userId}-walletPnl`);
  const resolution = await redis.get(`userState-${userId}-pnlResolution`);
  
  if (!walletAddress || !isValidSolanaAddress(walletAddress) || !resolution) {
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Invalid wallet address or resolution',
    });
    return;
  }
  
  try {
    // Validate page number
    if (page < 0) {
      page = 0;
    }

    // First, get the summary data to check total trades
    let data = await makeVybeRequest(
      `account/pnl/${walletAddress}?resolution=${resolution}&limit=5&page=${page}`,
      'GET',
    );

    // If no data or empty token metrics, show appropriate message
    if (!data || !data.summary) {
      await updateMessage(baseUrl, {
        chat_id: chatId,
        message_id: messageId,
        text: 'No trading data available for this wallet.',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to main menu', callback_data: '/main' }],
          ],
        },
      });
      return;
    }

    // Check if we're trying to access a page beyond what's available
    const totalTokenCount = data.totalTokenCount || (data.summary?.uniqueTokensTraded || 0);
    const totalPages = Math.max(1, Math.ceil(totalTokenCount / 5));
    
    if (page >= totalPages && page > 0) {
      // We're trying to access a page that doesn't exist, go back to the last valid page
      page = totalPages - 1;
      // Fetch the data again with the corrected page
      const newData = await makeVybeRequest(
        `account/pnl/${walletAddress}?resolution=${resolution}&limit=5&page=${page}`,
        'GET',
      );
      // Reassign data with the new data
      data = newData;
    }

    // If we have data but no token metrics for this page
    if (!data.tokenMetrics || data.tokenMetrics.length === 0) {
      // Still show the summary but indicate no tokens for this page
      data.tokenMetrics = [];
    }
    
    const formattedMessage = formatWalletPnlHtml(data, resolution, page);

    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: formattedMessage.text,
      reply_markup: formattedMessage.reply_markup,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error fetching wallet PnL:', error);
    await updateMessage(baseUrl, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Error fetching wallet PnL. Please try again later.',
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
        ],
        [{ text: 'Wallet PnL', callback_data: '/walletPnl' },]
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

      // Handle wallet PnL pagination
      if (subCommand.startsWith('pnl_page_')) {
        const page = Number(subCommand.split('_')[2]);
        await handleWalletPnlPagination(userId, chatId, messageId, baseUrl, page);
        return;
      }
      console.log("inside the sub returning from here")
      if(subCommand.startsWith('pnl_')){
        console.log('Wallet PnL resolution selected:', callbackData);
        await handleWalletPnlResolution(userId, chatId, messageId, baseUrl, subCommand.split('_')[1]);
        return;
      }
      return;
    }
    console.log('Main command received:', callbackData);
    // Handle main commands
    switch (callbackData) {
      case '/balances':
        await balances(chatId, messageId);
        break;
        
      case '/main':
        await displayMainMenu(chatId, messageId, baseUrl);
        break;

      case '/walletPnl':
        await handleWalletPnlRequest(userId, chatId, messageId, baseUrl);
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
