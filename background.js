chrome.commands.onCommand.addListener((command) => {
  if (command === "show_tab_preview") {
    openPreviewWindow();
  }
});

chrome.action.onClicked.addListener(() => {
  openPreviewWindow();
});

function openPreviewWindow() {
  chrome.windows.getAll({ populate: false }, (windows) => {
    const normalWindow = windows.find(w => w.type === 'normal' && w.focused);
    if (!normalWindow) {
      console.error("No focused normal window found.");
      return;
    }

    const url = `preview.html?windowId=${normalWindow.id}`;
    chrome.windows.create({
      url,
      type: "popup",
      width: 1000,
      height: 700
    });
  });
}
