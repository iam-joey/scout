import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { RedisService } from '../../../services/redisService';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import { formatLargeNumber, createPaginationButtons } from '../utils/formatters';

const REDIS_TTL = 60;

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
 * Fetch and display top token holders with pagination
 */
export async function fetchTopTokenHolders(
  chatId: number,
  mintAddress: string,
  page: number = 0,
) {
  try {
    // Show initial loading state
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Top Token Holders</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬜⬜⬜⬜</code> 20%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Update to 40%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Top Token Holders</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬜⬜⬜</code> 40%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Fetch token holders
    const response = await makeVybeRequest(`token/${mintAddress}/holders?page=${page}`);

    if (!response || !response.holders) {
      throw new Error('No token holders data found');
    }

    // Update to 60%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Top Token Holders</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬜⬜</code> 60%`,
      parse_mode: 'HTML' as 'HTML',
    });

    const { holders, totalHolders, decimals } = response;

    // Update to 80%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Top Token Holders</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬛⬜</code> 80%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Format holders data
    let message = `<b>👥 Top Token Holders</b>\n\n`;
    message += `<b>📊 Total Holders:</b> ${formatLargeNumber(totalHolders)}\n\n`;

    holders.forEach((holder: any, index: number) => {
      const position = page * 10 + index + 1;
      const amount = holder.amount / Math.pow(10, decimals);
      message += `<b>${position}. </b><code>${holder.owner}</code>\n`;
      message += `   💰 Amount: ${formatLargeNumber(amount)}\n`;
      message += `   📊 Share: ${(holder.share * 100).toFixed(2)}%\n\n`;
    });

    // Create pagination buttons
    const paginationButtons = createPaginationButtons(
      page,
      Math.ceil(totalHolders / 10) - 1,
      '/sub-tokens_holders_page_',
    );

    // Update to 100%
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔄 Fetching Top Token Holders</b>\n\n<i>Loading data</i> ⏳\n\n<code>⬛⬛⬛⬛⬛</code> 100%`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Store mint address for pagination
    const redis = RedisService.getInstance();
    await redis.set(
      `token_holders_mint:${chatId}`,
      mintAddress,
      REDIS_TTL * 5,
    );

    // Send final result
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          paginationButtons,
          [
            {
              text: '🔄 New Search',
              callback_data: '/sub-tokens_holders_fetch',
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
      throw new Error('No mint address found for pagination');
    }

    await fetchTopTokenHolders(chatId, mintAddress, page);
  } catch (error) {
    console.error('Error in handleTokenHoldersPagination:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
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
          [{ text: '🔙 Back', callback_data: '/tokens' }],
        ],
      },
    });
  }
}
