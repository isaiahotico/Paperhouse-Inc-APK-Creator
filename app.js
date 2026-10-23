// ======================================================
// HTML to APK Studio - Engine & Firebase History System
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

// Initialize Firebase Realtime Database
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

// Global list memory
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

// Update Live Preview Iframe
function updatePreview() {
  const source = document.getElementById('htmlSourceCode').value;
  const iframe = document.getElementById('previewFrame');
  if (!iframe) return;
  
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(source);
  doc.close();

  const bannerEnabled = document.getElementById('enableBanner').checked;
  const mockBanner = document.getElementById('mockBannerAd');
  if (mockBanner) {
    mockBanner.style.display = bannerEnabled ? 'flex' : 'none';
  }
}

// Handle File Upload into Editor
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('htmlSourceCode').value = e.target.result;
    updatePreview();
  };
  reader.readAsText(file);
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

// Listen to Realtime Database updates from Firebase
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
      
      // Sync to local storage
      localStorage.setItem('apk_builder_local_history', JSON.stringify(recentAppsHistory));
      renderHistoryList(recentAppsHistory);
    } else if (recentAppsHistory.length === 0) {
      renderHistoryList([]);
    }
  }, (err) => {
    console.warn("Firebase read error, using local history", err);
    renderHistoryList(recentAppsHistory);
  });
}

// Save app entry to Firebase Database & Local Storage
function saveAppToHistory(appConfig) {
  // 1. Local Array update
  recentAppsHistory.unshift(appConfig);
  localStorage.setItem('apk_builder_local_history', JSON.stringify(recentAppsHistory));
  renderHistoryList(recentAppsHistory);

  // 2. Firebase Database Push
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
          <i data-lucide="zap" class="w-3 h-3 text-amber-400"></i> ${app.estimatedSize || '~1.8 MB'}
        </span>
        ${app.enableBanner ? '<span class="bg-slate-900 text-emerald-400 border border-slate-800 px-2 py-0.5 rounded">Banner</span>' : ''}
        ${app.enableInterstitial ? '<span class="bg-slate-900 text-indigo-400 border border-slate-800 px-2 py-0.5 rounded">Interstitial</span>' : ''}
        ${app.enableRewarded ? '<span class="bg-slate-900 text-violet-400 border border-slate-800 px-2 py-0.5 rounded">Rewarded</span>' : ''}
      </div>

      <div class="flex items-center justify-end space-x-2 pt-1 border-t border-slate-900">
        <button onclick="loadHistoryConfig(${index})" class="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition flex items-center gap-1">
          <i data-lucide="edit-3" class="w-3 h-3"></i> Load Config
        </button>
        <button onclick="reDownloadHistoryZip(${index})" class="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition shadow flex items-center gap-1">
          <i data-lucide="download" class="w-3 h-3"></i> Re-Download APK ZIP
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

// Clear History
function clearAllHistory() {
  if (!confirm("Are you sure you want to clear your recent created apps history?")) return;
  recentAppsHistory = [];
  localStorage.removeItem('apk_builder_local_history');
  if (db) {
    try {
      db.ref(`created_apps/${deviceId}`).remove();
    } catch (e) { console.warn(e); }
  }
  renderHistoryList([]);
}

// Load Config from history back into UI
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

  if (item.htmlSource) {
    document.getElementById('htmlSourceCode').value = item.htmlSource;
  }

  updatePreview();
  switchTab('html-assets');
  alert(`✅ Configuration loaded for "${item.appName}"`);
}

// Re-Download ZIP from history item
function reDownloadHistoryZip(index) {
  const item = recentAppsHistory[index];
  if (!item) return;
  
  // Fill inputs temporarily & generate
  loadHistoryConfig(index);
  generateProjectZip();
}

// Main Build Engine - Generates JSZip Project File
async function generateProjectZip() {
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

  let htmlSource = document.getElementById('htmlSourceCode').value;
  if (doMinify) {
    htmlSource = minifyHTML(htmlSource);
  }

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
    htmlSource,
    createdAt: new Date().toLocaleString(),
    timestamp: Date.now(),
    estimatedSize: "~1.8 MB"
  };

  saveAppToHistory(historyPayload);

  // Convert package path
  const packagePath = appPackage.replace(/\./g, '/');

  // 1. AndroidManifest.xml
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

        <!-- Google AdMob App ID -->
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

  // 2. Ultra-Light MainActivity.java
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

  // 3. build.gradle
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

  // 4. Proguard rules
  const proguardRules = `-keepattributes *Annotation*
-dontwarn com.google.android.gms.**
-keep class com.google.android.gms.ads.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
`;

  // 5. Layout XML
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

  // Zip packaging
  zip.file(`app/src/main/assets/www/index.html`, htmlSource);
  zip.file(`app/src/main/AndroidManifest.xml`, manifestXml);
  zip.file(`app/src/main/java/${packagePath}/MainActivity.java`, mainActivityJava);
  zip.file(`app/src/main/res/layout/activity_main.xml`, layoutXml);
  zip.file(`app/build.gradle`, buildGradle);
  zip.file(`app/proguard-rules.pro`, proguardRules);

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `${appName.toLowerCase().replace(/\s+/g, '_')}-package.zip`);
}

// Initial Boot Setup
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  updatePreview();
  
  const enableBannerCb = document.getElementById('enableBanner');
  if (enableBannerCb) {
    enableBannerCb.addEventListener('change', (e) => {
      const mockBanner = document.getElementById('mockBannerAd');
      if (mockBanner) mockBanner.style.display = e.target.checked ? 'flex' : 'none';
    });
  }
});
