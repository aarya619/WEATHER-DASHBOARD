// Vite exposes environment variables using import.meta.env
const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;
const BASE_URL = "https://api.openweathermap.org/data/2.5";

const buildWeatherUrl = (path, params) => {
  const searchParams = new URLSearchParams({
    appid: API_KEY,
    ...params,
  });

  return `${BASE_URL}${path}?${searchParams.toString()}`;
};

/**
 * Fetch Current Weather by City Name
 */
export const getCurrentWeather = async (city, options = {}) => {
  try {
    const response = await fetch(
      buildWeatherUrl("/weather", {
        q: city,
        units: options.units ?? "metric",
        lang: options.lang ?? "en",
      }),
    );

    // Assessment Requirement 1.2: Error Handling
    if (!response.ok) {
      throw new Error("City not found. Please try another search.");
    }

    return await response.json();
  } catch (error) {
    console.error("Current Weather Fetch Error:", error);
    throw error;
  }
};

/**
 * Fetch 5-Day Forecast by City Name (Requirement 1.1)
 */
export const getFiveDayForecast = async (city, options = {}) => {
  try {
    const response = await fetch(
      buildWeatherUrl("/forecast", {
        q: city,
        units: options.units ?? "metric",
        lang: options.lang ?? "en",
      }),
    );

    if (!response.ok) {
      throw new Error("Forecast data could not be retrieved.");
    }

    return await response.json();
  } catch (error) {
    console.error("Forecast Fetch Error:", error);
    throw error;
  }
};

/**
 * Fetch Current Weather by GPS Coordinates (For the "Locate Me" button)
 */
export const getWeatherByCoords = async (lat, lon, options = {}) => {
  try {
    const response = await fetch(
      buildWeatherUrl("/weather", {
        lat,
        lon,
        units: options.units ?? "metric",
        lang: options.lang ?? "en",
      }),
    );

    if (!response.ok) {
      throw new Error("Unable to retrieve weather for your location.");
    }

    return await response.json();
  } catch (error) {
    console.error("Coordinate Fetch Error:", error);
    throw error;
  }
};
