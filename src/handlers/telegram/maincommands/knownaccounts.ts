import { TELEGRAM_BASE_URL, VYBE_API_BASE_URL } from '../../../utils/constant';
import { makeVybeRequest, updateMessage } from '../../../utils/helpers';
// Using built-in FormData instead of form-data package


/**
 * Display known accounts categories for selection
 */
export async function knownAccounts(chatId: number, messageId: number) {
  try {
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: 'Select a category of known accounts:',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'CEX', callback_data: '/sub-knownaccounts_CEX' },
            { text: 'dApp', callback_data: '/sub-knownaccounts_dApp' },
            { text: 'Treasury', callback_data: '/sub-knownaccounts_Treasury' },
          ],
          [
            { text: 'Hacker', callback_data: '/sub-knownaccounts_Hacker' },
            { text: 'Bridge', callback_data: '/sub-knownaccounts_Bridge' },
            { text: 'MM', callback_data: '/sub-knownaccounts_MM' },
          ],
          [
            { text: 'Pool', callback_data: '/sub-knownaccounts_Pool' },
            { text: 'DeFi', callback_data: '/sub-knownaccounts_DeFi' },
            { text: 'DAO', callback_data: '/sub-knownaccounts_DAO' },
          ],
          [
            { text: 'VC', callback_data: '/sub-knownaccounts_VC' },
            { text: 'NFT', callback_data: '/sub-knownaccounts_NFT' },
            { text: 'CLMM', callback_data: '/sub-knownaccounts_CLMM' },
          ],
          [
            { text: 'Back to main menu', callback_data: '/main' },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Error in knownAccounts:', error);
    throw error;
  }
}

/**
 * Handle known accounts request with specific label
 */
export async function handleKnownAccountsRequest(
  chatId: number, 
  messageId: number, 
  label: string
) {
  try {
    // Update message to show loading state
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: `Fetching ${label} accounts... Please wait.`,
    });

    // Fetch known accounts with the specified label
    console.log('Fetching known accounts with label:', label);
    const endpoint = `account/known-accounts?labels=${encodeURIComponent(label)}`;
    const response = await makeVybeRequest(endpoint);
    if (!response || !response.accounts) {
      console.log('No data found for label:', label); 
      console.log('Response:', response);
      await updateMessage(TELEGRAM_BASE_URL, {
        chat_id: chatId,
        message_id: messageId,
        text: `No ${label} accounts found.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Known Accounts', callback_data: '/knownaccounts' }],
            [{ text: 'Back to Main Menu', callback_data: '/main' }],
          ],
        },
      });
      return;
    }

    // Format the accounts in a beautiful way
    const accounts = response.accounts;
    const formattedAccounts = accounts.map((account: any, index: number) => {
      ///@ts-ignore
      const labels = account.labels.filter(label => label).join(', ') || 'N/A';
      const logoUrl = account.logoUrl || 'N/A';
      
      return `Account ${index + 1}:\n` +
        `Address: ${account.ownerAddress}\n` +
        `Name: ${account.name}\n` +
        `Labels: ${labels}\n` +
        `Logo: ${logoUrl}\n` +
        `Twitter: ${account.twitterUrl || 'N/A'}\n` +
        `Added: ${new Date(account.dateAdded).toLocaleDateString()}\n` +
        `-----------------------------------\n`;
    }).join('\n');

    // Create a FormData object for the file
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    
    // Create a Blob for the document
    const blob = new Blob([formattedAccounts], { type: 'text/plain' });
    const file = new File([blob], `${label.toLowerCase()}_accounts.txt`, { type: 'text/plain' });
    formData.append('document', file);
    formData.append('caption', `${label} Accounts List`);
    
    const response2 = await fetch(`${TELEGRAM_BASE_URL}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    if (!response2.ok) {
      throw new Error(`Failed to send document: ${response2.statusText}`);
    }

    // Delete the loading message
    await fetch(`${TELEGRAM_BASE_URL}/deleteMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
      }),
    });
    
    // Now send a new message with navigation buttons
    await fetch(`${TELEGRAM_BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Use these buttons to navigate:`,
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Known Accounts', callback_data: '/knownaccounts' }],
            [{ text: 'Back to Main Menu', callback_data: '/main' }],
          ],
        },
      }),
    });
  } catch (error) {
    console.error(`Error in handleKnownAccountsRequest for ${label}:`, error);
    await updateMessage(TELEGRAM_BASE_URL, {
      chat_id: chatId,
      message_id: messageId,
      text: `Error fetching ${label} accounts. Please try again later.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Back to Known Accounts', callback_data: '/knownaccounts' }],
          [{ text: 'Back to Main Menu', callback_data: '/main' }],
        ],
      },
    });
  }
}
