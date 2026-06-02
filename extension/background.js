// Relay messages between popup and recorder tab
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'STOP_FROM_POPUP') {
    // Find the recorder tab and tell it to stop
    chrome.tabs.query({ url: chrome.runtime.getURL('recorder.html') }, (tabs) => {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' }));
    });
  }

  if (msg.type === 'RECORDER_STARTED') {
    chrome.storage.session.set({ recording: true, startTime: msg.startTime });
  }

  if (msg.type === 'UPLOAD_DONE') {
    chrome.storage.session.set({ shareLink: msg.url, recording: false });
  }
});
