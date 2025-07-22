// components/chat/MessageList.tsx
import React from 'react';
import { Message } from './types';
import { ChatMessage } from './ChatMessage';
import { WelcomeScreen } from './WelcomeScreen';

interface Props {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.Ref<HTMLDivElement>;
  setInput: (input: string) => void;
  isDarkMode: boolean;
}

export function MessageList({ messages, isLoading, messagesEndRef, setInput, isDarkMode }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {messages.length === 0 && !isLoading && (
          <WelcomeScreen setInput={setInput} isDarkMode={isDarkMode} />
        )}

        {messages.map((msg, idx) => (
          <ChatMessage key={idx} msg={msg} isDarkMode={isDarkMode} />
        ))}

        {/* This is the loading spinner section */}
        {isLoading && (
          <div className="flex justify-start">
             <div className={`rounded-2xl px-4 py-3 mr-12 backdrop-blur-sm border transition-colors ${isDarkMode ? 'bg-gray-800/60 border-gray-700/50' : 'bg-white/60 border-gray-200/50'}`}>
              <div className="flex items-center space-x-2">
                <div
                  className={`
                    animate-spin h-4 w-4 rounded-full border-2
                    border-t-transparent
                    ${isDarkMode ? 'border-gray-400' : 'border-gray-600'}
                  `}
                ></div>

                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Analyzing...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}