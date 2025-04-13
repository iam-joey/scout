import { TELEGRAM_BASE_URL } from '../../../utils/constant';
import {
  makeVybeRequest,
  sendMessage,
  updateMessage,
} from '../../../utils/helpers';
import { RedisService } from '../../../services/redisService';

// Constants
const REDIS_TTL = 60;

/**
 * Initialize Program Details flow
 */
export async function initializeProgramDetailsFlow(
  chatId: number,
  messageId: number,
) {
  await updateMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    message_id: messageId,
    text: '<b>🔍 Program Details</b>\n\nGet detailed information about a specific Solana program.',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔍 Enter Program ID',
            callback_data: '/sub-programs_details_fetch',
          },
        ],
        [{ text: '🔙 Back', callback_data: '/programs' }],
      ],
    },
  });
}

/**
 * Prompt user to enter program ID for program details
 */
export async function promptProgramIdForDetails(chatId: number) {
  const redis = RedisService.getInstance();
  await redis.set(
    `program_details_state:${chatId}`,
    'waiting_for_program_id',
    REDIS_TTL,
  );

  await sendMessage(TELEGRAM_BASE_URL, {
    chat_id: chatId,
    text: '<b>🔍 Enter Program ID</b>\n\nPlease enter the <b>Solana Program ID</b> to fetch details for:\n\n<i>Note: Program ID should be a valid Solana public key (base58, 32-44 characters)</i>',
    parse_mode: 'HTML' as 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Cancel', callback_data: '/sub-programs_details' }],
      ],
    },
  });
}

/**
 * Validate if a string is a valid Solana program ID
 */
function isValidSolanaProgramId(programId: string): boolean {
  // Base58 character set validation
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(programId);
}

/**
 * Fetch and display program details
 */
export async function fetchProgramDetails(chatId: number, programId: string) {
  try {
    // Validate program ID format
    if (!isValidSolanaProgramId(programId)) {
      await sendMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        text: '<b>❌ Invalid Program ID</b>\n\nThe provided program ID is not a valid Solana public key. Please ensure it is in base58 format and between 32-44 characters.',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔄 Try Again',
                callback_data: '/sub-programs_details_fetch',
              },
            ],
            [{ text: '🔙 Back', callback_data: '/sub-programs_details' }],
          ],
        },
      });
      return;
    }

    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>🔄 Fetching Program Details...</b>',
      parse_mode: 'HTML',
    });

    // Fetch program details
    const response = await makeVybeRequest(`program/${programId}`);
    console.log('response', response);
    if (!response) {
      throw new Error('No program data found');
    }

    const data = response;

    // Format the program details
    let formattedDetails =
      `<b>📛 Name:</b> ${data.friendlyName || 'N/A'}\n` +
      `<b>🧠 Entity:</b> ${data.entityName || 'N/A'}\n` +
      `<b>📝 Description:</b> ${data.programDescription || 'N/A'}\n\n` +
      `<b>🆔 Program ID:</b> <code>${data.programId}</code>\n` +
      `<b>👥 DAU:</b> ${data.dau ?? 'N/A'}\n` +
      `<b>📈 New Users (1d):</b> ${data.newUsersChange1d ?? 'N/A'}\n` +
      `<b>🔁 Instructions (1d):</b> ${data.instructions1d ?? 'N/A'}\n\n`;

    if (data.idlUrl) {
      formattedDetails += `<b>🔗 IDL:</b> <a href="${data.idlUrl}">View IDL</a>\n`;
    }

    if (data.labels?.length > 0) {
      formattedDetails += `<b>🏷️ Labels:</b> ${data.labels.join(', ')}\n`;
    }

    if (data.logoUrl) {
      formattedDetails += `<b>🖼️ Logo:</b> <a href="${data.logoUrl}">View Logo</a>`;
    }

    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: `<b>🔍 Program Details</b>\n\n${formattedDetails}`,
      parse_mode: 'HTML' as 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Fetch Another',
              callback_data: '/sub-programs_details_fetch',
            },
          ],
          [{ text: '🔙 Programs Menu', callback_data: '/programs' }],
        ],
      },
    });
  } catch (error) {
    console.error('Error in fetchProgramDetails:', error);
    await sendMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      text: '<b>❌ Error</b>\n\nUnable to fetch program details. Please verify the program ID and try again.',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Try Again',
              callback_data: '/sub-programs_details_fetch',
            },
          ],
          [{ text: '🔙 Back', callback_data: '/sub-programs_details' }],
        ],
      },
    });
  }
}
