import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { makeVybeRequest, sendMessage, updateMessage } from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

// Don't set TTL for program settings to make them persistent
const PROGRAM_SETTINGS_KEY = 'program_settings';
const REDIS_TTL = 60;

// Display programs menu
export async function displayProgramsMenu(chatId: number, messageId?: number) {
  const payload = {
    chat_id: chatId,
    text: 'Programs Data Menu',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Program Rankings', callback_data: '/sub-programs_ranking' }],
        [{ text: '🔙 Main Menu', callback_data: '/main' }]
      ]
    }
  };

  if (messageId) {
    await updateMessage(TELEGRAM_BASE_URL, { ...payload, message_id: messageId });
  } else {
    await sendMessage(TELEGRAM_BASE_URL, payload);
  }
}

// Initialize default program settings when user first starts
export async function initializeProgramDefaults(chatId: number) {
  const redis = RedisService.getInstance();
  const key = `${PROGRAM_SETTINGS_KEY}:${chatId}`;
  const existingSettings = await redis.get(key);

  if (!existingSettings) {
    const defaultSettings = {
      limit: 10,
      interval: '1d'
    };
    await redis.set(key, JSON.stringify(defaultSettings));
  }
}

// Initialize ranking flow
export async function initializeRankingFlow(chatId: number, messageId: number) {
  const redis = RedisService.getInstance();
  const settings = JSON.parse(await redis.get(`${PROGRAM_SETTINGS_KEY}:${chatId}`) || '{}');

  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: `Please select limit and interval to fetch the data.\n\nCurrent settings:\nLimit: ${settings.limit || 10}\nInterval: ${settings.interval || '1d'}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔢 Set Limit', callback_data: '/sub-programs_set_limit' }],
        [{ text: '⏱️ Set Interval', callback_data: '/sub-programs_set_interval' }],
        [{ text: '🔄 Fetch Rankings', callback_data: '/sub-programs_fetch' }],
        [{ text: '🔙 Back', callback_data: '/programs' }]
      ]
    }
  });
}

// Handle limit input
export async function handleSetLimit(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`program_ranking_state:${chatId}`, 'waiting_for_limit', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: 'Please enter the number of programs to fetch (1-50):',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_ranking' }]
      ]
    }
  });
}

// Show interval options
export async function showIntervalOptions(chatId: number, messageId: number) {
  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: 'Select the time interval:',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 Day', callback_data: '/sub-programs_interval_1d' },
          { text: '7 Days', callback_data: '/sub-programs_interval_7d' },
          { text: '30 Days', callback_data: '/sub-programs_interval_30d' }
        ],
        [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
      ]
    }
  });
}

// Update interval
export async function updateInterval(chatId: number, messageId: number, interval: string) {
  const redis = RedisService.getInstance();
  const key = `${PROGRAM_SETTINGS_KEY}:${chatId}`;
  const currentSettings = JSON.parse(await redis.get(key) || '{}');
  await redis.set(key, JSON.stringify({ ...currentSettings, interval }));
  await initializeRankingFlow(chatId, messageId);
}

// Validate and update limit
export async function updateLimit(chatId: number, limit: string) {
  const redis = RedisService.getInstance();
  const numLimit = parseInt(limit);
  
  if (isNaN(numLimit) || numLimit < 1) {
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '❌ Invalid input!\n\nPlease enter a number between 1 and 50.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
        ]
      }
    });
    return;
  }

  const key = `${PROGRAM_SETTINGS_KEY}:${chatId}`;
  const currentSettings = JSON.parse(await redis.get(key) || '{}');
  await redis.set(key, JSON.stringify({ ...currentSettings, limit: numLimit }));
  await redis.del(`program_ranking_state:${chatId}`);
  
  const message = `✅ Success!\n\nLimit has been set to: ${numLimit} programs\n\nReturning to rankings menu...`;

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: message,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
      ]
    }
  });
}

// Fetch and display rankings
export async function fetchRankings(chatId: number, messageId: number) {
  try {
    const redis = RedisService.getInstance();
    const settings = JSON.parse(await redis.get(`${PROGRAM_SETTINGS_KEY}:${chatId}`) || '{}');
    
    if (!settings.limit || !settings.interval) {
      await updateMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        message_id: messageId,
        text: 'Please set both limit and interval first.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
          ]
        }
      });
      return;
    }
    // Check the limit and decide the response method
    if (settings.limit > 10) {
      console.log('Large dataset fetching');
      // Acknowledge large dataset fetching
      await updateMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        message_id: messageId,
        text: 'Fetching large dataset, please wait...'
      });

      // Fetch data
      const response = await makeVybeRequest(`program/ranking?limit=${settings.limit}&interval=${settings.interval}`);
      if (!response || !response.data || response.data.length === 0) {
        throw new Error('No data found');
      }

      // Prepare text content
      const txtContent = response.data.map((program: any) => 
        `🏆 Rank: ${program.programRank}\n` +
        `📛 Name: ${program.programName || 'N/A'}\n` +
        `🆔 ID: ${program.programId}\n` +
        `🎯 Score: ${program.score}\n` +
        `-------------------`
      ).join('\n\n');

      // Create and send file
      const formData = new FormData();
      formData.append('chat_id', chatId.toString());
      formData.append('document', new Blob([txtContent], { type: 'text/plain' }), 'program_rankings.txt');
      formData.append('caption', `Program Rankings (${settings.interval}) - Top ${settings.limit}`);

      await fetch(`${TELEGRAM_BASE_URL}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: 'Program Rankings file has been sent.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
          ]
        }
      });
    } else {
      // Fetch data
      const response = await makeVybeRequest(`program/ranking?limit=${settings.limit}&interval=${settings.interval}`);
      if (!response || !response.data || response.data.length === 0) {
        throw new Error('No data found');
      }

      // Prepare formatted message
      const formattedRankings = response.data.map((program: any) => 
        `🏆 Rank: ${program.programRank}\n` +
        `📛 Name: ${program.programName || 'N/A'}\n` +
        `🆔 ID: ${program.programId}\n` +
        `🎯 Score: ${program.score}\n` +
        `-------------------`
      ).join('\n\n');

      const message = `Program Rankings (${settings.interval})\nTop ${settings.limit} Programs:\n\n${formattedRankings}`;

      await updateMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        message_id: messageId,
        text: message,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: '/sub-programs_fetch' }],
            [{ text: '⚙️ Change Settings', callback_data: '/sub-programs_ranking' }],
            [{ text: '🔙 Programs Menu', callback_data: '/programs' }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error in fetchRankings:', error);
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Error fetching program rankings. Please try again.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-programs_fetch' }],
          [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
        ]
      }
    });
  }
}
