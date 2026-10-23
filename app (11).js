// ======================================================
// HTML to APK Studio - Multi-File Engine & Firebase Sync
// ======================================================

// 1. Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBwpa8mA83JAv2A2Dj0rh5VHwodyv5N3dg",
  authDomain: "freegcash-ads.firebaseapp.com",
  databaseURL: "https://freegcash-ads-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "freegcash-ads",
  storageBucket: "freegcash-ads.firebasestorage.app",
  messagingSenderId: "608086825364",
  appId: "1:608086825364:web:3a8e628d231b52c6171781"
};

let db = null;
let deviceId = localStorage.getItem('apk_builder_device_id');

if (!deviceId) {
  deviceId = 'device_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  localStorage.setItem('apk_builder_device_id', deviceId);
}

try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  db = firebase.database();
  updateStatusBadge(true);
  listenToHistoryUpdates();
} catch (err) {
  console.warn("Firebase Init fallback:", err);
  updateStatusBadge(false);
}

function updateStatusBadge(isOnline) {
  const badge = document.getElementById('firebaseStatusBadge');
  if (!badge) return;
  if (isOnline) {
    badge.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span> Firebase Connected`;
  } else {
    badge.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5"></span> Local Mode`;
  }
}

// Global File Project Assets Memory
let projectFiles = [
  {
    name: 'index.html',
    type: 'text/html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Free GCash & Ads App</title>
  <link rel="stylesheet" href="style.css">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-6 text-center select-none">
  <div class="max-w-md w-full bg-slate-800/90 rounded-2xl p-6 border border-slate-700 shadow-xl space-y-5">
    <div class="w-16 h-16 mx-auto rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 text-2xl">
      🚀
    </div>
    <h1 class="text-2xl font-bold">Hello from Native WebView!</h1>
    <p class="text-slate-300 text-sm">
      This multi-file HTML app is running in an ultra-optimized Android wrapper.
    </p>

    <!-- AdMob Action Buttons -->
    <div class="space-y-2 pt-2">
      <button onclick="triggerInterstitial()" class="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition border border-slate-600 flex items-center justify-center gap-2">
        📺 Show Interstitial Ad
      </button>
      <button onclick="triggerRewarded()" class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium transition shadow-md shadow-emerald-700/30 flex items-center justify-center gap-2">
        🎁 Watch Rewarded Ad (+100 Points)
      </button>
    </div>

    <div id="rewardBox" class="hidden p-3 bg-emerald-950/60 border border-emerald-700 rounded-lg text-xs text-emerald-300">
      🎉 Reward Granted: You received +100 Points!
    </div>
  </div>

  <script src="script.js"></script>
</body>
</html>`,
    size: '1.2 KB'
  },
  {
    name: 'style.css',
    type: 'text/css',
    content: `/* Custom App Styling */
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}`,
    size: '150 B'
  },
  {
    name: 'script.js',
    type: 'text/javascript',
    content: `// AdMob Bridge Handlers
function triggerInterstitial() {
  if (window.AndroidBridge && window.AndroidBridge.showInterstitial) {
    window.AndroidBridge.showInterstitial();
  } else {
    alert("[Dev Preview] Interstitial Ad triggered!");
  }
}

function triggerRewarded() {
  if (window.AndroidBridge && window.AndroidBridge.showRewarded) {
    window.AndroidBridge.showRewarded();
  } else {
    alert("[Dev Preview] Rewarded Ad triggered!");
    onRewardGranted();
  }
}

function onRewardGranted() {
  const box = document.getElementById('rewardBox');
  if (box) box.classList.remove('hidden');
}`,
    size: '420 B'
  }
];

let activeFileName = 'index.html';
let recentAppsHistory = [];

// Load local backup history on boot
try {
  const localData = localStorage.getItem('apk_builder_local_history');
  if (localData) {
    recentAppsHistory = JSON.parse(localData);
    renderHistoryList(recentAppsHistory);
  }
} catch (e) {
  console.warn("Local storage parse error:", e);
}

// Tab Switching Mechanism
function switchTab(tabId) {
  const tabs = ['assets', 'config', 'admob', 'optimizer', 'history'];
  tabs.forEach(t => {
    const content = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (!content || !btn) return;
    
    if (t === tabId || (t === 'assets' && tabId === 'html-assets')) {
      content.classList.remove('hidden');
      btn.classList.add('text-indigo-400', 'border-indigo-500');
      btn.classList.remove('text-slate-400', 'border-transparent');
    } else {
      content.classList.add('hidden');
      btn.classList.remove('text-indigo-400', 'border-indigo-500');
      btn.classList.add('text-slate-400', 'border-transparent');
    }
  });
}

// Multi-file Upload Handler
function handleMultipleFileUpload(event) {
  const files = Array.from(event.target.files);
  if (!files || files.length === 0) return;

  files.forEach((file) => {
    const reader = new FileReader();
    const isText = file.type.startsWith('text/') || file.name.endsWith('.html') || file.name.endsWith('.js') || file.name.endsWith('.css') || file.name.endsWith('.json');
    
    if (isText) {
      reader.onload = (e) => {
        addOrUpdateFileInProject(file.name, file.type, e.target.result, formatBytes(file.size));
      };
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        addOrUpdateFileInProject(file.name, file.type, e.target.result, formatBytes(file.size), true);
      };
      reader.readAsDataURL(file); // base64 for images / binary assets
    }
  });
}

function addOrUpdateFileInProject(name, type, content, size, isBase64 = false) {
  const existingIndex = projectFiles.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
  const fileObj = { name, type, content, size, isBase64 };

  if (existingIndex >= 0) {
    projectFiles[existingIndex] = fileObj;
  } else {
    projectFiles.push(fileObj);
  }

  // Set as active editing file
  activeFileName = name;
  renderProjectFilesList();
  loadActiveFileIntoEditor();
  updatePreview();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Render dynamic list data of files uploaded
function renderProjectFilesList() {
  const listContainer = document.getElementById('projectFilesList');
  if (!listContainer) return;

  listContainer.innerHTML = projectFiles.map((file) => {
    const isActive = file.name === activeFileName;
    return `
      <div class="px-4 py-2 flex items-center justify-between text-xs hover:bg-slate-900/80 transition ${isActive ? 'bg-indigo-950/40 border-l-2 border-indigo-500' : ''}">
        <div class="flex items-center space-x-2.5">
          <i data-lucide="${getFileIcon(file.name)}" class="w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}"></i>
          <div>
            <p class="font-medium text-slate-200 cursor-pointer hover:underline" onclick="selectFileToEdit('${escapeHtml(file.name)}')">
              ${escapeHtml(file.name)}
              ${file.name === 'index.html' ? '<span class="ml-1.5 text-[9px] bg-indigo-900/80 text-indigo-300 px-1.5 py-0.2 rounded">ENTRY POINT</span>' : ''}
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <span class="text-[11px] text-slate-500 font-mono">${file.size || '1 KB'}</span>
          <div class="flex items-center space-x-1">
            <button onclick="selectFileToEdit('${escapeHtml(file.name)}')" class="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200" title="Edit File">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            ${file.name !== 'index.html' ? `
              <button onclick="deleteProjectFile('${escapeHtml(file.name)}')" class="p-1 hover:bg-rose-950 rounded text-slate-400 hover:text-rose-400" title="Delete File">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function getFileIcon(filename) {
  if (filename.endsWith('.html')) return 'file-code';
  if (filename.endsWith('.css')) return 'file-type-2';
  if (filename.endsWith('.js')) return 'file-json';
  if (filename.match(/\.(png|jpg|jpeg|gif|svg)$/i)) return 'image';
  return 'file-text';
}

function selectFileToEdit(filename) {
  activeFileName = filename;
  renderProjectFilesList();
  loadActiveFileIntoEditor();
}

function deleteProjectFile(filename) {
  if (filename === 'index.html') return;
  projectFiles = projectFiles.filter(f => f.name !== filename);
  if (activeFileName === filename) {
    activeFileName = 'index.html';
  }
  renderProjectFilesList();
  loadActiveFileIntoEditor();
  updatePreview();
}

function loadActiveFileIntoEditor() {
  const file = projectFiles.find(f => f.name === activeFileName);
  const editor = document.getElementById('activeFileCodeEditor');
  const label = document.getElementById('currentEditingFileLabel');

  if (label) label.innerHTML = `<i data-lucide="file-code" class="w-3.5 h-3.5"></i> Editing: ${escapeHtml(activeFileName)}`;

  if (editor && file) {
    if (file.isBase64) {
      editor.value = `/* Binary / Image File: ${file.name} (${file.size}) */`;
      editor.disabled = true;
    } else {
      editor.value = file.content || '';
      editor.disabled = false;
    }
  }
  if (window.lucide) lucide.createIcons();
}

function saveCurrentEditorContent() {
  const file = projectFiles.find(f => f.name === activeFileName);
  const editor = document.getElementById('activeFileCodeEditor');
  if (file && editor && !file.isBase64) {
    file.content = editor.value;
    file.size = formatBytes(new Blob([file.content]).size);
    updatePreview();
  }
}

// Update Live Preview Iframe with All Local Files
function updatePreview() {
  const indexFile = projectFiles.find(f => f.name === 'index.html');
  const iframe = document.getElementById('previewFrame');
  if (!iframe || !indexFile) return;

  let htmlContent = indexFile.content;

  // Inline linked CSS and JS files for local preview simulation
  projectFiles.forEach(file => {
    if (file.name.endsWith('.css') && !file.isBase64) {
      htmlContent = htmlContent.replace(
        new RegExp(`<link[^>]*href=["']${file.name}["'][^>]*>`, 'gi'),
        `<style>${file.content}</style>`
      );
    }
    if (file.name.endsWith('.js') && !file.isBase64) {
      htmlContent = htmlContent.replace(
        new RegExp(`<script[^>]*src=["']${file.name}["'][^>]*>\\s*</script>`, 'gi'),
        `<script>${file.content}</script>`
      );
    }
  });

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  const bannerEnabled = document.getElementById('enableBanner').checked;
  const mockBanner = document.getElementById('mockBannerAd');
  if (mockBanner) {
    mockBanner.style.display = bannerEnabled ? 'flex' : 'none';
  }
}

// Fill Official AdMob Test IDs
function fillGoogleTestIds() {
  document.getElementById('admobAppId').value = "ca-app-pub-3940256099942544~3347511713";
  document.getElementById('bannerUnitId').value = "ca-app-pub-3940256099942544/6300978111";
  document.getElementById('interstitialUnitId').value = "ca-app-pub-3940256099942544/1033173712";
  document.getElementById('rewardedUnitId').value = "ca-app-pub-3940256099942544/5224354917";
  alert("✅ Official Google AdMob test IDs loaded!");
}

// Minify HTML function
function minifyHTML(code) {
  return code
    .replace(/\<\!--[\s\S]*?--\>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

// Firebase Realtime Listener
function listenToHistoryUpdates() {
  if (!db) return;
  const historyRef = db.ref(`created_apps/${deviceId}`);
  historyRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      recentAppsHistory = Object.keys(data).map(key => ({
        firebaseKey: key,
        ...data[key]
      })).sort((a, b) => b.timestamp - a.timestamp);
      
      localStorage.setItem('apk_builder_local_history', JSON.stringify(recentAppsHistory));
      renderHistoryList(recentAppsHistory);
    } else if (recentAppsHistory.length === 0) {
      renderHistoryList([]);
    }
  }, (err) => {
    console.warn("Firebase read fallback:", err);
    renderHistoryList(recentAppsHistory);
  });
}

function saveAppToHistory(appConfig) {
  recentAppsHistory.unshift(appConfig);
  localStorage.setItem('apk_builder_local_history', JSON.stringify(recentAppsHistory));
  renderHistoryList(recentAppsHistory);

  if (db) {
    try {
      db.ref(`created_apps/${deviceId}`).push(appConfig);
    } catch (e) {
      console.warn("Firebase push error:", e);
    }
  }
}

// Render Recent Created Apps List
function renderHistoryList(apps) {
  const container = document.getElementById('historyAppList');
  const badgeCount = document.getElementById('historyBadgeCount');
  if (badgeCount) badgeCount.textContent = apps.length;

  if (!container) return;

  if (apps.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 bg-slate-950/40 rounded-xl border border-slate-800">
        <i data-lucide="package-open" class="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
        <p class="text-xs font-medium text-slate-400">No recent created apps found</p>
        <p class="text-[11px] text-slate-500 mt-1">Build an app package to start saving history here!</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = apps.map((app, index) => `
    <div class="p-4 bg-slate-950/80 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition shadow-sm space-y-3">
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-lg bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400 font-bold text-sm">
            ${app.appName ? app.appName.charAt(0).toUpperCase() : 'A'}
          </div>
          <div>
            <h3 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
              ${escapeHtml(app.appName)}
              <span class="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">v${escapeHtml(app.appVersion)}</span>
            </h3>
            <p class="text-xs text-slate-400 font-mono">${escapeHtml(app.appPackage)}</p>
          </div>
        </div>

        <span class="text-[10px] text-slate-500 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
          ${app.createdAt || 'Recent'}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span class="inline-flex items-center gap-1 bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 px-2 py-0.5 rounded">
          <i data-lucide="folder-code" class="w-3 h-3 text-amber-400"></i> ${app.filesCount || 1} Assets
        </span>
        ${app.enableBanner ? '<span class="bg-slate-900 text-emerald-400 border border-slate-800 px-2 py-0.5 rounded">Banner</span>' : ''}
        ${app.enableInterstitial ? '<span class="bg-slate-900 text-indigo-400 border border-slate-800 px-2 py-0.5 rounded">Interstitial</span>' : ''}
        ${app.enableRewarded ? '<span class="bg-slate-900 text-violet-400 border border-slate-800 px-2 py-0.5 rounded">Rewarded</span>' : ''}
      </div>

      <div class="flex items-center justify-end space-x-2 pt-1 border-t border-slate-900">
        <button onclick="loadHistoryConfig(${index})" class="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition flex items-center gap-1">
          <i data-lucide="edit-3" class="w-3 h-3"></i> Load Config
        </button>
        <button onclick="reDownloadHistoryAPK(${index})" class="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition shadow flex items-center gap-1">
          <i data-lucide="download" class="w-3 h-3"></i> Download APK Package
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function clearAllHistory() {
  if (!confirm("Are you sure you want to clear your recent created apps history?")) return;
  recentAppsHistory = [];
  localStorage.removeItem('apk_builder_local_history');
  if (db) {
    try { db.ref(`created_apps/${deviceId}`).remove(); } catch (e) {}
  }
  renderHistoryList([]);
}

function loadHistoryConfig(index) {
  const item = recentAppsHistory[index];
  if (!item) return;

  document.getElementById('appName').value = item.appName || '';
  document.getElementById('appPackage').value = item.appPackage || '';
  document.getElementById('appVersion').value = item.appVersion || '1.0.0';
  document.getElementById('appVersionCode').value = item.appVersionCode || 1;
  document.getElementById('appOrientation').value = item.orientation || 'portrait';
  document.getElementById('admobAppId').value = item.admobAppId || '';
  document.getElementById('bannerUnitId').value = item.bannerId || '';
  document.getElementById('interstitialUnitId').value = item.interstitialId || '';
  document.getElementById('rewardedUnitId').value = item.rewardedId || '';
  document.getElementById('enableBanner').checked = !!item.enableBanner;
  document.getElementById('enableInterstitial').checked = !!item.enableInterstitial;
  document.getElementById('enableRewarded').checked = !!item.enableRewarded;

  if (item.projectFiles && item.projectFiles.length > 0) {
    projectFiles = item.projectFiles;
  }

  activeFileName = 'index.html';
  renderProjectFilesList();
  loadActiveFileIntoEditor();
  updatePreview();
  switchTab('html-assets');
  alert(`✅ Configuration loaded for "${item.appName}"`);
}

function reDownloadHistoryAPK(index) {
  loadHistoryConfig(index);
  buildAndDownloadAPK();
}

// Core Builder - Packages all Multi-File Assets & Android Source Code
async function buildAndDownloadAPK() {
  const zip = new JSZip();

  const appName = document.getElementById('appName').value.trim() || "Free GCash Rewards";
  const appPackage = document.getElementById('appPackage').value.trim() || "com.freegcash.adsapp";
  const appVersion = document.getElementById('appVersion').value.trim() || "1.0.0";
  const appVersionCode = document.getElementById('appVersionCode').value.trim() || "1";
  const orientation = document.getElementById('appOrientation').value;
  const admobAppId = document.getElementById('admobAppId').value.trim();
  const bannerId = document.getElementById('bannerUnitId').value.trim();
  const interstitialId = document.getElementById('interstitialUnitId').value.trim();
  const rewardedId = document.getElementById('rewardedUnitId').value.trim();
  
  const enableBanner = document.getElementById('enableBanner').checked;
  const enableInterstitial = document.getElementById('enableInterstitial').checked;
  const enableRewarded = document.getElementById('enableRewarded').checked;
  const doMinify = document.getElementById('minifySource').checked;

  // Save current editor input before build
  saveCurrentEditorContent();

  // Save record to Firebase & Local History
  const historyPayload = {
    id: Date.now().toString(),
    appName,
    appPackage,
    appVersion,
    appVersionCode,
    orientation,
    admobAppId,
    bannerId,
    interstitialId,
    rewardedId,
    enableBanner,
    enableInterstitial,
    enableRewarded,
    filesCount: projectFiles.length,
    projectFiles,
    createdAt: new Date().toLocaleString(),
    timestamp: Date.now(),
    estimatedSize: "~1.8 MB"
  };

  saveAppToHistory(historyPayload);

  const packagePath = appPackage.replace(/\./g, '/');

  // Add all project assets into assets/www/
  projectFiles.forEach(file => {
    let fileContent = file.content;
    if (doMinify && file.name.endsWith('.html') && !file.isBase64) {
      fileContent = minifyHTML(fileContent);
    }

    if (file.isBase64) {
      const base64Data = fileContent.split(',')[1] || fileContent;
      zip.file(`app/src/main/assets/www/${file.name}`, base64Data, { base64: true });
    } else {
      zip.file(`app/src/main/assets/www/${file.name}`, fileContent);
    }
  });

  // AndroidManifest.xml
  const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${appPackage}">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="${appName}"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:hardwareAccelerated="true"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="${admobAppId}"/>

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="${orientation}"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

  // Ultra-Light MainActivity.java
  const mainActivityJava = `package ${appPackage};

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

${enableBanner ? 'import com.google.android.gms.ads.AdRequest;\nimport com.google.android.gms.ads.AdSize;\nimport com.google.android.gms.ads.AdView;' : ''}
${enableInterstitial ? 'import com.google.android.gms.ads.interstitial.InterstitialAd;\nimport com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;' : ''}
${enableRewarded ? 'import com.google.android.gms.ads.rewarded.RewardedAd;\nimport com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;\nimport com.google.android.gms.ads.OnUserEarnedRewardListener;' : ''}
import com.google.android.gms.ads.MobileAds;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    ${enableBanner ? 'private AdView adView;' : ''}
    ${enableInterstitial ? 'private InterstitialAd interstitialAd;' : ''}
    ${enableRewarded ? 'private RewardedAd rewardedAd;' : ''}

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        MobileAds.initialize(this, initializationStatus -> {});

        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);

        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        webView.loadUrl("file:///android_asset/www/index.html");

        ${enableBanner ? 'setupBannerAd();' : ''}
        ${enableInterstitial ? 'loadInterstitial();' : ''}
        ${enableRewarded ? 'loadRewardedAd();' : ''}
    }

    ${enableBanner ? `
    private void setupBannerAd() {
        FrameLayout bannerContainer = findViewById(R.id.banner_container);
        adView = new AdView(this);
        adView.setAdUnitId("${bannerId}");
        adView.setAdSize(AdSize.BANNER);
        bannerContainer.addView(adView);
        AdRequest adRequest = new AdRequest.Builder().build();
        adView.loadAd(adRequest);
    }` : ''}

    ${enableInterstitial ? `
    private void loadInterstitial() {
        AdRequest adRequest = new AdRequest.Builder().build();
        InterstitialAd.load(this, "${interstitialId}", adRequest,
            new InterstitialAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    interstitialAd = ad;
                }
            });
    }` : ''}

    ${enableRewarded ? `
    private void loadRewardedAd() {
        AdRequest adRequest = new AdRequest.Builder().build();
        RewardedAd.load(this, "${rewardedId}", adRequest,
            new RewardedAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull RewardedAd ad) {
                    rewardedAd = ad;
                }
            });
    }` : ''}

    public class WebAppInterface {
        @JavascriptInterface
        public void showInterstitial() {
            ${enableInterstitial ? `
            runOnUiThread(() -> {
                if (interstitialAd != null) {
                    interstitialAd.show(MainActivity.this);
                    loadInterstitial();
                }
            });` : ''}
        }

        @JavascriptInterface
        public void showRewarded() {
            ${enableRewarded ? `
            runOnUiThread(() -> {
                if (rewardedAd != null) {
                    rewardedAd.show(MainActivity.this, (OnUserEarnedRewardListener) rewardItem -> {
                        webView.post(() -> webView.evaluateJavascript("if (typeof onRewardGranted === 'function') { onRewardGranted(); }", null));
                    });
                    loadRewardedAd();
                }
            });` : ''}
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;

  // build.gradle
  const buildGradle = `apply plugin: 'com.android.application'

android {
    compileSdkVersion 34
    defaultConfig {
        applicationId "${appPackage}"
        minSdkVersion 21
        targetSdkVersion 34
        versionCode ${appVersionCode}
        versionName "${appVersion}"

        ndk {
            abiFilters 'armeabi-v7a', 'arm64-v8a'
        }
    }

    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'com.google.android.gms:play-services-ads:23.0.0'
}
`;

  // Proguard rules
  const proguardRules = `-keepattributes *Annotation*
-dontwarn com.google.android.gms.**
-keep class com.google.android.gms.ads.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
`;

  // Layout XML
  const layoutXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1" />

    <FrameLayout
        android:id="@+id/banner_container"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_gravity="bottom" />
</LinearLayout>
`;

  zip.file(`app/src/main/AndroidManifest.xml`, manifestXml);
  zip.file(`app/src/main/java/${packagePath}/MainActivity.java`, mainActivityJava);
  zip.file(`app/src/main/res/layout/activity_main.xml`, layoutXml);
  zip.file(`app/build.gradle`, buildGradle);
  zip.file(`app/proguard-rules.pro`, proguardRules);

  const content = await zip.generateAsync({ type: "blob" });
  const sanitizedName = appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  // Download APK Package Archive
  saveAs(content, `${sanitizedName}-apk-package.zip`);
}

// Initial Boot Setup
document.addEventListener("DOMContentLoaded", () => {
  renderProjectFilesList();
  loadActiveFileIntoEditor();
  updatePreview();
  
  const enableBannerCb = document.getElementById('enableBanner');
  if (enableBannerCb) {
    enableBannerCb.addEventListener('change', (e) => {
      const mockBanner = document.getElementById('mockBannerAd');
      if (mockBanner) mockBanner.style.display = e.target.checked ? 'flex' : 'none';
    });
  }
});
