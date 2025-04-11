import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { updateMessage } from '../../../utils/helpers';

export async function balances(chatId: number, messageId: number) {
  try {
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: 'here You can View balances of all your Nfts and Tokens',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'NFT', callback_data: '/sub-nftBalances' },
            { text: 'TOKEN', callback_data: '/sub-tokenBalances' },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Error in balances:', error);
    throw error;
  }
}
