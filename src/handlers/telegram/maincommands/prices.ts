import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { RedisService } from '../../../services/redisService';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import { createPaginationButtons } from '../utils/formatters';

const REDIS_TTL = 300; // 5 minutes
const ITEMS_PER_PAGE = 10;

interface PriceProgram {
  programId: string;
  programName: string;
}

interface Market {
  baseTokenMint: string;
  baseTokenName: string;
  baseTokenSymbol: string;
  marketId: string;
  marketName: string;
  programId: string;
  programName: string;
  quoteTokenMint: string;
  quoteTokenName: string;
  quoteTokenSymbol: string;
  updatedAt: number;
}

/**
 * Display price programs menu
 */
export async function displayPriceProgramsMenu(chatId: number, messageId?: number) {
  const payload = {
    chat_id: chatId,
    text: '💰 Price Programs - Choose an option below:',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '📋 View All Programs',
            callback_data: '/sub-prices_programs_fetch',
          },
          {
            text: '📈 Markets',
            callback_data: '/sub-prices_markets_prompt',
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
 * Fetch and display price programs with pagination
 */
export async function fetchPricePrograms(
  chatId: number,
  page: number = 0,
  messageId?: number,
) {
  try {
    // Show initial loading state
    const loadingText = `<b>🔄 Fetching Price Programs</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬜⬜⬜⬜</code> 20%`;
    
    if (messageId) {
      await updateMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        message_id: messageId,
        text: loadingText,
        parse_mode: 'HTML' as 'HTML',
      });
    } else {
      const response = await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: loadingText,
        parse_mode: 'HTML' as 'HTML',
      });
      messageId = response.message_id;
    }

    // Check Redis cache first
    const redis = RedisService.getInstance();
    const cacheKey = 'price_programs';
    let programs: PriceProgram[] = [];

    // Update to 40%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: `<b>🔄 Fetching Price Programs</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬜⬜⬜</code> 40%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Try to get data from cache
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      programs = JSON.parse(cachedData);
    } else {
      // Fetch from API if not in cache
      const response = await makeVybeRequest('price/programs');
      if (!response || !response.data) {
        throw new Error('No price programs data found');
      }
      programs = response.data;
      
      // Cache the result
      await redis.set(cacheKey, JSON.stringify(programs), REDIS_TTL);
    }

    // Update to 60%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: `<b>🔄 Fetching Price Programs</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬜⬜</code> 60%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Calculate pagination
    const totalPrograms = programs.length;
    const totalPages = Math.ceil(totalPrograms / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalPrograms);
    const currentPagePrograms = programs.slice(startIndex, endIndex);

    // Format programs data
    let message = `<b>📊 Price Programs</b>\n\n`;
    message += `<i>Showing ${startIndex + 1}-${endIndex} of ${totalPrograms} programs</i>\n\n`;

    currentPagePrograms.forEach((program, index) => {
      message += `<b>${startIndex + index + 1}. ${program.programName}</b>\n`;
      message += `🆔 <code>${program.programId}</code>\n\n`;
    });

    // Create pagination buttons
    const paginationButtons = createPaginationButtons(
      page,
      totalPages - 1,
      '/sub-prices_programs_page_',
    );

    // Update to 100%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: `<b>🔄 Fetching Price Programs</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬛⬛</code> 100%`,
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
              text: '🔄 Refresh',
              callback_data: `/sub-prices_programs_fetch`,
            },
          ],
          [{ text: '🔙 Back', callback_data: '/prices' }],
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

    // No need to delete any message since we're updating the existing one
  } catch (error) {
    console.error('Error in fetchPricePrograms:', error);
    const errorMessage = {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch price programs. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: `/sub-prices_programs_fetch`,
            },
          ],
          [{ text: '🔙 Back', callback_data: '/prices' }],
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
 * Handle price programs pagination
 */
export async function handlePriceProgramsPagination(
  chatId: number,
  page: number,
  messageId: number,
) {
  await fetchPricePrograms(chatId, page, messageId);
}

/**
 * Prompt user to enter DEX or LP pool address
 */
export async function promptMarketsAddress(chatId: number, messageId?: number) {
  const redis = RedisService.getInstance();
  await redis.set(`prices_markets_state:${chatId}`, 'waiting_for_address', REDIS_TTL);

  const payload = {
    chat_id: chatId,
    text: '<b>🔍 Enter Market Address</b>\n\nPlease enter a DEX or LP pool address to view market details:',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back', callback_data: '/prices' }]],
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
 * Fetch and display market details with pagination
 */
export async function fetchMarkets(
  chatId: number,
  programId: string,
  page: number = 0,
  messageId?: number,
) {
  try {
    // Show loading message
    
    
    // Fetch market data first
    const response = await makeVybeRequest(`price/markets?programId=${programId}&page=${page}&limit=10`);
    console.log("here 5")
    if (!response || !response.data) {
      throw new Error('No market data found');
    }

    const markets: Market[] = response.data;

    // Format market data
    let message = `<b>📊 Market Details</b>\n\n`;
    message += `<i>Found ${markets.length} markets for program</i>\n`;
    message += `<code>${programId}</code>\n\n`;

    markets.forEach((market, index) => {
      message += `<b>${index + 1}. ${market.programName}</b>\n`;
      message += `🆔 Program: <code>${market.programId}</code>\n`;
      message += `💱 Pair: ${market.baseTokenSymbol}/${market.quoteTokenSymbol}\n`;
      message += `🏦 Market ID: <code>${market.marketId}</code>\n\n`;
    });

    // Store program ID in Redis for pagination
    const redis = RedisService.getInstance();
    await redis.set(`markets_program:${chatId}`, programId, REDIS_TTL);

    // Create pagination buttons with shorter callback data
    const paginationButtons = createPaginationButtons(
      page,
      page + (markets.length === 10 ? 1 : 0),
      '/sub-m_' // Short form for markets pagination
    );

    // Send final result
    const finalMessage = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          paginationButtons,
          [{ text: '🔙 Back', callback_data: '/prices' }],
        ],
      },
    };

    if (messageId) {
      console.log("here 2")
      await updateMessage(TELEGRAM_BASE_URL, {
        ...finalMessage,
        message_id: messageId,
      });
    } else {
      console.log("here 3")
      
      await sendMessage(TELEGRAM_BASE_URL, finalMessage);
    }
  } catch (error) {
    console.error('Error in fetchMarkets:', error);
    const errorMessage = {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch market details. Please try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back', callback_data: '/prices' }],
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
 * Handle markets pagination
 */
export async function handleMarketsPagination(
  chatId: number,
  programId: string,
  page: number,
  messageId: number,
) {
  await fetchMarkets(chatId, programId, page, messageId);
}
