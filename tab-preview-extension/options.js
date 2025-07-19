const form = document.getElementById("settings-form");
const status = document.getElementById("status");

document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get(
        {
            theme: "light",
            tabsPerPage: 20,
            livePreviews: false,
            hoverPreviews: false
        },
        (settings) => {
            document.getElementById("theme").value = settings.theme;
            document.getElementById("tabsPerPage").value = settings.tabsPerPage;
            document.getElementById("livePreviews").checked = settings.livePreviews;
            document.getElementById("hoverPreviews").checked = settings.hoverPreviews;
        }
    );

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const settings = {
            theme: document.getElementById("theme").value,
            tabsPerPage: parseInt(document.getElementById("tabsPerPage").value),
            livePreviews: document.getElementById("livePreviews").checked,
            hoverPreviews: document.getElementById("hoverPreviews").checked
        };

        chrome.storage.sync.set(settings, () => {
            status.textContent = "✅ Settings saved!";
            setTimeout(() => (status.textContent = ""), 2000);
        });
    });
});