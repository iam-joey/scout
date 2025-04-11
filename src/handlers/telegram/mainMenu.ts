import { TELEGRAM_BASE_URL } from '../../utils/constant';
import { sendMessage } from '../../utils/helpers';

export async function sendMainMenu(chatId: number) {
  const payload = {
    chat_id: chatId,
    text: '🔓 Welcome to VybeSniper',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Balances', callback_data: '/balances' },
          { text: 'KYC Status', callback_data: '/kycs' },
        ],
      ],
    },
  };
  await sendMessage(TELEGRAM_BASE_URL, payload);
}
