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