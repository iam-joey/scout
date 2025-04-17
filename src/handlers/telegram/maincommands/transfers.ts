import { RedisService } from '../../../services/redisService';
import type { TransferFilters, UserTransfer, TransferEntry } from '../../../services/redisService';
import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { isValidSolanaAddress, sendErrorMessage, sendMessage, updateMessage } from '../../../utils/helpers';

// Show main alerts menu
export async function showAlertsMainMenu(chatId: number, messageId?: number): Promise<void> {
  const keyboard = [
    [{ text: '💸 Transfer Alerts', callback_data: '/alerts_transfers' }],
    // Add more alert types here in the future
    [{ text: '🔙 Back', callback_data: '/main' }],
  ];

  const text = '🔔 <b>Alerts Menu</b>\n\nSelect the type of alert you want to manage:';

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

// Show the alerts menu with current alerts or prompt to add new
export async function showAlertsMenu(chatId: number, messageId?: number): Promise<void> {
  const redis = RedisService.getInstance();
  const transfersRaw = await redis.get('transfers') || '{}';
  const transfersData = JSON.parse(transfersRaw);

  // Find alerts for this user
  const userAlerts: { address: string; filters: TransferFilters }[] = [];
  Object.entries(transfersData as TransferEntry).forEach(([address, users]) => {
    const userArray = users as UserTransfer[];
    const userAlert = userArray.find((u: UserTransfer) => u.userId === chatId);
    if (userAlert) {
      userAlerts.push({ address, filters: userAlert.filters });
    }
  });

  // Build message and keyboard
  let text = '📬 <b>Transfer Alerts</b>\n\n';
  const keyboard: { text: string; callback_data: string }[][] = [];

  if (userAlerts.length === 0) {
    text += 'You have no alerts set up. Add your first alert!';
    keyboard.push([{ text: '➕ Add New Alert', callback_data: '/sub-ta_add' }]);
  } else {
    text += `You have ${userAlerts.length} alert${userAlerts.length > 1 ? 's' : ''}:\n\n`;
    userAlerts.forEach((alert, i) => {
      text += formatAlertSummary(alert.address, alert.filters, i + 1);
      keyboard.push([{ text: `🛠️ Edit Alert ${i + 1}`, callback_data: `/sub-ta_e${i + 1}` }]);
    });

    if (userAlerts.length < 3) {
      keyboard.push([{ text: '➕ Add New Alert', callback_data: '/sub-ta_add' }]);
    }
  }

  keyboard.push([{ text: '🔙 Main Menu', callback_data: '/main' }]);

  const message = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  };

  if (messageId) {
    await updateMessage(TELEGRAM_BASE_URL, { ...message, message_id: messageId });
  } else {
    await sendMessage(TELEGRAM_BASE_URL, message);
  }
}

// Format a single alert summary
function formatAlertSummary(address: string, filters: TransferFilters, num: number): string {
  const shortAddr = `${address.slice(0, 4)}...${address.slice(-4)}`;
  let summary = `${num}. ${shortAddr}\n`;
  summary += `   ${filters.send ? '✅' : '❌'} Send | ${filters.receive ? '✅' : '❌'} Receive\n`;
  summary += `   🧬 Mint: ${filters.mintAddress ? filters.mintAddress.slice(0, 4) + '...' : 'not set'}\n`;
  summary += `   💰 Amount: ${filters.amount ? `${filters.greater ? '>' : '≤'} ${filters.amount}` : 'not set'}\n`;
  summary += `   ${filters.active ? '🟢' : '🔴'} ${filters.active ? 'Active' : 'Inactive'}\n\n`;
  return summary;
}

// Prompt for new alert address
export async function promptNewAlertAddress(chatId: number, messageId: number): Promise<void> {
  const redis = RedisService.getInstance();
  await redis.set(`userState-${chatId}`, 'transfer_address', 60);

  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: '🔍 <b>Add New Alert</b>\n\nPlease enter the wallet address you want to track:',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back', callback_data: '/alerts' }]],
    },
  });
}

// Show alert settings menu
export async function renderAlertSettingsMenu(chatId: number, messageId: number, whaleAddress: string): Promise<void> {
  const redis = RedisService.getInstance();
  const transfersRaw = await redis.get('transfers') || '{}';
  const transfersData = JSON.parse(transfersRaw);
  
  const users = (transfersData[whaleAddress] || []) as UserTransfer[];
  const userAlert = users.find((u: UserTransfer) => u.userId === chatId);
  
  if (!userAlert) {
    await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Alert not found');
    return;
  }

  const { filters } = userAlert;
  const shortAddr = `${whaleAddress.slice(0, 4)}...${whaleAddress.slice(-4)}`;

  let text = `⚙️ <b>Alert Settings</b> - ${shortAddr}\n\n`;
  text += `Send: ${filters.send ? '✅' : '❌'}\n`;
  text += `Receive: ${filters.receive ? '✅' : '❌'}\n`;
  text += `Mint: ${filters.mintAddress ? filters.mintAddress : 'not set'}\n`;
  text += `Amount: ${filters.amount ? `${filters.greater ? '>' : '≤'} ${filters.amount}` : 'not set'}\n`;
  text += `Status: ${filters.active ? '🟢 Active' : '🔴 Inactive'}`;

  const keyboard = [
    [
      { text: `${filters.send ? '✅' : '❌'} Send`, callback_data: '/sub-ta_tsnd' },
      { text: `${filters.receive ? '✅' : '❌'} Receive`, callback_data: '/sub-ta_trcv' },
    ],
    [
      { text: '🧬 Set Mint', callback_data: '/sub-ta_smin' },
      { text: '💰 Set Amount', callback_data: '/sub-ta_amt' },
    ],
    [
      { text: filters.active ? '🔴 Deactivate' : '🟢 Activate', callback_data: '/sub-ta_tact' },
      { text: '🗑️ Delete', callback_data: '/sub-ta_del' },
    ],
    [{ text: '🔙 Back to Alerts', callback_data: '/alerts_transfers' }],
  ];
console.log('Updating message with settings');
console.log("the data is ",chatId,messageId,text)
  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

// Handle new alert creation
export async function handleNewAlert(chatId: number, address: string): Promise<void> {
  if (!isValidSolanaAddress(address)) {
    await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Invalid Solana address. Please try again.');
    return;
  }

  const redis = RedisService.getInstance();
  const transfersRaw = await redis.get('transfers') || '{}';
  const transfersData = JSON.parse(transfersRaw);

  // Check if user already has 3 alerts
  let userAlertCount = 0;
  Object.values(transfersData).forEach((users) => {
    const userArray = users as UserTransfer[];
    if (userArray.some((u: UserTransfer) => u.userId === chatId)) userAlertCount++;
  });

  if (userAlertCount >= 3) {
    await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'You can only have up to 3 alerts.');
    return;
  }

  // Create new alert with default settings
  await redis.saveAlertTransfer(chatId, address, {
    send: true,
    receive: true,
    active: true,
  });

  // Store the address being edited
  await redis.set(`editing_alert_${chatId}`, address, 60);
  console.log('Alert created successfully');
  try {
    // Send confirmation and show settings
    const response = await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '✅ <b>Alert Created</b>\n\nNow customize your alert settings:',
      parse_mode: 'HTML' as 'HTML',
    });
    await renderAlertSettingsMenu(chatId, response.result.message_id, address);

  } catch (error) {
    console.error('Error in handleNewAlert:', error);
    await sendErrorMessage(TELEGRAM_BASE_URL, chatId, 'Error showing alert settings. Please try /alerts to view your alerts.');
  }
}

// Format alerts summary for /myalerts command
export async function formatAlertsSummaryHtml(chatId: number): Promise<{
  text: string;
  reply_markup: any;
}> {
  const redis = RedisService.getInstance();
  const transfersRaw = await redis.get('transfers') || '{}';
  const transfersData = JSON.parse(transfersRaw);

  let text = '📬 <b>Your Transfer Alerts</b>\n\n';
  const keyboard: { text: string; callback_data: string }[][] = [];

  const userAlerts: { address: string; filters: any }[] = [];
  Object.entries(transfersData as TransferEntry).forEach(([address, users]) => {
    const userArray = users as UserTransfer[];
    const userAlert = userArray.find((u: UserTransfer) => u.userId === chatId);
    if (userAlert) {
      userAlerts.push({ address, filters: userAlert.filters });
    }
  });

  if (userAlerts.length === 0) {
    text += 'You have no alerts set up.';
    keyboard.push([{ text: '➕ Add New Alert', callback_data: '/sub-ta_add' }]);
  } else {
    userAlerts.forEach((alert, i) => {
      text += formatAlertSummary(alert.address, alert.filters, i + 1);
      keyboard.push([{ text: `🛠️ Edit Alert ${i + 1}`, callback_data: `/sub-ta_e${i + 1}` }]);
    });
  }

  keyboard.push([{ text: '🔙 Main Menu', callback_data: '/main' }]);

  return {
    text,
    reply_markup: { inline_keyboard: keyboard },
  };
}
