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
        ],
        [
          { text: 'Wallet PnL', callback_data: '/walletPnl' },
        ],
        [
          { text: 'Known Accounts', callback_data: '/knownaccounts' },
        ],
      ],
    },
  };
  await sendMessage(TELEGRAM_BASE_URL, payload);
}
