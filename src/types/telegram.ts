import { z } from 'zod';

// this is webhook receiving data from telegram schema
export const TelegramWebhookMessageSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      username: z.string().optional(),
      language_code: z.string().optional(),
      is_premium: z.boolean().optional(),
    }),
    chat: z.object({
      id: z.number(),
      first_name: z.string().optional(),
      username: z.string().optional(),
      type: z.enum(['private', 'group', 'supergroup', 'channel']),
    }),
    date: z.number(),
    text: z.string().optional(),
    reply_to_message: z
      .object({
        message_id: z.number(),
        from: z
          .object({
            id: z.number(),
            is_bot: z.boolean(),
            first_name: z.string(),
            username: z.string().optional(),
          })
          .optional(),
        chat: z
          .object({
            id: z.number(),
            type: z.enum(['private', 'group', 'supergroup', 'channel']),
          })
          .optional(),
        date: z.number().optional(),
        text: z.string().optional(),
      })
      .optional(),
  }),
});

// this is schema for receiving callback query from telegram
export const TelegramWebHookCallBackQuerySchema = z.object({
  update_id: z.number(),
  callback_query: z.object({
    id: z.string(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      username: z.string(),
      language_code: z.string(),
      is_premium: z.boolean().optional(), // Optional since not all users are premium
    }),
    message: z.object({
      message_id: z.number(),
      from: z.object({
        id: z.number(),
        is_bot: z.boolean(),
        first_name: z.string(),
        username: z.string().optional(), // Optional because not all messages have username
      }),
      chat: z.object({
        id: z.number(),
        type: z.string(),
      }),
      date: z.number(),
      text: z.string().optional(),
      entities: z
        .array(
          z.object({
            offset: z.number(),
            length: z.number(),
            type: z.string(),
          }),
        )
        .optional(), // Optional since not all messages contain entities
      reply_markup: z
        .object({
          inline_keyboard: z.array(
            z.array(
              z.object({
                text: z.string(),
                callback_data: z.string().optional(),
                url: z.string().optional(),
              }),
            ),
          ),
        })
        .optional(), // Optional since not all messages have inline keyboards
    }),
    chat_instance: z.string(),
    data: z.string(), // Data sent when clicking a button
  }),
});

export const TelegramWebhookSchema = z.union([
  TelegramWebhookMessageSchema,
  TelegramWebHookCallBackQuerySchema,
]);

// this is schema for sending message to telegram
export const TelegramSendMessageSchema = z.object({
  chat_id: z.number(),
  text: z.string().min(1),
  message_id: z.number().optional(),
  parse_mode: z.enum(['MarkdownV2', 'HTML']).optional(),
  disable_web_page_preview: z.boolean().optional(),
  reply_parameters: z
    .object({
      message_id: z.number(),
    })
    .optional(),
  reply_markup: z
    .object({
      inline_keyboard: z
        .array(
          z.array(
            z.object({
              text: z.string(),
              url: z.string().optional(),
              switch_inline_query_current_chat: z.string().optional(),
              callback_data: z.string().optional(),
            }),
          ),
        )
        .optional(),
      force_reply: z.boolean().optional(),

      input_field_placeholder: z.string().optional(),
    })
    .optional(),
});

export type TelegramMessagePayload = z.infer<
  typeof TelegramWebhookMessageSchema
>;
export type TelegramSendMessage = z.infer<typeof TelegramSendMessageSchema>;
export type TelegramWebHookCallBackQueryPayload = z.infer<
  typeof TelegramWebHookCallBackQuerySchema
>;
