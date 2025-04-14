import { TELEGRAM_BASE_URL } from '../../utils/constant';
import { sendMessage, updateMessage } from '../../utils/helpers';

/**
 * Display the main menu with welcome message and buttons
 */
export async function displayMainMenu(
  chatId: number,
  messageId?: number,
  baseUrl: string = TELEGRAM_BASE_URL,
): Promise<void> {
  const welcomeMessage = `
  ✨ Welcome to VybeSniper Bot!
  
  🔍 Your all-in-one tool for checking Solana wallet balances and analytics.
  
  `;
  const payload = {
    chat_id: chatId,
    text: welcomeMessage,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Wallet Balances', callback_data: '/balances' },
          { text: '📈 PnL Overview', callback_data: '/walletPnl' },
        ],
        [
          { text: '🔖 Labeled Accounts', callback_data: '/knownaccounts' },
          { text: '🎨 NFT Owners', callback_data: '/nftowners' },
        ],
        [
          { text: '📁 Programs Data', callback_data: '/programs' },
          { text: '💸 Tokens', callback_data: '/tokens' },
        ],
        [
          { text: '💹 Prices', callback_data: '/prices' },
        ],
      ],
    },
  };

  if (messageId) {
    await updateMessage(baseUrl, {
      ...payload,
      message_id: messageId,
    });
  } else {
    await sendMessage(baseUrl, payload);
  }
}
