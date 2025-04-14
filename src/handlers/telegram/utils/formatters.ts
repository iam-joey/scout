import { TELEGRAM_BASE_URL } from '../../../utils/constant';

/**
 * Format price change with arrow indicator
 */
export function formatPriceChange(change: number | undefined): string {
  if (change === undefined || change === null) return 'N/A';
  const arrow = change >= 0 ? '🟢 ↗️' : '🔴 ↘️';
  return `${arrow} ${change.toFixed(2)}%`;
}

/**
 * Format large numbers with appropriate suffixes
 */
export function formatLargeNumber(num: number | undefined): string {
  if (num === undefined || num === null) return 'N/A';

  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }

  return num.toString();
}

/**
 * Format token transfer amount with decimals
 */
export function formatTokenAmount(amount: number, decimals: number): string {
  return (amount / Math.pow(10, decimals)).toFixed(decimals);
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Create pagination buttons for a given page
 */
export function createPaginationButtons(
  currentPage: number,
  totalPages: number,
  callbackPrefix: string,
): { text: string; callback_data: string }[] {
  const buttons = [];

  // Previous page button (if not on first page)
  if (currentPage > 0) {
    buttons.push({
      text: '⬅️ Previous',
      callback_data: `${callbackPrefix}${currentPage - 1}`,
    });
  }

  // Next page button (if not on last page)
  if (currentPage < totalPages) {
    buttons.push({
      text: 'Next ➡️',
      callback_data: `${callbackPrefix}${currentPage + 1}`,
    });
  }

  return buttons;
}
