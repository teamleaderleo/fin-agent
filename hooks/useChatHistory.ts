// hooks/useChatHistory.ts
import { useState, useEffect, useCallback } from 'react';
import { Chat, Message } from '@/components/chat/types';

export function useChatHistory() {
  const [chatHistory, setChatHistory] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  // Load from localStorage
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('fin-agent-chat-history');
      if (savedHistory) {
        const parsedHistory: Chat[] = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
          setChatHistory(parsedHistory);
          const latestChat = parsedHistory.reduce((a, b) => a.updatedAt > b.updatedAt ? a : b);
          setCurrentChatId(latestChat.id);
        }
      }
    } catch (error) { console.error('Failed to load chat history:', error); }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem('fin-agent-chat-history', JSON.stringify(chatHistory));
    } else {
      localStorage.removeItem('fin-agent-chat-history');
    }
  }, [chatHistory]);

  const createNewChat = useCallback(() => setCurrentChatId(null), []);
  const loadChat = useCallback((chat: Chat) => setCurrentChatId(chat.id), []);
  
  const deleteChat = useCallback((chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatHistory(prev => prev.filter((c) => c.id !== chatId));
    if (currentChatId === chatId) createNewChat();
  }, [currentChatId, createNewChat]);

  const saveMessagesToHistory = useCallback((messages: Message[]) => {
    // This function depends on currentChatId, so it must be in the dependency array
    if (currentChatId) {
      setChatHistory(prev =>
        prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages, updatedAt: Date.now(), title: messages[0]?.content.substring(0, 40) + '...' }
            : chat
        )
      );
    } else if (messages.length > 0) {
      const newChat: Chat = {
        id: String(Date.now()),
        title: messages[0].content.substring(0, 40) + '...',
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setChatHistory(prev => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
    }
  }, [currentChatId]); // Dependency on currentChatId

  const getCurrentChatMessages = useCallback((): Message[] => {
    if (!currentChatId) return [];
    return chatHistory.find(c => c.id === currentChatId)?.messages || [];
  }, [chatHistory, currentChatId]); // Dependencies on chatHistory and currentChatId

  return {
    chatHistory,
    currentChatId,
    showHistory,
    setShowHistory,
    createNewChat,
    loadChat,
    deleteChat,
    saveMessagesToHistory,
    getCurrentChatMessages
  };
}