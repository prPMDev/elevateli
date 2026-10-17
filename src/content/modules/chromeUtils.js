/**
 * Chrome API utility functions
 */

/**
 * Send a message to the service worker. Resolves with its response, or null when it can't be reached
 * (extension reloaded, worker not answering). A worker that is still starting gets one retry.
 */
async function safeSendMessage(message, retried = false) {
  if (!chrome.runtime?.id) return null;
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (!retried && /Could not establish connection|message port closed|No SW/.test(error?.message)) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return safeSendMessage(message, true);
    }
    return null;
  }
}
