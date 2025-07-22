// components/chat/types.ts

// Represents a single message in the chat.
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  // Optional metadata from the backend
  toolUsed?: string;
  reasoning?: any[];
  stepCount?: number;
}

// Represents an entire chat session.
export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}