import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

// Constants
const ACTIVEUSERS_SETTINGS_KEY = 'activeusers_settings';
const REDIS_TTL = 60;

/**
 * Initialize Active Users Data flow
 */
export async function initializeActiveUsersFlow(
  chatId: number,
  messageId: number,
) {
  const redis = RedisService.getInstance();
  const settings = JSON.parse(
    (await redis.get(`${ACTIVEUSERS_SETTINGS_KEY}:${chatId}`)) || '{}',
  );
  const selectedRange = settings.range || '1d';
  const selectedType = settings.type || 'day';

  // Create buttons with the selected type having a checkmark
  const typeButtons = [
    {
      text: `${selectedType === 'day' ? '✅ ' : ''}Day`,
      callback_data: '/sub-programs_activeusers_type_day',
    },
    {
      text: `${selectedType === 'hour' ? '✅ ' : ''}Hour`,
      callback_data: '/sub-programs_activeusers_type_hour',
    },
  ];

  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: `<b>👥 Active Users Data</b>\n\nSelect a time type and range to fetch active users data.\n\n<b>Current settings:</b>\n⏱️ <b>Type:</b> ${selectedType}\n📊 <b>Range:</b> ${selectedRange}`,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        typeButtons,
        [
          {
            text: '⚙️ Change Range',
            callback_data: '/sub-programs_activeusers_range',
          },
        ],
        [
          {
            text: '🔄 Fetch Data',
            callback_data: '/sub-programs_activeusers_fetch',
          },
        ],
        [{ text: '🔙 Back', callback_data: '/programs' }],
      ],
    },
  });
}

/**
 * Update active users type (day or hour)
 */
export async function updateActiveUsersType(
  chatId: number,
  messageId: number,
  type: string,
) {
  const redis = RedisService.getInstance();
  const key = `${ACTIVEUSERS_SETTINGS_KEY}:${chatId}`;
  const currentSettings = JSON.parse((await redis.get(key)) || '{}');

  // Update the type and reset range to default based on type
  const defaultRange = type === 'day' ? '1d' : '1h';
  await redis.set(
    key,
    JSON.stringify({
      ...currentSettings,
      type,
      range: defaultRange,
    }),
  );

  // Reinitialize the flow to show updated settings
  await initializeActiveUsersFlow(chatId, messageId);
}

/**
 * Prompt user to enter a custom range
 */
export async function promptActiveUsersRange(chatId: number) {
  const redis = RedisService.getInstance();
  const settings = JSON.parse(
    (await redis.get(`${ACTIVEUSERS_SETTINGS_KEY}:${chatId}`)) || '{}',
  );
  const type = settings.type || 'day';

  await redis.set(
    `activeusers_state:${chatId}`,
    'waiting_for_range',
    REDIS_TTL,
  );

  const rangeText =
    type === 'day'
      ? 'Please enter a number between 1-30 for days (e.g., 5 for 5 days)'
      : 'Please enter a number between 1-24 for hours (e.g., 12 for 12 hours)';

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: `<b>⚙️ Set Range</b>\n\n${rangeText}`,
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_activeusers' }],
      ],
    },
  });
}

/**
 * Validate and update active users range
 */
export async function updateActiveUsersRange(chatId: number, range: string) {
  try {
    const redis = RedisService.getInstance();
    const settings = JSON.parse(
      (await redis.get(`${ACTIVEUSERS_SETTINGS_KEY}:${chatId}`)) || '{}',
    );
    const type = settings.type || 'day';

    // Clear the state
    await redis.del(`activeusers_state:${chatId}`);

    // Validate the range
    const rangeNumber = parseInt(range);

    if (isNaN(rangeNumber)) {
      throw new Error('Invalid number');
    }

    // Validate based on type
    if (type === 'day' && (rangeNumber < 1 || rangeNumber > 30)) {
      throw new Error('Day range must be between 1-30');
    } else if (type === 'hour' && (rangeNumber < 1 || rangeNumber > 24)) {
      throw new Error('Hour range must be between 1-24');
    }

    // Format the range with the appropriate suffix
    const formattedRange = `${rangeNumber}${type === 'day' ? 'd' : 'h'}`;

    // Save the range
    await redis.set(
      `${ACTIVEUSERS_SETTINGS_KEY}:${chatId}`,
      JSON.stringify({
        ...settings,
        range: formattedRange,
      }),
    );

    // Send confirmation
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>✅ Range Updated</b>\n\nThe range has been set to <b>${formattedRange}</b>`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔙 Back to Settings',
              callback_data: '/sub-programs_activeusers',
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Error in updateActiveUsersRange:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>❌ Error</b>\n\n${errorMessage}. Please try again.`,
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: '/sub-programs_activeusers_range',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/sub-programs_activeusers' }],
        ],
      },
    });
  }
}

/**
 * Prompt user to enter program ID for active users data
 */
export async function promptProgramIdForActiveUsers(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(
    `activeusers_state:${chatId}`,
    'waiting_for_program_id',
    REDIS_TTL,
  );

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Program ID</b>\n\nPlease enter the <b>programId</b> to fetch active users data for:\n\n<i>Example: Enter the unique identifier for the program</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_activeusers' }],
      ],
    },
  });
}

/**
 * Fetch and display active users data
 */
export async function fetchActiveUsersData(chatId: number, programId: string) {
  try {
    const redis = RedisService.getInstance();
    const settings = JSON.parse(
      (await redis.get(`${ACTIVEUSERS_SETTINGS_KEY}:${chatId}`)) || '{}',
    );
    const range = settings.range || '1d';

    // Send loading message
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>⏳ Processing</b>\n\nFetching active users data for program ID: <code>${programId}</code>\nRange: ${range}\n\nPlease wait...`,
      parse_mode: 'HTML' as 'HTML',
    });

    // Fetch active users data
    const response = await makeVybeRequest(
      `program/${programId}/active-users-ts?range=${range}`,
    );

    if (!response || !response.data || response.data.length === 0) {
      throw new Error('No active users data found');
    }

    // Prepare text content for file
    const txtContent = response.data
      .map(
        (entry: any) =>
          `Time: ${new Date(entry.blockTime * 1000).toLocaleString()}\n` +
          `Program ID: ${entry.programId}\n` +
          `Daily Active Users: ${entry.dau}\n` +
          `-------------------`,
      )
      .join('\n\n');

    // Create and send file
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append(
      'document',
      new Blob([txtContent], { type: 'text/plain' }),
      'active_users_data.txt',
    );
    formData.append(
      'caption',
      `👥 Active Users Data (${range}) for Program ID: ${programId}`,
    );

    await fetch(`${TELEGRAM_BASE_URL}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    // Send follow-up message with back button
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>📄 Active Users Data</b>\n\nYour active users data file has been sent.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Fetch Again',
              callback_data: '/sub-programs_activeusers_fetch',
            },
          ],
          [
            {
              text: '⚙️ Change Settings',
              callback_data: '/sub-programs_activeusers',
            },
          ],
          [{ text: '🔙 Programs Menu', callback_data: '/programs' }],
        ],
      },
    });
  } catch (error) {
    console.error('Error in fetchActiveUsersData:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch active users data. Please verify the program ID and try again.',
      parse_mode: 'HTML' as 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: '/sub-programs_activeusers_fetch',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/sub-programs_activeusers' }],
        ],
      },
    });
  }
}
