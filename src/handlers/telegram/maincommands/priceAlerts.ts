import { RedisService } from '../../../services/redisService';
import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { sendErrorMessage, sendMessage, updateMessage } from '../../../utils/helpers';

// Show the price alerts menu with current alerts or prompt to add new
export async function showPriceAlertsMenu(chatId: number, messageId?: number): Promise<void> {
  const redis = RedisService.getInstance();
  const alerts = await redis.getOracleAlerts(chatId);

  let text: string;
  let keyboard: any[][];

  if (!alerts) {
    text = '🔔 <b>Token Price Alerts</b>\n\nYou don\'t have any token price alerts set.';
    keyboard = [
      [{ text: '➕ Add Price Alert', callback_data: '/sub-pa_add' }],
      [{ text: '🔙 Back to Alerts', callback_data: '/alerts' }],
    ];
  } else {
    text = '🔔 <b>Your Token Price Alerts</b>\n\n';
    keyboard = Object.entries(alerts).map(([priceFeedId, filter]) => [
      { 
        text: `${filter.active ? '🟢 ' : '🔴 '}${filter.name} — $${filter.price} 🛠`, 
        callback_data: `/sub-pa_edit_${priceFeedId}` 
      }
    ]);

    keyboard.push([{ text: '➕ Add New', callback_data: '/sub-pa_add' }]);
    keyboard.push([{ text: '🔙 Back to Alerts', callback_data: '/alerts' }]);
  }

  if (messageId) {
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  } else {
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}

// Start new price alert flow
export async function promptNewPriceAlert(chatId: number): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${chatId}`, 'price_feed_input', 60);

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: 'Please send the <b>priceFeedId</b> you want to monitor.',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Cancel', callback_data: '/alerts_prices' }]],
    },
  });
}

// Show price alert settings
export async function renderPriceAlertSettings(
  chatId: number,
  messageId: number,
  priceFeedId: string
): Promise<void> {
  const redis = RedisService.getInstance();
  const alerts = await redis.getOracleAlerts(chatId);
  
  if (!alerts || !alerts[priceFeedId]) {
    await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
    return;
  }

  const filter = alerts[priceFeedId];

  const statusEmoji = filter.active ? '🟢' : '🔴';
  const text = `⚙️ <b>Price Alert Settings</b> - ${filter.name}\n\n` +
               `Target Price: $${filter.price}\nStatus: ${statusEmoji}`;

  const keyboard = [
    [
      { text: '✏️ Update Name', callback_data: `/sub-pa_name_${priceFeedId}` },
      { text: '💰 Update Price', callback_data: `/sub-pa_price_${priceFeedId}` },
      { text: '🗑️ Delete', callback_data: `/sub-pa_del_${priceFeedId}` },
    ],
    [ { text: filter.active ? '🔴 Deactivate' : '🟢 Activate', callback_data: `/sub-pa_active_${priceFeedId}` } ],
    [ { text: '🔙 Back to Alerts', callback_data: '/alerts_prices' } ],
  ];

  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}
