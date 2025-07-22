// app/api/chat/transcript.searcher.ts
import { fmpClient } from "@/lib/fmp_client";
import { openai } from "@/lib/openai_client";
import { TOPIC_EXPANSION_SYSTEM_PROMPT } from "./prompts";
import Fuse from 'fuse.js';

// The interface for mentions found within a transcript.
interface TranscriptMention {
  topic: string;
  speaker: string;
  context: string;
  score: number;
}

/**
 * Helper function to search transcript content for topics and executives.
 * This is now a private helper within this module.
 * @param symbol The ticker symbol, used for logging context.
 */
function searchTranscriptContent(content: string, topics: string[], executives: string[], symbol: string): TranscriptMention[] {
  const mentions: TranscriptMention[] = [];
  if (!content || topics.length === 0) return mentions;

  const paragraphs = content.split('\n')
    .filter(p => p.trim().length > 50)
    .map((text, index) => ({ text, index }));

  const fuse = new Fuse(paragraphs, {
    keys: ['text'],
    threshold: 0.3,
    includeScore: true,
    includeMatches: true,
    minMatchCharLength: 3,
    ignoreLocation: true
  });

  const searchQuery = { $or: topics.map(topic => ({ text: topic })) };
  const results = fuse.search(searchQuery);
  console.log(`🔍 Fuzzy search for ${topics.length} keywords found ${results.length} potential matches in ${symbol}`);

  for (const result of results.slice(0, 15)) {
    const paragraph = result.item.text;
    const paragraphIndex = result.item.index;
    const score = result.score || 0;
    const matchedTopic = result.matches?.[0]?.value || topics[0];

    const contextStart = Math.max(0, paragraphIndex - 1);
    const contextEnd = Math.min(paragraphs.length - 1, paragraphIndex + 1);
    const context = paragraphs.slice(contextStart, contextEnd + 1).map(p => p.text).join('\n');

    let speaker = "Unknown";
    let executiveMatch = false;

    if (executives.length > 0) {
      const searchArea = paragraphs.slice(Math.max(0, paragraphIndex - 3), paragraphIndex + 1).map(p => p.text).join('\n');
      for (const exec of executives) {
        if (new RegExp(exec, 'i').test(searchArea)) {
          speaker = exec;
          executiveMatch = true;
          break;
        }
      }
      if (!executiveMatch) continue;
    } else {
      const speakerMatch = paragraph.match(/^([A-Z][a-zA-Z\s.,'-]+?)[:]/);
      if (speakerMatch && speakerMatch[1]) {
        speaker = speakerMatch[1].trim();
      }
    }

    mentions.push({
      topic: matchedTopic,
      speaker: speaker,
      context: context.substring(0, 800),
      score: score
    });
  }

  return mentions.sort((a, b) => a.score - b.score).slice(0, 8);
}


/**
 * Executes the entire transcript search flow, from topic expansion to summarization.
 * @param toolArgs The arguments provided by the planner model for the 'searchTranscripts' tool.
 * @returns A result object summarizing the findings.
 */
export async function executeTranscriptSearch(toolArgs: any): Promise<unknown> {
  const { symbols, topic, executives, lookbackQuarters } = {
    symbols: Array.isArray(toolArgs.symbols) ? toolArgs.symbols : [toolArgs.symbols],
    topic: toolArgs.topic || "",
    executives: toolArgs.executives || [],
    lookbackQuarters: toolArgs.lookbackQuarters || 4,
  };

  // --- Topic Expansion ---
  let expandedTopics = [topic];
  if (topic) {
    try {
      console.log(`🧠 Expanding search topic: "${topic}"`);
      const topicExpansionResponse = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "system", content: TOPIC_EXPANSION_SYSTEM_PROMPT }, { role: "user", content: `Topic: "${topic}"` }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      const expansionResult = JSON.parse(topicExpansionResponse.choices[0].message.content || '{}');
      if (expansionResult.topics && Array.isArray(expansionResult.topics)) {
        expandedTopics = [...new Set([topic, ...expansionResult.topics])];
        console.log(`✅ Expanded topics to: [${expandedTopics.join(', ')}]`);
      }
    } catch (expansionError) {
      console.error("⚠️ Failed to expand topic, continuing with original:", expansionError);
    }
  }
  
  try {
    const allMentions: any[] = [];
    let transcriptsAnalyzedCount = 0;
    
    for (const symbol of symbols) {
      console.log(`🔍 Searching transcripts for ${symbol}`);
      const transcriptDatesResult = await fmpClient.get("/earning-call-transcript-dates", { symbol });
      if (!Array.isArray(transcriptDatesResult) || transcriptDatesResult.length === 0) continue;
      
      const recentDates = transcriptDatesResult.slice(0, lookbackQuarters);
      
      for (const dateInfo of recentDates) {
        try {
          const transcriptResult = await fmpClient.get("/earning-call-transcript", {
            symbol,
            year: (dateInfo.fiscalYear || dateInfo.year).toString(),
            quarter: dateInfo.quarter.toString()
          });
          
          if (Array.isArray(transcriptResult) && transcriptResult.length > 0 && transcriptResult[0].content) {
            transcriptsAnalyzedCount++;
            const content = transcriptResult[0].content;
            const topicMentions = searchTranscriptContent(content, expandedTopics, executives, symbol);
            
            if (topicMentions.length > 0) {
              topicMentions.forEach(mention => {
                allMentions.push({ ...mention, symbol: symbol, date: transcriptResult[0].date });
              });
            }
          }
        } catch (transcriptError) {
           console.log(`⚠️ Error fetching transcript for ${symbol} Q${dateInfo.quarter} ${dateInfo.year}:`, transcriptError);
        }
      }
    }

    // --- Aggressive Summarization ---
    console.log(`📊 Found ${allMentions.length} total potential mentions. Summarizing...`);
    allMentions.sort((a, b) => a.score - b.score);

    const MAX_MENTIONS_TO_RETURN = 15;
    const SNIPPET_LENGTH = 200;

    const summarizedMentions = allMentions.slice(0, MAX_MENTIONS_TO_RETURN).map(mention => ({
      symbol: mention.symbol,
      date: mention.date,
      speaker: mention.speaker,
      topic: mention.topic,
      snippet: mention.context.substring(0, SNIPPET_LENGTH) + '...'
    }));
    
    console.log(`✅ Summarized to the top ${summarizedMentions.length} snippets.`);
    
    return {
      query: { symbols, topic, executives, lookbackQuarters },
      resultsSummary: summarizedMentions,
      totalMatchesFound: allMentions.length,
      companiesSearched: symbols.length,
      transcriptsAnalyzed: transcriptsAnalyzedCount,
      summary: `Found ${allMentions.length} potential mentions of "${topic}". Returning the top ${summarizedMentions.length} most relevant snippets.`
    };
    
  } catch (error) {
    console.error("❌ Error in searchTranscripts:", error);
    return { error: `Failed to search transcripts: ${error instanceof Error ? error.message : 'Unknown error'}`, query: { symbols, topic, executives, lookbackQuarters }};
  }
}