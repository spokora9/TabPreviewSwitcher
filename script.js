let livePreviewsEnabled = false;
const urlParams = new URLSearchParams(window.location.search);
const windowId = parseInt(urlParams.get('windowId'));

let tabs = [];
let currentPage = 0;
let tabsPerPage = 20;
let snapshots = {}; // Placeholder for preview caching

const isBrave = navigator.brave && typeof navigator.brave.isBrave === "function";

// Load synced theme from settings or fallback to localStorage
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({ theme: 'light' }, (settings) => {
    const fallback = localStorage.getItem('theme') || 'light';
    const theme = settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : settings.theme || fallback;

    document.documentElement.dataset.theme = theme;
    document.getElementById('toggle-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
  });
});

// Theme toggle (does NOT update synced setting — just for current popup)
document.getElementById('toggle-theme').onclick = () => {
  const current = document.documentElement.dataset.theme;
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  document.getElementById('toggle-theme').textContent = next === 'dark' ? '☀️' : '🌙';
};

// Load options and tabs
chrome.storage.sync.get({ tabsPerPage: 20, livePreviews: false }, (settings) => {
  tabsPerPage = settings.tabsPerPage;
  livePreviewsEnabled = settings.livePreviews;

  chrome.tabs.query({ windowId: windowId }, (result) => {
    tabs = result;
    debouncedRenderTabs();
  });
});

// Debounce helper
function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

const debouncedRenderTabs = debounce(renderTabs, 150);

// Snapshot caching (future use)
function saveSnapshot(tabId, dataUrl) {
  snapshots[tabId] = dataUrl;
  chrome.storage.local.set({ [`snapshot_${tabId}`]: dataUrl });
}

function loadSnapshot(tabId, callback) {
  chrome.storage.local.get(`snapshot_${tabId}`, (result) => {
    if (result[`snapshot_${tabId}`]) {
      snapshots[tabId] = result[`snapshot_${tabId}`];
    }
    callback();
  });
}

function renderTabs() {
  const container = document.getElementById('tab-container');
  container.innerHTML = '';
  container.setAttribute('role', 'list');

  const start = currentPage * tabsPerPage;
  const end = Math.min(start + tabsPerPage, tabs.length);
  const pageTabs = tabs.slice(start, end);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const tabId = img.dataset.tabId;
        if (snapshots[tabId]) {
          img.src = snapshots[tabId];
        }
        observer.unobserve(img);
      }
    });
  }, {
    root: null,
    threshold: 0.1
  });

  pageTabs.forEach(tab => {
    const tabDiv = document.createElement('div');
    tabDiv.className = 'tab';
    tabDiv.setAttribute('role', 'listitem');
    tabDiv.setAttribute('aria-label', `Tab: ${tab.title}`);
    tabDiv.onclick = () => {
      chrome.tabs.update(tab.id, { active: true });
    };

    const favIcon = document.createElement('img');
    favIcon.src = tab.favIconUrl || 'icons/icon128.png';
    favIcon.alt = 'Tab icon';
    favIcon.onerror = () => favIcon.src = 'icons/icon128.png';

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || 'Untitled';
    title.title = tab.title || 'Untitled';

  const preview = document.createElement('img');
preview.className = 'tab-preview';
preview.dataset.tabId = tab.id;

if (livePreviewsEnabled) {
  preview.alt = 'Loading preview...';

  loadCachedSnapshot(tab.id, (cached) => {
    if (cached) {
      preview.src = cached;
      preview.alt = 'Cached preview';
    } else {
      captureTabPreview(tab, (dataUrl) => {
        if (dataUrl) {
          preview.src = dataUrl;
          preview.alt = 'Live preview';
        } else {
          preview.alt = 'Preview failed';
        }
      });
    }
  });
} else if (isBrave) {
  preview.alt = 'Brave preview (simulated)';
} else {
  preview.alt = 'No preview available';
}
/*  */
    if (livePreviewsEnabled) {
    observer.observe(preview);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close tab');
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    chrome.tabs.remove(tab.id, () => {
      tabs = tabs.filter(t => t.id !== tab.id);
      debouncedRenderTabs();
    });
  };

  tabDiv.appendChild(favIcon);
  tabDiv.appendChild(title);
  tabDiv.appendChild(preview);
  tabDiv.appendChild(closeBtn);
  container.appendChild(tabDiv);
});

document.getElementById('page-indicator').textContent =
  `Page ${currentPage + 1} of ${Math.ceil(tabs.length / tabsPerPage)}`;
}

// Pagination buttons
document.getElementById('prev').onclick = () => {
  if (currentPage > 0) {
    currentPage--;
    debouncedRenderTabs();
  }
};

document.getElementById('next').onclick = () => {
  if ((currentPage + 1) * tabsPerPage < tabs.length) {
    currentPage++;
    debouncedRenderTabs();
  }
};

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') document.getElementById('next').click();
  if (e.key === 'ArrowLeft') document.getElementById('prev').click();
  if (e.key === 'Escape') window.close();
});


function captureTabPreview(tab, callback) {
  const useBraveFallback = isBrave;

  chrome.tabs.update(tab.id, { active: true }, () => {
    if (useBraveFallback) {
      // Fallback for Brave: capture visible tab
      chrome.windows.get(tab.windowId, { populate: false }, (win) => {
        chrome.tabs.captureVisibleTab(win.id, { format: "png" }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            console.warn(`Brave fallback failed for tab ${tab.id}:`, chrome.runtime.lastError?.message);
            callback(null);
            return;
          }

          snapshots[tab.id] = dataUrl;
          chrome.storage.local.set({ [`snapshot_${tab.id}`]: dataUrl }, () => {
            callback(dataUrl);
          });
        });
      });
    } else {
      // Primary: use tabCapture
      chrome.tabCapture.capture({
        audio: false,
        video: true,
        videoConstraints: {
          mandatory: {
            maxWidth: 1280,
            maxHeight: 720,
            minFrameRate: 1
          }
        }
      }, (stream) => {
        if (chrome.runtime.lastError || !stream) {
          console.warn(`tabCapture failed for tab ${tab.id}:`, chrome.runtime.lastError?.message);
          callback(null);
          return;
        }

        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        video.onloadeddata = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 168;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');

          stream.getTracks().forEach(t => t.stop());
          snapshots[tab.id] = dataUrl;
          chrome.storage.local.set({ [`snapshot_${tab.id}`]: dataUrl }, () => {
            callback(dataUrl);
          });
        };
      });
    }
  });
}

function loadCachedSnapshot(tabId, callback) {
  if (snapshots[tabId]) {
    callback(snapshots[tabId]);
    return;
  }

  chrome.storage.local.get(`snapshot_${tabId}`, (result) => {
    const dataUrl = result[`snapshot_${tabId}`];
    if (dataUrl) {
      snapshots[tabId] = dataUrl;
    }
    callback(dataUrl || null);
  });
}