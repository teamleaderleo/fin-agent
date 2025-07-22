// components/chat/ChatHistorySidebar.tsx
import { Chat } from './types';

interface Props {
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  chatHistory: Chat[];
  currentChatId: string | null;
  loadChat: (chat: Chat) => void;
  deleteChat: (chatId: string, e: React.MouseEvent) => void;
  createNewChat: () => void;
  isDarkMode: boolean;
}

export function ChatHistorySidebar({ showHistory, setShowHistory, chatHistory, currentChatId, loadChat, deleteChat, createNewChat, isDarkMode }: Props) {
  if (!showHistory) return null;

  return (
    <div className="w-80 transition-all duration-300 overflow-hidden border-r ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200/50'}">
      <div className={`w-80 h-full backdrop-blur-sm ${isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'}`}>
        <div className="p-4 border-b border-gray-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-semibold transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Chat History</h2>
            <button onClick={() => setShowHistory(false)} className={`p-1 rounded transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>✕</button>
          </div>
          <button onClick={createNewChat} className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${ isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white'}`}>
            + New Chat
          </button>
        </div>
        <div className="p-2 overflow-y-auto h-[calc(100%-5rem)]">
          {chatHistory
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((chat) => (
              <div key={chat.id} onClick={() => loadChat(chat)} className={`group p-3 rounded-lg cursor-pointer transition-all duration-200 mb-2 ${
                  chat.id === currentChatId ? (isDarkMode ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200')
                  : (isDarkMode ? 'hover:bg-gray-800/60 border border-transparent' : 'hover:bg-gray-100/60 border border-transparent')
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate transition-colors ${ chat.id === currentChatId ? (isDarkMode ? 'text-blue-200' : 'text-blue-700') : (isDarkMode ? 'text-gray-200' : 'text-gray-700')}`}>
                      {chat.title}
                    </p>
                    <p className={`text-xs mt-1 transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      {new Date(chat.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button onClick={(e) => deleteChat(chat.id, e)} className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${ isDarkMode ? 'text-gray-500 hover:text-red-400 hover:bg-red-400/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-100' }`}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}