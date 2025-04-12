import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { updateMessage } from '../../../utils/helpers';

export async function balances(chatId: number, messageId: number) {
  try {
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: '📊 View your wallet balances:',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🖼️ NFT Balances', callback_data: '/sub-nftBalances' },
          ],
          [            { text: '💰 Token Balances', callback_data: '/sub-tokenBalances' },
          ],
          [{
            text: '🔙  Main Menu',
            callback_data: '/main',
          }]
        ],
      },
    });
  } catch (error) {
    console.error('Error in balances:', error);
    throw error;
  }
}
