# Vuniper Movie Alerts

#### Video Demo: [https://youtu.be/ZiILd7qsDHQ]

#### Description:

## Overview

Vuniper Movie Alerts is a Google Chrome extension developed as my final project for Harvard University's CS50x course. The extension helps users discover new movies listed on [Vuniper](https://vuniper.com/) by monitoring two movie categories: **Movies Now Online** and **Hidden Gems**.

Instead of repeatedly opening the website and checking whether new movies have appeared, users can rely on desktop notifications. When the extension detects a movie that has not been seen before, it displays a notification containing the movie's title and rating. Users can then open a separate details window to see more information about the movie and navigate directly to its page on Vuniper.

The main goal of this project was to build a practical browser extension that solves a real everyday problem while demonstrating my understanding of JavaScript, browser APIs, asynchronous programming, DOM manipulation, and persistent storage.

## Motivation

I enjoy discovering movies, but keeping track of newly available titles across different categories can be inconvenient. Manually revisiting a website takes time, and interesting movies can easily go unnoticed between visits.

I wanted to create a lightweight tool that automates this process without requiring a paid API or a separate backend server. Since Vuniper already displays movie information on its website, the extension uses the available page content rather than depending on a subscription-based external service.

This project also gave me an opportunity to explore Chrome extension development beyond ordinary web pages. In particular, I wanted to understand how a background service worker, content scripts, notifications, browser storage, and separate extension windows can work together.

## Features

### 1. Movie monitoring

The extension monitors movie listings in two Vuniper categories:

* Movies Now Online
* Hidden Gems

It collects information displayed in the movie listings, including each movie's unique identifier, title, poster, rating, and page URL.

### 2. New-movie detection

Each movie has a unique identifier, or `uid`. The extension uses these identifiers to distinguish movies that have already been encountered from newly discovered movies.

Previously encountered identifiers are stored using `chrome.storage.local`. This allows the extension to preserve its tracking information between browser sessions.

Using unique identifiers is important because the same movie may appear in both monitored categories. Tracking movies by identifier helps prevent duplicate notifications for the same title simply because it appears in multiple places.

### 3. Desktop notifications

When a new movie is detected, the extension can display a desktop notification through the Chrome Notifications API.

The notification presents the movie's title and rating and includes a **Show more** button. This allows the user to decide whether to explore the movie without having to open Vuniper manually first.

### 4. Movie details window

Selecting **Show more** opens a separate window with additional information about the selected movie.

Depending on the information available, the details include:

* Movie poster
* Title
* Rating
* Release year
* Genres
* Runtime
* Description
* A link to the movie's page on Vuniper

This design separates the initial notification from the more detailed information. The notification remains compact, while the details window provides a more convenient way to explore a movie.

### 5. Persistent storage

The extension uses Chrome's local storage to remember movie identifiers between sessions.

This avoids relying entirely on temporary in-memory variables, which would be lost when a background process stops or the browser restarts.

### 6. Periodic checking

The extension uses Chrome's Alarms API to schedule periodic checks while Chrome is running.

This approach allows the extension to perform background work without requiring the user to keep the Vuniper page permanently open.

As with other browser extensions, checks depend on Chrome running and the extension being enabled.

## How It Works

The extension combines several Chrome extension components to perform its tasks.

### Step 1: Reading movie listings

A content script runs on the relevant Vuniper movie pages and reads the movie cards displayed in the page's Document Object Model (DOM).

The script extracts information from the page elements, including the movie identifier, title, poster image, and rating. It also constructs the corresponding Vuniper movie URL.

Working with the DOM makes it possible to use the information already displayed by the website without requiring a separate paid movie-data API.

### Step 2: Communicating with the background script

The background service worker coordinates the extension's background operations, including scheduled checks, tracking previously encountered movies, and displaying notifications.

The content script and background script have different responsibilities: the content script reads information from the website, while the background script manages the extension's notification and storage logic.

### Step 3: Comparing movie identifiers

The extension compares the collected movie identifiers with the identifiers saved in local storage.

If a movie has already been recorded, it can be skipped. If its identifier has not been encountered before, the extension can treat it as a newly discovered movie and process it for notification.

This approach is more reliable than comparing titles alone because titles may not uniquely identify a movie.

### Step 4: Saving discovered movies

The extension saves the identifiers it has recorded so that they remain available during subsequent checks.

Persistent storage is particularly important for an extension that runs periodically. Without it, the extension could repeatedly notify the user about the same movies after restarting.

### Step 5: Displaying the notification

For a newly discovered movie, the extension creates a desktop notification with the available movie information.

The notification includes a **Show more** button that gives the user a way to access the detailed view.

### Step 6: Showing movie details

When the user selects the details action, the extension opens a separate window containing the selected movie's information.

The window also provides an **Open on Vuniper** link, allowing the user to visit the original movie page.

## Technologies Used

### JavaScript

JavaScript is used to implement the extension's behavior, extract movie information from web pages, compare identifiers, coordinate background tasks, and handle user interactions.

### HTML and CSS

HTML provides the structure of the movie details interface. CSS is used to organize and style the information so that the window is readable and easy to use.

### Chrome Extensions API

The project uses Chrome's extension APIs, including:

* **Manifest V3** to define the extension's configuration and permissions.
* **Content scripts** to access movie listings displayed on Vuniper.
* **Background service worker** to coordinate background operations.
* **Chrome Storage API** to persist known movie identifiers.
* **Chrome Notifications API** to display desktop notifications.
* **Chrome Alarms API** to schedule periodic checks.
* **Chrome Tabs and Windows APIs**, where needed, to open relevant pages and the movie details interface.

### Document Object Model (DOM)

The DOM allows JavaScript to inspect the HTML structure of Vuniper's movie listings and extract the information needed by the extension.

### Vuniper

Vuniper is the website monitored by the extension. The project uses movie information displayed on its pages and links users back to the original listings.

No paid external API is required for the core functionality.

## Design Decisions

### Using unique movie identifiers

One important design decision was to track movies by their unique identifiers rather than their titles.

The same movie can appear in both monitored categories. Using the identifier allows the extension to recognize that these listings refer to the same movie and reduces duplicate notifications.

### Using local storage

The extension needs to remember which movies it has already encountered. Chrome's local storage provides a straightforward way to retain this information without creating a separate database or backend server.

This keeps the project lightweight and avoids introducing unnecessary infrastructure.

### Separating notifications from movie details

A desktop notification is useful for quickly informing the user about a new movie, but it has limited space.

Instead of placing every available detail into the notification, the extension provides a separate details window. This keeps the notification compact while still making the poster, description, genres, runtime, and other information accessible.

### Avoiding paid APIs

The project was designed to work without a paid external movie-data API.

The extension reads information already available on Vuniper, reducing additional costs and keeping the implementation relatively simple.

### Using Manifest V3

The extension uses Chrome's Manifest V3 architecture, including a background service worker rather than a persistent background page.

This required consideration of how background tasks are scheduled and how state is preserved when the service worker is not continuously running.

## Challenges and Lessons Learned

### Understanding Chrome extension architecture

One of the main challenges was understanding how content scripts, background service workers, notifications, and browser storage interact.

These components operate in different contexts and do not automatically share all of their state. Separating their responsibilities helped make the extension easier to reason about and debug.

### Finding the correct page structure

Extracting movie information required inspecting the actual HTML elements used by Vuniper.

The extension needed to identify the correct movie cards and retrieve their unique identifiers and displayed information. This involved inspecting the DOM and testing the selectors against real movie listings.

### Handling duplicate movies

A movie can appear in more than one monitored category. Treating every listing as a separate movie would cause unnecessary duplicate notifications.

Tracking unique identifiers provided a straightforward solution and made the behavior more consistent.

### Managing background execution

Chrome extension service workers are not intended to run continuously like traditional server processes. This means that background behavior must be designed around browser-managed events and scheduled tasks.

Using the Chrome Alarms API and persistent storage helped address these constraints.

### Debugging notifications and user interactions

Testing the complete flow required checking more than whether movie data could be extracted. I also needed to verify that a newly detected movie could trigger a desktop notification and that the notification's action opened the correct details interface.

This helped me understand the importance of testing the integration between individual components, rather than testing each component only in isolation.

## Project Structure

The main project files are described below. Their exact responsibilities should be checked against the final source code before submission.

* **`manifest.json`** — Defines the extension's name, version, permissions, content-script configuration, background service worker, and other Chrome extension settings.
* **`background.js`** — Coordinates background operations, scheduled checks, previously encountered movie identifiers, and desktop notifications.
* **`content.js`** — Reads movie information from Vuniper's movie listings and extracts the information needed by the extension.
* **`popup.html`** — An HTML interface file included in the project. Its precise role depends on how the final version connects it to the extension.
* **Movie details interface files** — Any additional HTML, JavaScript, and CSS files used to display movie information in the separate details window should be documented individually here.

Only files that are actually included in the final submitted project should be listed in this section. Unused or experimental files should not be included in the final submission.

## Installation and Testing

To test the extension locally:

1. Download or clone the project repository.
2. Open Google Chrome.
3. Navigate to `chrome://extensions`.
4. Enable **Developer mode**.
5. Select **Load unpacked**.
6. Choose the project directory containing `manifest.json`.
7. Open Vuniper and navigate to the relevant movie listings.
8. Confirm that the extension can read the movie cards and that the background functionality is running.
9. Test the notification flow using a movie identifier that has not already been recorded.
10. Select **Show more** and verify that the correct movie details are displayed.
11. Use **Open on Vuniper** to verify that the link opens the corresponding movie page.

For testing new-movie detection, the extension's saved identifiers may need to be reset or a test identifier removed from local storage. This should be done carefully because it can cause an already encountered movie to be treated as new again.

## Limitations and Future Improvements

The extension depends on the structure and availability of Vuniper's website. If the website changes its HTML structure, CSS selectors, or page behavior, the extraction logic may need to be updated.

The extension also depends on Chrome being open and the extension remaining enabled for scheduled checks to run.

Potential future improvements include:

* Adding configurable notification intervals.
* Providing settings for enabling or disabling individual movie categories.
* Improving error handling when the website is unavailable.
* Adding more robust validation for incomplete movie information.
* Improving the handling of changes to Vuniper's page structure.
* Providing a user interface for reviewing recently discovered movies.
* Adding automated tests for movie extraction and duplicate detection.

These improvements could make the extension more flexible and reliable as the project grows.

## Conclusion

Vuniper Movie Alerts demonstrates how JavaScript and the Chrome Extensions API can be used to automate a repetitive task and improve the experience of discovering movies online.

The project combines DOM manipulation, background processing, persistent storage, scheduled tasks, desktop notifications, and a separate details interface into one application.

Building the extension gave me practical experience with browser extension architecture, asynchronous behavior, debugging, and the challenges of coordinating multiple components. It also allowed me to turn an everyday inconvenience into a working software project.

The result is a lightweight extension designed to help users notice new movies on Vuniper without having to check the website manually.

## Acknowledgments

This project was developed as the final project for Harvard University's CS50x course.

* CS50x: https://cs50.harvard.edu/x/
* Vuniper: https://vuniper.com/
