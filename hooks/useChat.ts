// hooks/useChat.ts
import { useState, useEffect, useRef } from 'react';
import { Message } from '@/components/chat/types';
import { streamChatResponse } from '@/services/chat-service'; 

interface UseChatProps {
  saveMessagesToHistory: (messages: Message[]) => void;
}

export function useChat({ saveMessagesToHistory }: UseChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      // Avoid saving an empty message list that would create a blank history entry
      if (messages.length > 0) {
        saveMessagesToHistory(messages);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [messages, saveMessagesToHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const newUserMessage: Message = { role: 'user', content: trimmedInput };
    // This is the array of messages we will send to the API
    const messagesToSubmit = [...messages, newUserMessage];
    
    // Set the user's message and the empty assistant shell immediately
    setMessages([...messagesToSubmit, { role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);

    await streamChatResponse(messagesToSubmit, (data) => {
      switch (data.type) {
        case 'content':
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessageIndex = newMessages.length - 1;
            // Create a new object for the last message
            const updatedLastMessage = { ...newMessages[lastMessageIndex] };
            // Append content to the new object
            updatedLastMessage.content += data.content;
            // Replace the old object with the new one
            newMessages[lastMessageIndex] = updatedLastMessage;
            return newMessages;
          });
          break;
        case 'metadata':
           setMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            // Also ensure metadata updates are immutable
            newMessages[newMessages.length - 1] = { ...lastMsg, ...data };
            return newMessages;
          });
          break;
        case 'error':
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = `❌ Error: ${data.error}`;
            return newMessages;
          });
          setIsLoading(false);
          break;
        case 'done':
          setIsLoading(false);
          break;
      }
    });
  };

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    handleSubmit,
    messagesEndRef,
  };
}