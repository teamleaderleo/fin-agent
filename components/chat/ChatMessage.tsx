// components/chat/ChatMessage.tsx
import { useState } from 'react';
import { Message } from './types';
import { ReasoningDisplay } from './ReasoningDisplay';
import { formatMessageContent, copyMessageToClipboard } from './utils';

// This component ONLY needs to know about the message it's rendering and the theme.
interface Props {
  msg: Message;
  isDarkMode: boolean;
}

export function ChatMessage({ msg, isDarkMode }: Props) {
  // State for copy feedback is now local to each message component.
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    const formattedHtml = formatMessageContent(msg.content);
    copyMessageToClipboard(formattedHtml);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-2xl w-full ${msg.role === 'user' ? 'ml-12' : 'mr-12'} space-y-2`}>
        
        {msg.role === 'assistant' && msg.reasoning && msg.reasoning.length > 0 && (
          <ReasoningDisplay 
            reasoning={msg.reasoning} 
            stepCount={msg.stepCount || 0}
            isDarkMode={isDarkMode}
          />
        )}

        <div className={`rounded-2xl px-4 py-3 relative shadow-sm transition-colors ${ 
            msg.role === 'user' 
            ? (isDarkMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white') 
            : (isDarkMode ? 'bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 text-gray-100' : 'bg-white/60 backdrop-blur-sm border border-gray-200/50 text-gray-800')
        }`}>
          <div 
            className="whitespace-pre-wrap"
            // We can now directly use the helper function here
            dangerouslySetInnerHTML={{ __html: msg.role === 'assistant' ? formatMessageContent(msg.content) : msg.content }} 
          />
          
          {msg.role === 'assistant' && msg.content && (
            <button 
              onClick={handleCopy} 
              className={`absolute bottom-2 right-2 p-1 text-xs rounded transition-colors shadow-sm opacity-60 hover:opacity-100 ${ isDarkMode ? 'bg-gray-700/80 hover:bg-gray-700 text-gray-300' : 'bg-white/80 hover:bg-white text-gray-700'}`} 
              title="Copy message"
            >
              {isCopied ? '✓' : '📋'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}