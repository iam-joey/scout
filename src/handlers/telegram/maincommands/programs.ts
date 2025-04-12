import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import { makeVybeRequest, sendMessage, updateMessage } from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

// Don't set TTL for program settings to make them persistent
const PROGRAM_SETTINGS_KEY = 'program_settings';
const TVL_SETTINGS_KEY = 'tvl_settings';
const REDIS_TTL = 60;

// Display programs menu
export async function displayProgramsMenu(chatId: number, messageId?: number) {
  const payload = {
    chat_id: chatId,
    text: '📂 Program Insights - Choose an option below:',
  reply_markup: {
    inline_keyboard: [
      [{ text: '📊 View Program Rankings', callback_data: '/sub-programs_ranking' }],
      [{ text: '💰 Check Total Value Locked (TVL)', callback_data: '/sub-programs_tvl' }],
      [{ text: '🔙 Back to Main Menu', callback_data: '/main' }]
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
  
  // Initialize TVL settings if they don't exist
  const tvlKey = `${TVL_SETTINGS_KEY}:${chatId}`;
  const existingTvlSettings = await redis.get(tvlKey);
  
  if (!existingTvlSettings) {
    const defaultTvlSettings = {
      resolution: '1d'
    };
    await redis.set(tvlKey, JSON.stringify(defaultTvlSettings));
  }
}

// Initialize ranking flow
export async function initializeRankingFlow(chatId: number, messageId: number) {
  const redis = RedisService.getInstance();
  const settings = JSON.parse(await redis.get(`${PROGRAM_SETTINGS_KEY}:${chatId}`) || '{}');

  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: `<b>📊 Program Rankings Configuration</b>\n\nPlease select options to fetch the data.\n\n<b>Current settings:</b>\n🔢 <b>Limit:</b> ${settings.limit || 10}\n⏱️ <b>Interval:</b> ${settings.interval || '1d'}`,
    parse_mode: 'HTML' as 'HTML',
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
  
  const message = `<b>✅ Success!</b>\n\nLimit has been set to: <b>${numLimit} programs</b>\n\nReturning to rankings menu...`;

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
      ]
    }
  });
}

// Fetch and display rankings
/**
 * Initialize TVL flow
 */
export async function initializeTvlFlow(chatId: number, messageId: number) {
  const redis = RedisService.getInstance();
  const settings = JSON.parse(await redis.get(`${TVL_SETTINGS_KEY}:${chatId}`) || '{}');

  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: `Please select resolution and enter program ID to fetch TVL data.

Current settings:
Resolution: ${settings.resolution || '1d'}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '⏱️ Resolution', callback_data: '/sub-programs_tvl_resolution' }],
        [{ text: '🔄 Fetch', callback_data: '/sub-programs_tvl_fetch' }],
        [{ text: '🔙 Back', callback_data: '/programs' }]
      ]
    }
  });
}

/**
 * Prompt user to enter TVL resolution
 */
export async function promptTvlResolution(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`tvl_state:${chatId}`, 'waiting_for_resolution', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>⏱️ Set Resolution</b>\n\nPlease enter a number between <b>1</b> and <b>30</b> for the resolution in days:\n\n<i>Example: Enter 7 for a 7-day resolution</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_tvl' }]
      ]
    }
  });
}

/**
 * Update TVL resolution
 */
export async function updateTvlResolution(chatId: number, resolution: string) {
  const redis = RedisService.getInstance();
  const numResolution = parseInt(resolution);
  
  if (isNaN(numResolution) || numResolution < 1 || numResolution > 30) {
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '❌ Invalid input!\n\nPlease enter a number between 1 and 30.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-programs_tvl_resolution' }],
          [{ text: '🔙 Back', callback_data: '/sub-programs_tvl' }]
        ]
      }
    });
    return;
  }
  
  const key = `${TVL_SETTINGS_KEY}:${chatId}`;
  const currentSettings = JSON.parse(await redis.get(key) || '{}');
  await redis.set(key, JSON.stringify({ ...currentSettings, resolution: `${numResolution}d` }));
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: `<b>✅ Resolution Updated</b>\n\nResolution has been set to <b>${numResolution}d</b>.`,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Back to TVL', callback_data: '/sub-programs_tvl' }]
      ]
    }
  });
}

/**
 * Prompt user to enter program ID for TVL fetch
 */
export async function promptProgramIdForTvl(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(`tvl_state:${chatId}`, 'waiting_for_program_id', REDIS_TTL);
  
  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Program ID</b>\n\nPlease enter the <b>programId</b> to fetch TVL data for:\n\n<i>Example: Enter the unique identifier for the program</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_tvl' }]
      ]
    }
  });
}

/**
 * Fetch and display TVL data
 */
export async function fetchTvlData(chatId: number, programId: string) {
  try {
    const redis = RedisService.getInstance();
    const settings = JSON.parse(await redis.get(`${TVL_SETTINGS_KEY}:${chatId}`) || '{}');
    // Make sure resolution has 'd' suffix
    const resolution = settings.resolution || '1d';
    console.log("Resolution:", resolution);
    // Fetch TVL data
    const response = await makeVybeRequest(`program/${programId}/tvl?resolution=${resolution}`);
    
    if (!response || !response.data || response.data.length === 0) {
      throw new Error('No TVL data found');
    }
    
    // Format the TVL data
    const formattedTvl = response.data.map((entry: any) => 
      `<b>🕒 Time:</b> ${new Date(entry.time).toLocaleString()}\n` +
      `<b>💰 TVL:</b> ${entry.tvl}`
    ).join('\n\n━━━━━━━━━━━━━━━━━━\n\n');
    
    const message = `<b>📊 TVL Data</b>\n\n<b>🆔 Program ID:</b> <code>${programId}</code>\n<b>⏱️ Resolution:</b> ${resolution}\n\n━━━━━━━━━━━━━━━━━━\n\n${formattedTvl}`;
    
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Fetch Again', callback_data: '/sub-programs_tvl_fetch' }],
          [{ text: '⚙️ Change Settings', callback_data: '/sub-programs_tvl' }],
          [{ text: '🔙 Programs Menu', callback_data: '/programs' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in fetchTvlData:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch TVL data. Please verify the program ID and try again.',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-programs_tvl_fetch' }],
          [{ text: '🔙 Back', callback_data: '/sub-programs_tvl' }]
        ]
      }
    });
  }
}

/**
 * Fetch and display rankings
 */
export async function fetchRankings(chatId: number, messageId: number) {
  try {
    const redis = RedisService.getInstance();
    const settings = JSON.parse(await redis.get(`${PROGRAM_SETTINGS_KEY}:${chatId}`) || '{}');
    
    if (!settings.limit || !settings.interval) {
      await updateMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        message_id: messageId,
        text: '<b>⚠️ Missing Settings</b>\n\nPlease set both limit and interval first before fetching rankings.',
        parse_mode: 'HTML',
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
        text: '<b>🕐 Processing</b>\n\nFetching large dataset, please wait...',
        parse_mode: 'HTML'
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
      formData.append('caption', `📊 Program Rankings (${settings.interval}) - Top ${settings.limit}`);

      await fetch(`${TELEGRAM_BASE_URL}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: `<b>📄 Program Rankings</b>\n\nYour file with the top ${settings.limit} programs has been sent.`,
        parse_mode: 'HTML' as 'HTML',
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
        parse_mode: 'HTML' as 'HTML',
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
      text: '<b>❌ Error</b>\n\nUnable to fetch program rankings. Please try again later.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Try Again', callback_data: '/sub-programs_fetch' }],
          [{ text: '🔙 Back', callback_data: '/sub-programs_ranking' }]
        ]
      }
    });
  }
}
