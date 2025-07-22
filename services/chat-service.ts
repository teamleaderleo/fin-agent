// services/chat-service.ts
import { Message } from '@/components/chat/types';

// Defines the shape of data streamed from the server-sent event (SSE) endpoint.
type StreamedData = {
  type: 'metadata' | 'content' | 'done' | 'error';
  content?: string;
  reasoning?: any[];
  stepCount?: number;
  error?: string;
};

/**
 * Handles the API call to the chat backend and streams the response.
 * @param messages The current list of messages to send to the backend.
 * @param onData A callback function that will be invoked for each piece of data received from the stream.
 */
export async function streamChatResponse(messages: Message[], onData: (data: StreamedData) => void) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ details: 'Unknown server error' }));
      throw new Error(errorData.details || `Request failed with status ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body reader available');

    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data: StreamedData = JSON.parse(line.slice(6));
            onData(data); // Invoke the callback with the parsed data
            if (data.type === 'done' || data.type === 'error') {
              return; // End the loop if we receive a terminal event
            }
          } catch (parseError) {
            console.error('Error parsing SSE data:', parseError);
          }
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    onData({ type: 'error', error: errorMessage });
  }
}