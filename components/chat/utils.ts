// components/chat/utils.ts

/**
 * Formats the raw message content, converting custom markdown for citations into HTML anchor tags.
 * @param content The raw string content from a message.
 * @returns An HTML string ready for `dangerouslySetInnerHTML`.
 */
export const formatMessageContent = (content: string): string => {
  const formatted = content.replace(
    /\[\[([^\]]+)\]\(([^)]+)\)\]/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-100 dark:bg-blue-800 dark:text-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full ml-1 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors">$1 🔗</a>'
  );
  return formatted.replace(
    /\[([^\]]+)\]/g, 
    '<span class="inline-block bg-gray-200 dark:bg-gray-700 dark:text-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full ml-1">$1</span>'
  );
};

/**
 * Copies the reasoning steps for a message to the clipboard in a readable text format.
 * @param reasoning The array of reasoning steps from a message.
 */
export const copyReasoningToClipboard = async (reasoning: any[]) => {
  try {
    const reasoningText = reasoning.map((step) => {
      let text = `${step.step}. `;
      if (step.type === 'tool_step') {
        text += `🚀 ${step.toolName}\n`;
        if (step.toolArgs) text += `${JSON.stringify(step.toolArgs, null, 2)}\n`;
        if (step.result) text += `→ ${step.result.preview}\n`;
      } else if (step.type === 'completion') {
        text += `🏁 Finished\n`;
        if (step.message) text += `${step.message}\n`;
      }
      return text;
    }).join('\n');

    await navigator.clipboard.writeText(reasoningText);
  } catch (err) {
    console.error('Failed to copy reasoning:', err);
  }
};

/**
 * Copies the HTML content of a message to the clipboard as plain text.
 * @param content The HTML string content of a message.
 */
export const copyMessageToClipboard = async (content: string) => {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    
    await navigator.clipboard.writeText(plainText);
  } catch (err) {
    console.error('Failed to copy message:', err);
  }
};