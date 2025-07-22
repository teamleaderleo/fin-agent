// app/api/chat/tool-processor.ts

/**
 * Processes the raw result from a tool execution, formatting it for the LLM.
 * This function is the "data processing" layer.
 * @param toolName The name of the tool that was executed.
 * @param toolResult The raw result from the tool.executor.
 * @param toolArgs The original arguments for the tool.
 * @param sourceUrl The source URL for the data.
 * @returns A structured, cleaned-up object ready to be passed to the LLM.
 */
export function processToolResult(toolName: string, toolResult: any, toolArgs: any, sourceUrl: string): any {
  switch (toolName) {
    case "resolveSymbol":
      if (Array.isArray(toolResult) && toolResult.length > 0) {
        const usExchanges = ['NASDAQ', 'NYSE', 'AMEX'];
        const bestResult = toolResult.find(r => usExchanges.includes(r.exchange) && r.currency === 'USD' && !r.symbol.includes('.')) || toolResult[0];
        
        return {
          query: toolArgs.query,
          found: true,
          ticker: bestResult.symbol,
          companyName: bestResult.name,
          exchange: bestResult.exchange,
          currency: bestResult.currency,
          sourceUrl: sourceUrl,
          toolDescription: "Company Search",
          message: `Found ticker symbol: ${bestResult.symbol} for ${bestResult.name} on ${bestResult.exchange}`
        };
      } else {
        return {
          query: toolArgs.query,
          found: false,
          sourceUrl: sourceUrl,
          toolDescription: "Company Search",
          message: `No ticker symbol found for "${toolArgs.query}"`
        };
      }
      
    case "getStatement":
      if (Array.isArray(toolResult) && toolResult.length > 0) {
        const statementTypeMap = { 'income': 'Income Statement API', 'balance-sheet': 'Balance Sheet API', 'cash-flow': 'Cash Flow API' };
        return {
          symbol: toolArgs.symbol,
          statementType: toolArgs.statement,
          period: toolArgs.period || 'annual',
          recordsFound: toolResult.length,
          mostRecentPeriod: toolResult[0],
          allPeriods: toolResult.slice(0, 3),
          sourceUrl: sourceUrl,
          toolDescription: statementTypeMap[String(toolArgs.statement) as keyof typeof statementTypeMap] || 'Financial Statement API'
        };
      } else {
        return {
          symbol: toolArgs.symbol,
          statementType: toolArgs.statement,
          sourceUrl: sourceUrl,
          toolDescription: 'Financial Statement API',
          error: "No financial statements found"
        };
      }

    case "getFinancialGrowth":
      // Here we add the metadata that was previously in the route handler's executor
      return {
        symbol: toolArgs.symbol,
        metric: toolArgs.metric,
        requestedYears: toolArgs.years,
        rawData: toolResult, // The raw API array is nested here
        sourceUrl: sourceUrl,
        toolDescription: "getFinancialGrowth"
      };
      
    case "getQuote":
      if (Array.isArray(toolResult) && toolResult.length > 0) {
        return {
          ...toolResult[0],
          sourceUrl: sourceUrl,
          toolDescription: "Stock Quote API"
        };
      }
      return toolResult; // Return as-is if not an array
      
    case "searchTranscripts":
      if (typeof toolResult === 'object' && toolResult !== null && !toolResult.error) {
        return { ...toolResult, sourceUrl, toolDescription: "Multi-Transcript Search" };
      } else {
        return {
          error: typeof toolResult === 'object' && toolResult !== null ? toolResult.error : 'Unknown error',
          sourceUrl: sourceUrl,
          toolDescription: "Multi-Transcript Search"
        };
      }
      
    // Default case for tools that don't need special processing
    default:
      if (typeof toolResult === 'object' && toolResult !== null) {
        return {
          ...toolResult,
          sourceUrl: sourceUrl,
          toolDescription: toolName // fallback to function name
        };
      }
      // Return the result as is if it's not an object (e.g., a simple string or array)
      return toolResult;
  }
}