// Israeli market rates - Current as of January 2025
// These are manually maintained and should be updated periodically

interface MarketRates {
  reference_market_rate: number;
  alternative_investment_annual_return: number;
  prime_rate_current: number;
  last_updated: string;
  source: string;
}

/**
 * Get current market rates (manually maintained)
 * Updated: January 2025
 * Source: Bank of Israel public data
 */
export function getMarketRates(): MarketRates {
  return {
    reference_market_rate: 0.042,      // 4.2% - Current market rate for new mortgages
    alternative_investment_annual_return: 0.06,  // 6% - Conservative investment return (gov bonds)
    prime_rate_current: 0.045,         // 4.5% - Current BOI prime rate (as of Jan 2025)
    last_updated: '2025-01-01',
    source: 'Bank of Israel (manually updated)',
  };
}

/**
 * Refresh rates (placeholder - just returns current values)
 * In the future, this could be updated by an admin
 */
export async function refreshMarketRates(): Promise<MarketRates> {
  // Simulate network delay for UX
  await new Promise(resolve => setTimeout(resolve, 500));
  return getMarketRates();
}

/**
 * Format the last updated timestamp for display
 */
export function formatLastUpdated(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else {
    return date.toLocaleDateString();
  }
}

