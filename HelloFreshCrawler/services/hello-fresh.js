const axios = require("axios");
const fs = require("fs");
const { colours } = require("../utils/colours");
const { splitArrayBatch } = require("../utils/array");
const { isMeatFree } = require("../utils/recipe-filter");

const siteUrl = "https://www.hellofresh.com";
const apiUrl = "https://gw.hellofresh.com/api/";
const searchEndpoint = "recipes/search?";
let recipeCardSaveDirectory = "./recipe-card-pdfs";

const apiSearchParams = {
  offset: 0,
  limit: 500,
  product: ["classic-box", "veggie-box", "meal-plan", "family-box"],
  locale: "en-US",
  country: "us",
  ["max-prep-time"]: 60,
};

const fetchApiToken = async function () {
  try {
    // Load the regular site to grab an access token
    const siteResponse = await axios.get(siteUrl);
    const responseData = siteResponse.data;

    // Use a regular expression to extract the access token
    const regex = /"access_token":"([^"]+)"/;
    const match = responseData.match(regex);

    if (match) {
      const accessToken = match[1];
      return accessToken;
    } else {
      throw new Error("Access token not found in the site response.");
    }
  } catch (error) {
    throw new Error("Failed to fetch the API token: " + error.message);
  }
};
const constructSearchUrl = function () {
  let target = `${apiUrl}${searchEndpoint}`;

  for (let [key, value] of Object.entries(apiSearchParams)) {
    if (Array.isArray(value)) {
      target += `${key}=${value.join("|")}&`;
    } else {
      target += `${key}=${value}&`;
    }
  }

  return target.slice(0, target.length - 1);
};

const performSearch = async function (bearerToken) {
  const searchUrl = constructSearchUrl();
  return axios.get(searchUrl, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });
};

const sanitizeFilename = function (name) {
  return (name || "recipe").replace(/[/\\?%*:|"<>]/g, "_").trim();
};

const downloadRecipeCards = async function (items) {
  const downloadedCards = [];
  const parallelDownloads = 10;
  const maxRetryAttempts = 3; // Maximum number of retry attempts

  // Function to generate a random delay between 5 to 20 seconds
  function getRandomDelay() {
    return Math.floor(Math.random() * 6 + 1) * 1000;
  }

  if (Array.isArray(items) && items.length > 0) {
    // 1. Save JSON metadata for all recipes
    let jsonSavedCount = 0;
    items.forEach((item) => {
      if (!item.name) return;
      const cleanName = sanitizeFilename(item.name);
      const jsonFilePath = `${recipeCardSaveDirectory}/${cleanName}.json`;

      if (!fs.existsSync(jsonFilePath)) {
        try {
          fs.writeFileSync(jsonFilePath, JSON.stringify(item, null, 2));
          jsonSavedCount++;
        } catch (err) {
          console.error(`- Failed to save JSON for "${item.name}":`, err.message);
        }
      }
    });

    if (jsonSavedCount > 0) {
      console.log(`- Saved ${jsonSavedCount} recipe JSON files.`);
    }

    // 2. Grep items with card links for PDF downloads
    const itemsWithLinks = items.filter((item) => item.cardLink);
    // Split into batch for concurrent downloading
    const batches = splitArrayBatch(itemsWithLinks, parallelDownloads);

    for (let [index, batch] of batches.entries()) {
      const downloadPromises = batch.map((item) => {
        // Function to perform the download with retries
        const performDownloadWithRetry = async (retryCount) => {
          try {
            const res = await axios.get(item.cardLink, {
              responseType: "arraybuffer",
              headers: { Accept: "application/pdf" },
            });

            downloadedCards.push({
              name: item.name,
              data: res.data,
            });
          } catch (err) {
            const status = err.response ? err.response.status : null;
            const isRetryable =
              err.code === "ECONNRESET" ||
              err.code === "ETIMEDOUT" ||
              err.code === "ENOTFOUND" ||
              (status && [500, 502, 503, 504, 429].includes(status));

            if (retryCount < maxRetryAttempts && isRetryable) {
              const retryDelay = getRandomDelay();
              console.log(
                `- Retrying download for "${item.name}" after ${retryDelay / 1000}s (Attempt ${retryCount + 1}/${maxRetryAttempts})`
              );
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
              await performDownloadWithRetry(retryCount + 1);
            } else {
              const statusMsg = status ? `HTTP ${status}` : err.message;
              console.log(
                `- Skipping "${item.name}": Could not download recipe PDF (${statusMsg})`
              );
            }
          }
        };

        return performDownloadWithRetry(0); // Start with the first download attempt
      });

      await Promise.all(downloadPromises);

      console.log(
        `- Batch ${index + 1} of recipe card downloads completed. Saving ${downloadedCards.length
        } PDF files.`
      );

      // Add a random delay before the next batch
      if (index < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    console.log(
      `- Recipe card downloads completed. Saving ${downloadedCards.length} PDF files.`
    );

    downloadedCards.forEach((item) => {
      const cleanName = sanitizeFilename(item.name);
      const filePath = `${recipeCardSaveDirectory}/${cleanName}.pdf`;

      // Only save if the file does not exist
      if (!fs.existsSync(filePath)) {
        fs.writeFile(filePath, item.data, (err) => {
          if (err) throw err;
        });
      }
    });

    console.log("- Save completed");
  }
};

const crawl = async function (settings) {
  const filterMeat = settings.noMeat !== false; // Meat-free by default

  if (settings.locale) {
    if (settings.locale === "DE") {
      apiSearchParams.locale = `de-${settings.locale.toUpperCase()}`;
    } else if (settings.locale === "FR") {
      apiSearchParams.locale = `fr-${settings.locale.toUpperCase()}`;
    } else {
      apiSearchParams.locale = `en-${settings.locale.toUpperCase()}`;
    }

    apiSearchParams.country = settings.locale.toLowerCase();
  }

  if (settings.recipeCardSaveDirectory) {
    recipeCardSaveDirectory = settings.recipeCardSaveDirectory;
  }

  fs.mkdir(recipeCardSaveDirectory, { recursive: true }, (err) => {
    if (err) throw err;
  });

  const apiToken = await fetchApiToken();

  if (!apiToken) {
    throw new Error("API bearer token could not be extracted.");
  }

  console.log("API Token acquired. Searching recipes.");
  if (filterMeat) {
    // Narrow API search pool to veggie/vegetarisch tags so total results fit within 10,000 API limit
    if (settings.locale === "DE") {
      apiSearchParams.tag = "vegetarisch";
    } else {
      apiSearchParams.tag = "veggie";
    }

    console.log(
      colours.fg.green,
      "Meat-free mode active: Filtering API queries by tag and excluding land meat & poultry (beef, pork, chicken, turkey, etc.), keeping vegetarian/vegan & fish/seafood.",
      colours.reset
    );
  }

  // Initiate search
  let searchResponse = await performSearch(apiToken);

  if (searchResponse.status !== 200) {
    throw new Error(
      `Search responded with status ${searchResponse.status}. Aborting.`
    );
  }

  if (searchResponse.data.length < 1) {
    throw new Error("No results have been retrieved.");
  }

  // Elasticsearch caps maximum result window (offset + limit) to 10,000
  const maxResultWindow = 10000;
  const totalRecipes = searchResponse.data.total || 0;
  const fetchableTotal = Math.min(totalRecipes, maxResultWindow);
  let pages = Math.ceil(fetchableTotal / apiSearchParams.limit);
  let currentPage = 1;

  console.log(
    `Initiating search across ${totalRecipes} total recipes (${fetchableTotal} fetchable within API limits) over ${pages} batches.`
  );

  while (currentPage <= pages) {
    let itemsToDownload = searchResponse.data.items || [];
    if (filterMeat) {
      itemsToDownload = itemsToDownload.filter(isMeatFree);
    }

    console.log(
      colours.fg.green,
      `Batch [${currentPage}/${pages}] ${itemsToDownload.length}/${searchResponse.data.items.length} recipes matched meat-free filter. Downloading recipe cards...`,
      colours.reset
    );

    await downloadRecipeCards(itemsToDownload);

    // Stop if next batch offset would exceed max API window (10,000)
    if (apiSearchParams.offset + apiSearchParams.limit >= maxResultWindow) {
      console.log(
        colours.fg.green,
        `- Reached API maximum result limit of ${maxResultWindow} recipes. Crawling finished.`,
        colours.reset
      );
      break;
    }

    apiSearchParams.offset += apiSearchParams.limit;

    // Adjust limit for last partial batch if approaching 10,000
    if (apiSearchParams.offset + apiSearchParams.limit > maxResultWindow) {
      apiSearchParams.limit = maxResultWindow - apiSearchParams.offset;
    }

    try {
      searchResponse = await performSearch(apiToken);
    } catch (err) {
      console.log(
        `- Search API error on batch ${currentPage + 1}: ${err.message}. Ending crawl gracefully.`
      );
      break;
    }

    if (!searchResponse || searchResponse.status !== 200) {
      console.log(
        `- Search responded with status ${searchResponse ? searchResponse.status : "unknown"}. Ending crawl.`
      );
      break;
    }

    if (!searchResponse.data || !searchResponse.data.items || searchResponse.data.items.length < 1) {
      console.log("- No further results retrieved.");
      break;
    }

    currentPage++;
  }
};


module.exports = { crawl };
