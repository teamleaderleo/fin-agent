// lib/fmp_client.ts

// This is a simple wrapper around the FMP API.
// It handles adding the API key to every request and parsing the JSON response.

const FMP_API_BASE_URL = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.FMP_API_KEY;

if (!API_KEY) {
  throw new Error("FMP_API_KEY is not defined in your environment variables.");
}

/**
 * A generic function to make GET requests to the FMP API.
 * @param endpoint - The API endpoint path (e.g., '/search-symbol').
 * @param params - An object of query parameters.
 * @returns The JSON response from the API.
 */
async function get(endpoint: string, params: Record<string, any> = {}) {
  // Build the full URL with query parameters
  const url = new URL(`${FMP_API_BASE_URL}${endpoint}`);
  url.searchParams.append("apikey", API_KEY);
  for (const key in params) {
    if (params[key] !== undefined) { // Don't append undefined params
      url.searchParams.append(key, params[key]);
    }
  }

  console.log(`Making FMP API call: ${url.toString()}`); // Helpful for debugging

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `FMP API request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching from FMP API:", error);
    // In a real app, we might return a more structured error object
    return { error: `Failed to fetch from FMP API: ${error?.toString()}` };
  }
}

// Export a client object with the methods we'll use.
export const fmpClient = {
  get,
};