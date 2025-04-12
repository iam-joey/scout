import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { makeVybeRequest, sendMessage, updateMessage } from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

// Constants
const FINDACTIVEUSERS_SETTINGS_KEY = 'findactiveusers_settings';
const REDIS_TTL = 60;

/**
 * Initialize Find Program Active Users flow
 */
export async function initializeFindActiveUsersFlow(chatId: number, messageId: number) {
  const redis = RedisService.getInstance();
  const settings = JSON.parse(await redis.get(`${FINDACTIVEUSERS_SETTINGS_KEY}:${chatId}`) || '{}');
  const limit = settings.limit || 500;
  const days = settings.days || 1;

  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: `<b>🔎 Find Program Active Users</b>\n\nGet a list of active users for a specific Solana program.\n\n<b>Current settings:</b>\n🔢 <b>Limit:</b> ${limit}\n📅 <b>Days:</b> ${days}`,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔢 Set Limit', callback_data: '/sub-programs_findactiveusers_limit' }],
        [{ text: '📅 Set Days', callback_data: '/sub-programs_findactiveusers_days' }],
        [{ text: '🔄 Fetch Data', callback_data: '/sub-programs_findactiveusers_fetch' }],
        [{ text: '🔙 Back', callback_data: '/programs' }]
      ]
    }
  });
}

/**
 * Prompt user to enter a custom limit
 */
export async function promptFindActiveUsersLimit(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`findactiveusers_state:${chatId}`, 'waiting_for_limit', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔢 Set Limit</b>\n\nPlease enter the maximum number of active users to fetch (default: 500):',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_findactiveusers' }]
      ]
    }
  });
}

/**
 * Prompt user to enter a custom days value
 */
export async function promptFindActiveUsersDays(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`findactiveusers_state:${chatId}`, 'waiting_for_days', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>📅 Set Days</b>\n\nPlease enter the number of days to look back (1-30):',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_findactiveusers' }]
      ]
    }
  });
}

/**
 * Validate and update limit setting
 */
export async function updateFindActiveUsersLimit(chatId: number, limitInput: string) {
  try {
    const redis = RedisService.getInstance();
    
    // Clear the state
    await redis.del(`findactiveusers_state:${chatId}`);
    
    // Validate the limit
    const limit = parseInt(limitInput);
    
    if (isNaN(limit) || limit <= 0) {
      throw new Error('Limit must be a positive number');
    }
    
    // Save the limit
    const key = `${FINDACTIVEUSERS_SETTINGS_KEY}:${chatId}`;
    const currentSettings = JSON.parse(await redis.get(key) || '{}');
    await redis.set(key, JSON.stringify({
      ...currentSettings,
      limit
    }));
    
    // Send confirmation
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>✅ Limit Updated</b>\n\nThe limit has been set to <b>${limit}</b>`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Settings', callback_data: '/sub-programs_findactiveusers' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in updateFindActiveUsersLimit:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>❌ Error</b>\n\n${errorMessage}. Please try again.`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-programs_findactiveusers_limit' }],
          [{ text: '🔙 Back', callback_data: '/sub-programs_findactiveusers' }]
        ]
      }
    });
  }
}

/**
 * Validate and update days setting
 */
export async function updateFindActiveUsersDays(chatId: number, daysInput: string) {
  try {
    const redis = RedisService.getInstance();
    
    // Clear the state
    await redis.del(`findactiveusers_state:${chatId}`);
    
    // Validate the days
    const days = parseInt(daysInput);
    
    if (isNaN(days)) {
      throw new Error('Days must be a number');
    }
    
    if (days < 1 || days > 30) {
      throw new Error('Days must be between 1 and 30');
    }
    
    // Save the days
    const key = `${FINDACTIVEUSERS_SETTINGS_KEY}:${chatId}`;
    const currentSettings = JSON.parse(await redis.get(key) || '{}');
    await redis.set(key, JSON.stringify({
      ...currentSettings,
      days
    }));
    
    // Send confirmation
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>✅ Days Updated</b>\n\nThe days value has been set to <b>${days}</b>`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Settings', callback_data: '/sub-programs_findactiveusers' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in updateFindActiveUsersDays:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>❌ Error</b>\n\n${errorMessage}. Please try again.`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-programs_findactiveusers_days' }],
          [{ text: '🔙 Back', callback_data: '/sub-programs_findactiveusers' }]
        ]
      }
    });
  }
}

/**
 * Prompt user to enter program ID for finding active users
 */
export async function promptProgramIdForFindActiveUsers(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`findactiveusers_state:${chatId}`, 'waiting_for_program_id', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Program ID</b>\n\nPlease enter the <b>programId</b> to find active users for:\n\n<i>Example: Enter the unique identifier for the program</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_findactiveusers' }]
      ]
    }
  });
}

/**
 * Fetch and display program active users data
 */
export async function fetchFindActiveUsersData(chatId: number, programId: string) {
  try {
    const redis = RedisService.getInstance();
    const settings = JSON.parse(await redis.get(`${FINDACTIVEUSERS_SETTINGS_KEY}:${chatId}`) || '{}');
    const limit = settings.limit || 500;
    const days = settings.days || 1;
    
    // Send loading message
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>⏳ Processing</b>\n\nFinding active users for program ID: <code>${programId}</code>\nDays: ${days}\nLimit: ${limit}\n\nPlease wait...`,
      parse_mode: 'HTML' as 'HTML'
    });
    
    // Fetch program active users data
    const response = await makeVybeRequest(`program/${programId}/active-users?days=${days}&limit=${limit}`);
    
    if (!response || !response.data || response.data.length === 0) {
      throw new Error('No active users found for this program');
    }
    
    // Prepare text content for file
    const txtContent = `Program ID: ${programId}\nDays: ${days}\nLimit: ${limit}\nTotal Active Users Found: ${response.data.length}\n\n` +
      response.data.map((entry: any, index: number) => 
        `User #${index + 1}\n` +
        `Wallet: ${entry.wallet}\n` +
        `Transactions: ${entry.transactions}\n` +
        `Instructions: ${entry.instructions}\n` +
        `-------------------`
      ).join('\n\n');
    
    // Create and send file
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append('document', new Blob([txtContent], { type: 'text/plain' }), 'program_active_users.txt');
    formData.append('caption', `🔎 Active Users (${days} days) for Program ID: ${programId}`);

    await fetch(`${TELEGRAM_BASE_URL}/sendDocument`, {
      method: 'POST',
      body: formData,
    });
    
    // Send follow-up message with back button
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>📄 Program Active Users</b>\n\nYour active users data file has been sent.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Fetch Again', callback_data: '/sub-programs_findactiveusers_fetch' }],
          [{ text: '⚙️ Change Settings', callback_data: '/sub-programs_findactiveusers' }],
          [{ text: '🔙 Programs Menu', callback_data: '/programs' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in fetchFindActiveUsersData:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to find active users. Please verify the program ID and try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-programs_findactiveusers_fetch' }],
          [{ text: '🔙 Back', callback_data: '/sub-programs_findactiveusers' }]
        ]
      }
    });
  }
}
