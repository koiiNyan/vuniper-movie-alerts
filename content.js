console.log("[Vuniper Movie Alerts] Extension context:", {
    url: window.location.href,
    chromeAvailable: typeof chrome !== "undefined",
    runtimeAvailable:
        typeof chrome !== "undefined" &&
        Boolean(chrome.runtime),
    sendMessageAvailable:
        typeof chrome !== "undefined" &&
        typeof chrome.runtime?.sendMessage === "function"
});

function getMovies() {
    const sections = [
        ".Gallery.movies.web.grid.posters",
        ".Gallery.movies.gems.grid.posters"
    ];

    const movies = [];

    for (const selector of sections) {
        const section = document.querySelector(selector);

        if (!section) {
            console.log("Section not found:", selector);
            continue;
        }

        const items = [
            ...section.querySelectorAll(".Item[data-uid]")
        ];

        console.log(
            "Movies found in section:",
            selector,
            items.length
        );

        for (const item of items) {
            const id = item.dataset.uid;

            const title = item
                .querySelector(".title")
                ?.textContent.trim();

            const posterElement = item.querySelector("img");

            const poster = posterElement?.currentSrc
                || posterElement?.src
                || "";

            const date = item
                .querySelector(".subtitle p")
                ?.textContent.trim() || "";

            const ratingText = item
                .querySelector(".score-container")
                ?.textContent || "";

            const rating = ratingText
                .replace(/\s+/g, " ")
                .replace(/^[\s·•●]+/, "")
                .trim();

            if (!id || !title) {
                continue;
            }

            movies.push({
                id,
                title,
                poster,
                date,
                rating,
                url: `https://vuniper.com/movies/web?id=${encodeURIComponent(id)}`
            });
        }
    }

    // Avoid duplicate notifications if a movie appears in both sections.
    const uniqueMovies = new Map();

    for (const movie of movies) {
        if (!uniqueMovies.has(movie.id)) {
            uniqueMovies.set(movie.id, movie);
        }
    }

    return [...uniqueMovies.values()];
}

// Wait until a condition becomes true.
async function waitForCondition(condition, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (condition()) {
            return true;
        }

        await wait(250);
    }

    return false;
}


// Extract movie details by opening the movie in the current tab.
async function scrapeMovieDetailsFromCurrentPage(movie) {
    const originalUrl = window.location.href;

    const item = [
        ...document.querySelectorAll(".Item[data-uid]")
    ].find(element => element.dataset.uid === movie.id);

    if (!item) {
        throw new Error(
            `Could not find movie card: ${movie.title}`
        );
    }

    try {
        // Open the movie through Vuniper's own interface.
        const clickTarget =
            item.querySelector(".PosterItem") || item;

        clickTarget.click();

        const detailsOpened = await waitForCondition(
            () => Boolean(
                document.querySelector(".media-viewer-subtitle")
            ),
            15000
        );

        if (!detailsOpened) {
            throw new Error(
                `Movie details did not open: ${movie.title}`
            );
        }

        // Read year, genres, and runtime.
        const metadataText = document
            .querySelector(".media-viewer-subtitle")
            ?.textContent.trim() || "";

        const metadataParts = metadataText
            .split("|")
            .map(part => part.trim());

        // Expand the description if it is collapsed.
        let descriptionElement = document.querySelector(
            "#media-viewer-description"
        );

        if (descriptionElement) {
            const showMoreButton = [
                ...descriptionElement.querySelectorAll("button")
            ].find(button =>
                button.textContent.trim().toLowerCase() === "show more"
            );

            if (showMoreButton) {
                showMoreButton.click();
                await wait(200);
            }
        }

        // Copy the description without its Show more/Show less button.
        descriptionElement = document.querySelector(
            "#media-viewer-description"
        );

        let description = "";

        if (descriptionElement) {
            const copy = descriptionElement.cloneNode(true);

            copy.querySelectorAll("button").forEach(button => {
                button.remove();
            });

            description = copy.textContent
                .replace(/\s+/g, " ")
                .trim();
        }

        return {
            year: metadataParts[0] || "",
            genres: metadataParts[1] || "",
            runtime: metadataParts[2] || "",
            description
        };
    } finally {
        // Return to the movie list in the same tab.
        if (
            window.location.href !== originalUrl ||
            document.querySelector(".media-viewer-subtitle")
        ) {
            window.history.back();

            const returnedToList = await waitForCondition(
                () =>
                    window.location.pathname.startsWith("/movies") &&
                    !document.querySelector(".media-viewer-subtitle") &&
                    Boolean(
                        document.querySelector(
                            ".Gallery.movies.web.grid.posters"
                        )
                    ),
                10000
            );

            if (!returnedToList) {
                console.warn(
                    "Could not confirm return to the movie list."
                );
            }
        }
    }
}

async function saveMovies() {
    const movies = getMovies();

    if (movies.length === 0) {
        console.log("No movies found. Storage was not changed.");

        return {
            scannedCount: 0,
            newCount: 0
        };
    }

    const result = await chrome.storage.local.get("knownMovieIds");
    const knownMovieIds = result.knownMovieIds;

    // On the first run, save existing movies as the baseline.
    if (!Array.isArray(knownMovieIds)) {
        const ids = movies.map(movie => movie.id);

        await chrome.storage.local.set({
            knownMovieIds: ids
        });

        console.log(
            "First run: saved",
            ids.length,
            "existing movies."
        );

        return {
            firstRun: true,
            scannedCount: movies.length,
            newCount: 0
        };
    }

    // Identify genuinely new movies.
    const newMovies = movies.filter(
        movie => !knownMovieIds.includes(movie.id)
    );

    console.log("Known movies:", knownMovieIds.length);
    console.log("New movies:", newMovies);

    const enrichedMovies = [];

    // Fetch detailed information only for new movies.
    // All retrieval happens in the existing scanning tab.
    for (const movie of newMovies) {
        let movieForNotification = { ...movie };

        try {
            console.log(
                "Retrieving details for:",
                movie.title
            );

            const details =
                await scrapeMovieDetailsFromCurrentPage(movie);

            movieForNotification = {
                ...movie,
                ...details
            };

            console.log(
                "Movie details retrieved:",
                movie.title,
                {
                    year: details.year,
                    genres: details.genres,
                    runtime: details.runtime,
                    description: details.description
                }
            );
        } catch (error) {
            // Still notify the user if detailed information is unavailable.
            console.warn(
                "Could not retrieve detailed information for:",
                movie.title,
                error
            );
        }

        // Send the movie to the existing notification handler.
        chrome.runtime.sendMessage({
            type: "NEW_MOVIE",
            movie: movieForNotification
        });

        enrichedMovies.push(movieForNotification);
    }

    // Remember all movies found during this scan.
    const updatedIds = [
        ...new Set([
            ...knownMovieIds,
            ...movies.map(movie => movie.id)
        ])
    ];

    await chrome.storage.local.set({
        knownMovieIds: updatedIds
    });

    console.log(
        "Movie scan summary:",
        {
            scannedCount: movies.length,
            newCount: newMovies.length,
            detailedCount: enrichedMovies.filter(
                movie => movie.year ||
                         movie.genres ||
                         movie.runtime ||
                         movie.description
            ).length
        }
    );

    return {
        scannedCount: movies.length,
        newCount: newMovies.length
    };
}

// Identify a background scan by its URL parameters.
const scanParams = new URLSearchParams(
    window.location.hash.slice(1)
);

const isBackgroundScan =
    scanParams.get("__vuniper_scan") === "1";

const scanId = scanParams.get("__vuniper_scan_id");

const scanContainer =
    scanParams.get("__vuniper_container") || "tab";

const sectionSelectors = [
    ".Gallery.movies.web.grid.posters",
    ".Gallery.movies.gems.grid.posters"
];

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Wait for both categories to render their movie cards.
function getMovieSectionStatus() {
    return sectionSelectors.map(selector => {
        const section = document.querySelector(selector);

        const items = section
            ? [...section.querySelectorAll(".Item[data-uid]")]
            : [];

        // Ignore placeholders and wait for actual movie cards.
        const realMovies = items.filter(item => {
            const id = item.dataset.uid?.trim();

            const title = item
                .querySelector(".title")
                ?.textContent.trim();

            const isPlaceholder =
                !id ||
                /^blank-/i.test(id) ||
                !title ||
                item.querySelector(".PosterItem.placeholder");

            return !isPlaceholder;
        });

        return {
            selector,
            found: Boolean(section),
            itemCount: items.length,
            movieCount: realMovies.length,
            placeholderCount: items.length - realMovies.length,
            firstMovieId: realMovies[0]?.dataset.uid || "",
            firstMovieTitle:
                realMovies[0]?.querySelector(".title")?.textContent.trim() || ""
        };
    });
}


async function waitForMovieSections(timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const sections = getMovieSectionStatus();

        // Both categories must contain real movies.
        const ready = sections.every(
            section => section.movieCount > 0
        );

        if (ready) {
            return {
                ready: true,
                sections
            };
        }

        await wait(500);
    }

    return {
        ready: false,
        sections: getMovieSectionStatus()
    };
}

// Tell the background worker that the scan has finished.
function reportScanComplete(success, diagnostics = {}) {
    if (!isBackgroundScan || !scanId) {
        return;
    }

    chrome.runtime.sendMessage({
        type: "BACKGROUND_SCAN_COMPLETE",
        scanId,
        container: scanContainer,
        success,
        diagnostics: {
            url: window.location.href,
            ...diagnostics
        }
    }, response => {
        if (chrome.runtime.lastError) {
            console.warn(
                "Could not report scan completion:",
                chrome.runtime.lastError.message
            );
        } else {
            console.log("Background scan completed:", response);
        }
    });
}

async function runMovieCheck() {
    const timeoutMs = isBackgroundScan ? 90000 : 5000;

    console.log("Movie scan started:", {
        url: window.location.href,
        isBackgroundScan
    });

    const result = await waitForMovieSections(timeoutMs);

    console.table(result.sections);

    // Inspect the actual DOM elements in both galleries.
    const domDiagnostics = sectionSelectors.map(selector => {
        const section = document.querySelector(selector);

        const items = section
            ? [...section.querySelectorAll(".Item[data-uid]")]
            : [];

        const firstItem = items[0];

        return {
            selector,
            sectionFound: Boolean(section),
            itemCount: items.length,
            firstMovieId: firstItem?.dataset.uid || "",
            titleElementCount:
                firstItem?.querySelectorAll(".title").length || 0,
            firstMovieTitle:
                firstItem?.querySelector(".title")?.textContent.trim() || "",
            firstItemHTML:
                firstItem?.outerHTML.slice(0, 500) || ""
        };
    });

    const movies = getMovies();

    console.log("Parsed movie count:", movies.length);
    console.log(
        "Parsed movie examples:",
        movies.slice(0, 3).map(movie => ({
            id: movie.id,
            title: movie.title
        }))
    );

    if (!result.ready || movies.length === 0) {
        console.warn("Background scan could not parse movies.");

        reportScanComplete(false, {
            reason: !result.ready
                ? "sections-not-ready"
                : "no-parseable-movies",
            sections: result.sections,
            domDiagnostics,
            parsedMovieCount: movies.length
        });

        return;
    }


    await saveMovies();

    reportScanComplete(true, {
        sections: result.sections,
        domDiagnostics,
        parsedMovieCount: movies.length,
        sampleMovies: movies.slice(0, 3).map(movie => ({
            id: movie.id,
            title: movie.title
        }))
    });
}

runMovieCheck().catch(error => {
    console.error("Movie scan failed:", error);

    reportScanComplete(false, {
        reason: "exception",
        error: error.message
    });
});