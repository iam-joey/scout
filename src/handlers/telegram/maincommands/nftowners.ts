import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { makeVybeRequest, sendMessage } from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

const REDIS_TTL = 60;

/**
 * Start NFT owners search flow
 */
export async function startNftOwnersSearch(chatId: number, messageId: number) {
  const redis = RedisService.getInstance();

  await redis.del(`nft_owners_search:${chatId}`);
  await redis.set(
    `nft_owners_search:${chatId}`,
    'waiting_for_address',
    REDIS_TTL,
  );

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: 'Please enter the NFT collection address:',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/main' }]],
    },
  });
}

/**
 * Handle NFT owners search with address
 */
export async function searchNftOwners(chatId: number, address: string) {
  try {
    // Send loading message
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `Fetching NFT owners for ${address}... Please wait.`,
    });

    // Make API request
    const endpoint = `nft/collection-owners/${address}`;
    const response = await makeVybeRequest(endpoint);

    if (!response || !response.data || response.data.length === 0) {
      await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: 'No owners found for this NFT collection.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Try Another', callback_data: '/nftowners' }],
            [{ text: '🔙 Main Menu', callback_data: '/main' }],
          ],
        },
      });
      return;
    }

    // Format the data
    const formattedData = response.data
      .map(
        (item: any, index: number) =>
          `Owner ${index + 1}:\n` +
          `Address: ${item.owner}\n` +
          `Nft's Held: ${item.amount}\n` +
          `-------------------`,
      )
      .join('\n\n');

    // Create and send file
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append(
      'document',
      new Blob([formattedData], { type: 'text/plain' }),
      'nft_owners.txt',
    );
    formData.append('caption', `NFT Collection Owners - ${address}`);

    await fetch(`${TELEGRAM_BASE_URL}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    // Send navigation buttons
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: 'What would you like to do next?',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔍 Search Another Collection',
              callback_data: '/nftowners',
            },
          ],
          [{ text: '🔙 Main Menu', callback_data: '/main' }],
        ],
      },
    });
  } catch (error) {
    console.error('Error in searchNftOwners:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: 'Error fetching NFT owners. Please try again.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Try Again', callback_data: '/nftowners' }],
          [{ text: '🔙 Main Menu', callback_data: '/main' }],
        ],
      },
    });
  }
}
