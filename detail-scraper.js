(() => {
    // Run only when the extension requests movie details.
    if (window.location.hash !== "#vuniper-extension-details") {
        return;
    }

    const movieId = new URLSearchParams(
        window.location.search
    ).get("id");

    const sleep = (ms) =>
        new Promise(resolve => setTimeout(resolve, ms));

    function sendResult(message) {
        chrome.runtime.sendMessage(message, () => {
            if (chrome.runtime.lastError) {
                console.warn(
                    "Could not send movie details:",
                    chrome.runtime.lastError.message
                );
            }
        });
    }

    async function waitForSelector(selector, timeoutMs) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const element = document.querySelector(selector);

            if (element) {
                return element;
            }

            await sleep(250);
        }

        return null;
    }

    async function scrapeMovieDetails() {
        if (!movieId) {
            throw new Error("Movie ID was not found in the URL.");
        }

        // Wait for Vuniper to render the movie information.
        const subtitle = await waitForSelector(
            ".media-viewer-subtitle",
            15000
        );

        if (!subtitle) {
            throw new Error("Movie metadata was not found.");
        }

        // Wait for the description. Some movies may not have one.
        let descriptionElement = await waitForSelector(
            "#media-viewer-description",
            4000
        );

        if (descriptionElement) {
            // Expand the description if it is collapsed.
            const showMoreButton = [
                ...descriptionElement.querySelectorAll("button")
            ].find(button =>
                button.textContent.trim().toLowerCase() === "show more"
            );

            if (showMoreButton) {
                showMoreButton.click();

                // Give the page time to update the description.
                await sleep(150);
            }
        }

        // Read year, genres and runtime.
        const metadataText = document
            .querySelector(".media-viewer-subtitle")
            ?.textContent.trim() || "";

        const metadataParts = metadataText
            .split("|")
            .map(part => part.trim());

        const year = metadataParts[0] || "";
        const genres = metadataParts[1] || "";
        const runtime = metadataParts[2] || "";

        // Read the description without its Show more / Show less button.
        descriptionElement = document.querySelector(
            "#media-viewer-description"
        );

        let description = "";

        if (descriptionElement) {
            const descriptionCopy = descriptionElement.cloneNode(true);

            descriptionCopy
                .querySelectorAll("button")
                .forEach(button => button.remove());

            description = descriptionCopy.textContent
                .replace(/\s+/g, " ")
                .trim();
        }

        const details = {
            year,
            genres,
            runtime,
            description
        };

        console.log("Movie details extracted:", details);

        // Send the details to the extension's background service worker.
        sendResult({
            type: "MOVIE_DETAILS_SCRAPED",
            id: movieId,
            details
        });
    }

    scrapeMovieDetails().catch(error => {
        console.error("Could not extract movie details:", error);

        sendResult({
            type: "MOVIE_DETAILS_SCRAPE_FAILED",
            id: movieId,
            error: error.message
        });
    });
})();