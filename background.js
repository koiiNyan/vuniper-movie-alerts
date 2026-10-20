// Handle notifications for new movies.
chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "NEW_MOVIE" || !message.movie) {
        return;
    }

    const movie = message.movie;
    const notificationId = `vuniper-${movie.id || Date.now()}`;
    const storageKey = `movieDetails_${notificationId}`;

    // Save movie information for the details window.
    chrome.storage.local.set({
        [storageKey]: movie
    }, () => {
        if (chrome.runtime.lastError) {
            console.error(
                "Could not save movie details:",
                chrome.runtime.lastError.message
            );
            return;
        }

        chrome.notifications.create(notificationId, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/icon.png"),
            title: movie.title || "New movie on Vuniper",
            message: `Rating: ${movie.rating || "Not available"}`,
            buttons: [
                { title: "Show more" }
            ],
            priority: 2
        }, (createdId) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Notification error:",
                    chrome.runtime.lastError.message
                );
            } else {
                console.log("Notification created:", createdId);
            }
        });
    });
});


// Open our extension's details window when Show more is clicked.
chrome.notifications.onButtonClicked.addListener(
    (notificationId, buttonIndex) => {
        if (
            buttonIndex !== 0 ||
            !notificationId.startsWith("vuniper-")
        ) {
            return;
        }

        const storageKey = `movieDetails_${notificationId}`;

        chrome.storage.local.get(storageKey, (result) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Could not retrieve movie details:",
                    chrome.runtime.lastError.message
                );
                return;
            }

            const movie = result[storageKey];

            if (!movie) {
                console.error("Movie information was not found.");
                return;
            }

            const params = new URLSearchParams();
            params.set("key", storageKey);

            const detailsUrl =
                `${chrome.runtime.getURL("details.html")}?${params.toString()}`;

            // Open the extension window directly.
            // Do not open a Vuniper browser tab.
            chrome.windows.create({
                url: detailsUrl,
                type: "popup",
                width: 680,
                height: 700,
                focused: true
            }, (windowInfo) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Could not open movie details:",
                        chrome.runtime.lastError.message
                    );
                } else {
                    console.log(
                        "Movie details window opened:",
                        windowInfo.id
                    );
                }
            });
        });
    }
);

console.log("Vuniper Movie Alerts: background started");

// Background scanning configuration.
const SCAN_ALARM_NAME = "vuniper-background-scan";
const SCAN_TIMEOUT_ALARM = "vuniper-background-scan-timeout";
const SCAN_RETRY_ALARM = "vuniper-background-scan-retry";

const ACTIVE_SCAN_KEY = "vuniperActiveScan";

// Check every 30 minutes to reduce unnecessary site traffic.
const SCAN_INTERVAL_MINUTES = 30;

let scanLaunchInProgress = false;


// Promise wrappers for Chrome APIs.
function getAllWindowsAsync() {
    return new Promise((resolve, reject) => {
        chrome.windows.getAll({ populate: false }, windows => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
            } else {
                resolve(windows);
            }
        });
    });
}

function createTabAsync(options) {
    return new Promise((resolve, reject) => {
        chrome.tabs.create(options, tab => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
            } else {
                resolve(tab);
            }
        });
    });
}

function createWindowAsync(options) {
    return new Promise((resolve, reject) => {
        chrome.windows.create(options, windowInfo => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
            } else {
                resolve(windowInfo);
            }
        });
    });
}

function getWindowTabsAsync(windowId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ windowId }, tabs => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
            } else {
                resolve(tabs);
            }
        });
    });
}

function clearAlarmAsync(name) {
    return new Promise(resolve => {
        chrome.alarms.clear(name, () => resolve());
    });
}


// Close the exact tab or temporary window created for a scan.
function closeScanSurface(scan) {
    return new Promise(resolve => {
        if (
            scan.container === "window" &&
            Number.isInteger(scan.windowId)
        ) {
            chrome.windows.remove(scan.windowId, () => {
                if (chrome.runtime.lastError) {
                    console.warn(
                        "Could not close scan window:",
                        chrome.runtime.lastError.message
                    );
                }

                resolve();
            });

            return;
        }

        if (Number.isInteger(scan.tabId)) {
            chrome.tabs.remove(scan.tabId, () => {
                if (chrome.runtime.lastError) {
                    console.warn(
                        "Could not close scan tab:",
                        chrome.runtime.lastError.message
                    );
                }

                resolve();
            });

            return;
        }

        resolve();
    });
}


// Build a URL that tells content.js to perform a background scan.
function buildScanUrl(scanId, container) {
    const url = new URL("https://vuniper.com/movies/");

    const scanParams = new URLSearchParams({
        __vuniper_scan: "1",
        __vuniper_scan_id: scanId,
        __vuniper_container: container
    });

    url.hash = scanParams.toString();

    return url.toString();
}


// Create the actual background scan.
async function startBackgroundScan() {
    if (scanLaunchInProgress) {
        return;
    }

    scanLaunchInProgress = true;

    try {
        // Avoid starting a duplicate scan.
        const stored = await chrome.storage.local.get(ACTIVE_SCAN_KEY);
        const previousScan = stored[ACTIVE_SCAN_KEY];

        if (previousScan) {
            const scanAge = Date.now() - previousScan.startedAt;

            if (scanAge < 3 * 60 * 1000) {
                console.log("A background scan is already running.");
                return;
            }

            // Clean up a previous scan that did not finish.
            await closeScanSurface(previousScan);

            await chrome.storage.local.remove(ACTIVE_SCAN_KEY);
            await clearAlarmAsync(SCAN_TIMEOUT_ALARM);
        }

        const scanId =
            `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        const windows = await getAllWindowsAsync();

        // Prefer an existing browser window, without activating it.
        const normalWindow =
            windows.find(windowInfo =>
                windowInfo.type === "normal" &&
                windowInfo.state !== "minimized"
            ) ||
            windows.find(windowInfo =>
                windowInfo.type === "normal"
            );

        let scan;

        if (normalWindow) {
            // Add a temporary inactive tab to an existing window.
            const tab = await createTabAsync({
                url: buildScanUrl(scanId, "tab"),
                windowId: normalWindow.id,
                active: false
            });

            scan = {
                scanId,
                container: "tab",
                tabId: tab.id,
                windowId: tab.windowId,
                startedAt: Date.now()
            };
        } else {
            // If there are no normal windows, use a minimized window.
            const windowInfo = await createWindowAsync({
                url: buildScanUrl(scanId, "window"),
                type: "normal",
                state: "minimized",
                focused: false
            });

            const tabs = await getWindowTabsAsync(windowInfo.id);

            const scanTab =
                tabs.find(tab => tab.url?.includes(scanId)) ||
                tabs[0];

            scan = {
                scanId,
                container: "window",
                tabId: scanTab?.id ?? null,
                windowId: windowInfo.id,
                startedAt: Date.now()
            };
        }

        // Store enough information to clean up if the worker restarts.
        await chrome.storage.local.set({
            [ACTIVE_SCAN_KEY]: scan
        });

        // Prevent a failed scan from leaving a tab/window open indefinitely.
        chrome.alarms.create(SCAN_TIMEOUT_ALARM, {
            delayInMinutes: 2
        });

        console.log("Background scan started:", scan.scanId);
    } catch (error) {
        console.error("Could not start background scan:", error);

        // Retry a failed launch later.
        chrome.alarms.create(SCAN_RETRY_ALARM, {
            delayInMinutes: 15
        });
    } finally {
        scanLaunchInProgress = false;
    }
}


// Handle the completion message sent by content.js.
chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (message.type !== "BACKGROUND_SCAN_COMPLETE") {
            return false;
        }
        console.log("Background scan report:", {
            success: message.success,
            pageUrl: sender.url,
            diagnostics: message.diagnostics
        });

        (async () => {
            const stored =
                await chrome.storage.local.get(ACTIVE_SCAN_KEY);

            const scan = stored[ACTIVE_SCAN_KEY];

            // Ignore messages from scans that are no longer active.
            if (!scan || scan.scanId !== message.scanId) {
                sendResponse({
                    ok: false,
                    reason: "Scan not found"
                });

                return;
            }

            if (
                sender.tab &&
                Number.isInteger(scan.tabId) &&
                sender.tab.id !== scan.tabId
            ) {
                sendResponse({
                    ok: false,
                    reason: "Unexpected scan tab"
                });

                return;
            }

            // Remove the saved state before closing the source page.
            await chrome.storage.local.remove(ACTIVE_SCAN_KEY);
            await clearAlarmAsync(SCAN_TIMEOUT_ALARM);

            sendResponse({ ok: true });

            await closeScanSurface(scan);

            console.log(
                "Background scan finished:",
                message.success ? "success" : "failed"
            );

            if (!message.success) {
                chrome.alarms.create(SCAN_RETRY_ALARM, {
                    delayInMinutes: 15
                });
            }
        })().catch(error => {
            console.error("Could not finish background scan:", error);

            try {
                sendResponse({ ok: false });
            } catch {
                // The response channel may already be closed.
            }
        });

        // Keep the message channel open for sendResponse.
        return true;
    }
);


// Clean up if a scan never reports completion.
async function handleScanTimeout() {
    const stored = await chrome.storage.local.get(ACTIVE_SCAN_KEY);
    const scan = stored[ACTIVE_SCAN_KEY];

    if (!scan) {
        return;
    }

    await chrome.storage.local.remove(ACTIVE_SCAN_KEY);
    await closeScanSurface(scan);

    console.warn("Background scan timed out.");

    chrome.alarms.create(SCAN_RETRY_ALARM, {
        delayInMinutes: 15
    });
}


// Create a persistent periodic alarm if one does not exist.
function ensureBackgroundScanAlarm() {
    chrome.alarms.get(SCAN_ALARM_NAME, alarm => {
        // Keep the existing alarm if its interval is already correct.
        if (
            alarm &&
            alarm.periodInMinutes === SCAN_INTERVAL_MINUTES
        ) {
            console.log(
                `Background scan interval: ${SCAN_INTERVAL_MINUTES} minutes`
            );
            return;
        }

        // Replace an outdated alarm.
        chrome.alarms.clear(SCAN_ALARM_NAME, () => {
            chrome.alarms.create(SCAN_ALARM_NAME, {
                delayInMinutes: SCAN_INTERVAL_MINUTES,
                periodInMinutes: SCAN_INTERVAL_MINUTES
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Could not schedule background scan:",
                        chrome.runtime.lastError.message
                    );
                } else {
                    console.log(
                        `Background scan scheduled every ${SCAN_INTERVAL_MINUTES} minutes`
                    );
                }
            });
        });
    });
}


// Scan on browser startup and extension installation/update.
chrome.runtime.onStartup.addListener(() => {
    ensureBackgroundScanAlarm();
    startBackgroundScan();
});

chrome.runtime.onInstalled.addListener(() => {
    ensureBackgroundScanAlarm();
    startBackgroundScan();
});


// Run scheduled scans and cleanup/retry jobs.
chrome.alarms.onAlarm.addListener(alarm => {
    if (
        alarm.name === SCAN_ALARM_NAME ||
        alarm.name === SCAN_RETRY_ALARM
    ) {
        startBackgroundScan();
    } else if (alarm.name === SCAN_TIMEOUT_ALARM) {
        handleScanTimeout().catch(error => {
            console.error("Scan cleanup failed:", error);
        });
    }
});

console.log("Vuniper background scanning configured");