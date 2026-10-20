function setOptionalDetail(rowId, valueId, value) {
    const row = document.getElementById(rowId);
    const element = document.getElementById(valueId);

    const normalizedValue = Array.isArray(value)
        ? value.join(", ")
        : value;

    if (
        normalizedValue === undefined ||
        normalizedValue === null ||
        String(normalizedValue).trim() === ""
    ) {
        row.hidden = true;
        return;
    }

    element.textContent = String(normalizedValue).trim();
    row.hidden = false;
}

async function loadMovieDetails() {
    const params = new URLSearchParams(window.location.search);
    const storageKey = params.get("key");

    if (!storageKey) {
        showError("Movie information was not provided.");
        return;
    }

    const result = await chrome.storage.local.get(storageKey);
    const movie = result[storageKey];

    if (!movie) {
        showError("Movie information could not be found.");
        return;
    }

    const titleElement = document.getElementById("movieTitle");
    const ratingElement = document.getElementById("movieRating");
    const posterElement = document.getElementById("moviePoster");
    const placeholderElement = document.getElementById("posterPlaceholder");

    titleElement.textContent = movie.title || "Unknown movie";

    // Display the rating.
    const ratingText = movie.rating || "Not available";

    ratingElement.textContent = `Rating: ${ratingText}`;

    // Extract the percentage from the rating.
    const match = ratingText.match(/(\d+(?:\.\d+)?)\s*%/);

    // Reset the rating color.
    ratingElement.classList.remove("rating-medium", "rating-low");

    if (match) {
        const percentage = Number(match[1]);

        if (percentage < 40) {
            // Orange: below 40%.
            ratingElement.classList.add("rating-low");
        } else if (percentage < 70) {
            // Yellow: 40% to below 70%.
            ratingElement.classList.add("rating-medium");
        }

        // 70% and above keeps the default green background.
    }

    // Display the poster.
    if (movie.poster) {
        posterElement.alt = `Poster for ${movie.title || "the movie"}`;

        posterElement.addEventListener("load", () => {
            posterElement.hidden = false;
            placeholderElement.hidden = true;
        });

        posterElement.addEventListener("error", () => {
            posterElement.hidden = true;
            placeholderElement.textContent = "Poster unavailable.";
            placeholderElement.hidden = false;
        });

        posterElement.src = movie.poster;
    } else {
        placeholderElement.textContent = "No poster available.";
    }

    // Display available movie metadata.
    setOptionalDetail("yearRow", "movieYear", movie.year);

    setOptionalDetail("genresRow", "movieGenres", movie.genres);

    setOptionalDetail("runtimeRow", "movieRuntime", movie.runtime);

    setOptionalDetail(
        "descriptionRow",
        "movieDescription",
        movie.description
    );

    // Open the movie's page on Vuniper.
    document.getElementById("openVuniper").addEventListener("click", () => {
        const movieUrl = movie.url ||
            `https://vuniper.com/movies/web?id=${encodeURIComponent(movie.id)}`;

        chrome.tabs.create({
            url: movieUrl
        });
    });

    // Remove the temporary stored data after loading it.
    await chrome.storage.local.remove(storageKey);
}

function showError(message) {
    const container = document.querySelector(".card");

    container.innerHTML = "";

    const error = document.createElement("p");
    error.className = "error";
    error.textContent = message;

    container.appendChild(error);
}

loadMovieDetails().catch(error => {
    console.error("Could not load movie details:", error);
    showError("Something went wrong while loading this movie.");
});