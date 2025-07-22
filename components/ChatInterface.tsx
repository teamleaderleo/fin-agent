// components/ChatInterface.tsx
'use client';

import { useState, useEffect } from 'react';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useChat } from '@/hooks/useChat';
import { ChatHeader } from './chat/ChatHeader';
import { ChatHistorySidebar } from './chat/ChatHistorySidebar';
import { MessageList } from './chat/MessageList';
import { ChatInput } from './chat/ChatInput';

export default function ChatInterface() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const {
    chatHistory,
    currentChatId,
    showHistory,
    setShowHistory,
    createNewChat,
    loadChat,
    deleteChat,
    saveMessagesToHistory,
    getCurrentChatMessages
  } = useChatHistory();

  const {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    handleSubmit,
    messagesEndRef
  } = useChat({
    saveMessagesToHistory: saveMessagesToHistory
  });

  useEffect(() => {
    const savedMode = localStorage.getItem('fin-agent-dark-mode') === 'true';
    setIsDarkMode(savedMode);
  }, []);

  // This effect will run whenever currentChatId changes
  // It depends only on functions that are memoized with useCallback.
  useEffect(() => {
    const messagesForCurrentChat = getCurrentChatMessages();
    setMessages(messagesForCurrentChat);
  }, [currentChatId, getCurrentChatMessages, setMessages]);


  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('fin-agent-dark-mode', String(newMode));
  };

  return (
    <div className={`flex h-screen transition-colors ${ isDarkMode ? 'dark bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-gray-50 to-gray-100'}`}>
      
      <ChatHistorySidebar
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        chatHistory={chatHistory}
        currentChatId={currentChatId}
        loadChat={loadChat}
        deleteChat={deleteChat}
        createNewChat={createNewChat}
        isDarkMode={isDarkMode}
      />
      
      <div className="flex-1 flex flex-col">
        <ChatHeader
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          setShowHistory={setShowHistory}
        />
        
        <MessageList
          messages={messages}
          isLoading={isLoading}
          messagesEndRef={messagesEndRef}
          setInput={setInput}
          isDarkMode={isDarkMode}
        />
        
        <ChatInput
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          isDarkMode={isDarkMode}
        />
      </div>
    </div>
  );
}