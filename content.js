function getMovies() {
    const items = [...document.querySelectorAll(".Item")];

    return items.map(item => {
        const id = item.dataset.uid;
        const title = item.querySelector(".title")?.textContent.trim();
        const poster = item.querySelector("img")?.src;
        const date = item.querySelector(".subtitle p")?.textContent.trim();
        const ratingText =
            item.querySelector(".score-container")?.textContent || "";

        const rating = ratingText
            .replace(/\s+/g, " ")
            .replace(/^[\s·•●]+/, "")
            .trim();

        return {
            id,
            title,
            poster,
            date,
            rating,
            url: `https://vuniper.com/movies/web?id=${id}`
        };
    }).filter(movie => movie.id && movie.title);
}

async function saveMovies() {
    const movies = getMovies();

    if (movies.length === 0) {
        console.log("No movies found. Storage was not changed.");
        return;
    }

    const result = await chrome.storage.local.get("knownMovieIds");
    const knownMovieIds = result.knownMovieIds;

    if (!knownMovieIds) {
        const ids = movies.map(movie => movie.id);

        await chrome.storage.local.set({
            knownMovieIds: ids
        });

        console.log("First run: saved", ids.length, "existing movies.");
        return;
    }

    const newMovies = movies.filter(
        movie => !knownMovieIds.includes(movie.id)
    );

    console.log("Known movies:", knownMovieIds.length);
    console.log("New movies:", newMovies);

    for (const movie of newMovies) {
        chrome.runtime.sendMessage({
            type: "NEW_MOVIE",
            movie: movie
        });
    }

    const updatedIds = [
        ...new Set([
            ...knownMovieIds,
            ...movies.map(movie => movie.id)
        ])
    ];

    await chrome.storage.local.set({
        knownMovieIds: updatedIds
    });
}

setTimeout(async () => {
    await saveMovies();

    const movie = getMovies()[0];

    if (movie) {
    const testMovie = {
        ...movie,

        // Temporary test data. We will replace these with real metadata.
        year: "2025",
        genres: "Comedy, Mystery, Thriller",
        runtime: "1h 40m",
        description:
            "This is temporary test text. We will replace it with the real movie description."
    };

    chrome.runtime.sendMessage({
        type: "NEW_MOVIE",
        movie: testMovie
    });

        console.log("Test notification sent:", movie.title);
    }
}, 3000);