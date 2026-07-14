import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import {
  getCurrentWeather,
  getWeatherByCoords,
  getFiveDayForecast,
} from "./weatherService";

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
);

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
];

const UNIT_OPTIONS = [
  { code: "metric", label: "°C / km/h" },
  { code: "imperial", label: "°F / mph" },
];

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const WEATHER_THEMES = {
  clear: "theme-sunny",
  clouds: "theme-cloudy",
  rain: "theme-rainy",
  drizzle: "theme-rainy",
  thunderstorm: "theme-storm",
  snow: "theme-snow",
  mist: "theme-cloudy",
  haze: "theme-cloudy",
  fog: "theme-cloudy",
  default: "theme-default",
};

const TRANSLATIONS = {
  en: {
    searchPlaceholder: "Enter city, zip, or landmark...",
    search: "Search",
    useLocation: "Use My Current Location",
    history: "Recent searches",
    weatherNow: "Weather now",
    forecast: "5-Day Forecast",
    localTime: "Local time",
    feelsLike: "Feels Like",
    humidity: "Humidity",
    sunrise: "Sunrise",
    sunset: "Sunset",
    chartTitle: "Temperature trend",
    mapTitle: "City map",
    loading: "Fetching weather...",
    speechHint: "Speak city name",
    cta: "Voice search",
  },
  es: {
    searchPlaceholder: "Ingresa ciudad, código postal o lugar...",
    search: "Buscar",
    useLocation: "Usar mi ubicación actual",
    history: "Búsquedas recientes",
    weatherNow: "Clima actual",
    forecast: "Pronóstico de 5 días",
    localTime: "Hora local",
    feelsLike: "Sensación térmica",
    humidity: "Humedad",
    sunrise: "Amanecer",
    sunset: "Atardecer",
    chartTitle: "Tendencia de temperatura",
    mapTitle: "Mapa de la ciudad",
    loading: "Obteniendo el clima...",
    speechHint: "Habla el nombre de la ciudad",
    cta: "Búsqueda por voz",
  },
  fr: {
    searchPlaceholder: "Entrez une ville, un code postal ou un lieu...",
    search: "Rechercher",
    useLocation: "Utiliser ma position actuelle",
    history: "Recherches récentes",
    weatherNow: "Météo actuelle",
    forecast: "Prévisions sur 5 jours",
    localTime: "Heure locale",
    feelsLike: "Ressenti",
    humidity: "Humidité",
    sunrise: "Lever du soleil",
    sunset: "Coucher du soleil",
    chartTitle: "Tendance des températures",
    mapTitle: "Carte de la ville",
    loading: "Récupération de la météo...",
    speechHint: "Prononcez le nom de la ville",
    cta: "Recherche vocale",
  },
};

const storageKey = "weather-app-preferences";
const historyKey = "weather-app-history";

const readPreferences = () => {
  try {
    const storedPreferences = window.localStorage.getItem(storageKey);
    return storedPreferences ? JSON.parse(storedPreferences) : {};
  } catch {
    return {};
  }
};

const readHistory = () => {
  try {
    const storedHistory = window.localStorage.getItem(historyKey);
    return storedHistory ? JSON.parse(storedHistory) : [];
  } catch {
    return [];
  }
};

const getWeatherTheme = (weather) => {
  const group = weather?.[0]?.main?.toLowerCase();
  return WEATHER_THEMES[group] ?? WEATHER_THEMES.default;
};

const formatTime = (unixSeconds) =>
  TIME_FORMATTER.format(new Date(unixSeconds * 1000));

const getCityLocalTime = (timezoneOffsetSeconds) =>
  formatTime(Math.floor(Date.now() / 1000) + timezoneOffsetSeconds);

const buildChartConfig = (forecast, unit) => ({
  type: "line",
  data: {
    labels: forecast.map((day) =>
      new Date(day.dt * 1000).toLocaleDateString(undefined, {
        weekday: "short",
      }),
    ),
    datasets: [
      {
        label: unit === "metric" ? "Temperature (°C)" : "Temperature (°F)",
        data: forecast.map((day) => Math.round(day.main.temp)),
        borderColor: "rgba(255,255,255,0.95)",
        backgroundColor: "rgba(255,255,255,0.15)",
        pointBackgroundColor: "#fff",
        tension: 0.35,
        fill: true,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
      },
    },
    scales: {
      x: {
        ticks: { color: "rgba(255,255,255,0.85)" },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
      y: {
        ticks: { color: "rgba(255,255,255,0.85)" },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
    },
  },
});

function App() {
  const [city, setCity] = useState("");
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [history, setHistory] = useState(() => readHistory());
  const [unit, setUnit] = useState(() => readPreferences().unit ?? "metric");
  const [language, setLanguage] = useState(
    () => readPreferences().language ?? "en",
  );
  const [voiceStatus, setVoiceStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const t = TRANSLATIONS[language];

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ unit, language }));
  }, [unit, language]);

  useEffect(() => {
    window.localStorage.setItem(historyKey, JSON.stringify(history));
  }, [history]);

  const addToHistory = (searchedCity) => {
    setHistory((currentHistory) => {
      const nextHistory = [
        searchedCity,
        ...currentHistory.filter(
          (entry) => entry.toLowerCase() !== searchedCity.toLowerCase(),
        ),
      ].slice(0, 5);
      return nextHistory;
    });
  };

  const loadWeather = async (query) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setLoading(true);
    setError("");

    try {
      const data = await getCurrentWeather(trimmedQuery, {
        units: unit,
        lang: language,
      });
      setWeather(data);
      setSelectedCity(data.name);
      addToHistory(data.name);

      const forecastData = await getFiveDayForecast(data.name, {
        units: unit,
        lang: language,
      });
      const dailyForecast = forecastData.list.filter((reading) =>
        reading.dt_txt.includes("12:00:00"),
      );
      setForecast(dailyForecast);
    } catch (err) {
      setError(err.message);
      setWeather(null);
      setForecast(null);
      setSelectedCity("");
    } finally {
      setLoading(false);
    }
  };

  // 1. Handle standard city search
  const handleSearch = async (e) => {
    e.preventDefault();
    await loadWeather(city);
  };

  // 2. Handle the "Locate Me" Geolocation requirement
  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const data = await getWeatherByCoords(latitude, longitude, {
            units: unit,
            lang: language,
          });
          setWeather(data);
          setSelectedCity(data.name);
          addToHistory(data.name);

          // Use the city name from the coords response to grab the forecast
          const forecastData = await getFiveDayForecast(data.name, {
            units: unit,
            lang: language,
          });
          const dailyForecast = forecastData.list.filter((reading) =>
            reading.dt_txt.includes("12:00:00"),
          );
          setForecast(dailyForecast);
        } catch (err) {
          setError(err.message);
          setWeather(null);
          setForecast(null);
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError("Please allow location access to use this feature.");
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    if (!weather) return;

    const chartCanvas = chartRef.current;
    if (chartCanvas && forecast?.length) {
      chartInstanceRef.current?.destroy();
      chartInstanceRef.current = new Chart(
        chartCanvas,
        buildChartConfig(forecast, unit),
      );
    }

    return () => {
      chartInstanceRef.current?.destroy();
      chartInstanceRef.current = null;
    };
  }, [forecast, unit, weather]);

  useEffect(() => {
    if (!weather || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
      });
      setMapReady(true);
    }

    const { lat, lon } = weather.coord;
    mapInstanceRef.current.setView([lat, lon], 10);

    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer || layer instanceof L.Marker) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(mapInstanceRef.current);

    const marker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: "city-marker",
        html: '<span class="city-marker-dot"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(mapInstanceRef.current);
    marker.bindPopup(`${weather.name}, ${weather.sys.country}`).openPopup();

    return () => {
      mapInstanceRef.current?.eachLayer((layer) => {
        if (layer instanceof L.TileLayer || layer instanceof L.Marker) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });
    };
  }, [weather]);

  const currentTheme = useMemo(() => getWeatherTheme(weather), [weather]);
  const temperatureUnit = unit === "metric" ? "°C" : "°F";
  const windUnit = unit === "metric" ? "km/h" : "mph";
  const windSpeed = weather
    ? unit === "metric"
      ? Math.round(weather.wind.speed * 3.6)
      : Math.round(weather.wind.speed)
    : 0;

  const handleHistorySelect = async (cityName) => {
    setCity(cityName);
    await loadWeather(cityName);
  };

  const handleVoiceSearch = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice search is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setVoiceStatus(t.speechHint);
    recognition.onerror = () => {
      setVoiceStatus("");
      setError("Could not start voice search.");
    };
    recognition.onresult = (event) => {
      const spokenCity = event.results[0][0].transcript;
      setCity(spokenCity);
      setVoiceStatus("");
      loadWeather(spokenCity);
    };
    recognition.onend = () => setVoiceStatus("");

    recognition.start();
  };

  return (
    <div className={`min-h-screen app-shell ${currentTheme}`}>
      <div className="weather-orb weather-orb-a" />
      <div className="weather-orb weather-orb-b" />
      <div className="weather-orb weather-orb-c" />
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-4 md:p-6 lg:p-8">
        <section className="glass-panel p-5 md:p-6 lg:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.35em] text-white/65">
                Weather app
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Weather App
              </h1>
              <p className="mt-3 max-w-xl text-sm text-white/75 md:text-base">
                Search a city to see the live weather, map, forecast, and local
                details.
              </p>
            </div>
            {/* The Language dropdown has been entirely deleted from here! */}
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_auto]"
          >
            <div className="search-wrap">
              <input
                type="text"
                placeholder="Search city..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="weather-input"
              />
              <button
                type="button"
                onClick={handleVoiceSearch}
                className="voice-button"
                aria-label="Voice search"
              >
                🎙
              </button>
            </div>
            <button type="submit" className="primary-button">
              Search
            </button>
            <button
              type="button"
              onClick={handleLocationClick}
              className="secondary-button"
            >
              Use My Current Location
            </button>
          </form>

          {history && history.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs uppercase tracking-[0.3em] text-white/55">
                History
              </span>
              {history.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="history-chip"
                  onClick={() => handleHistorySelect(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          {voiceStatus && (
            <p className="mt-3 text-sm text-white/75">{voiceStatus}</p>
          )}
          {loading && <p className="mt-4 text-sm text-white/80">Loading...</p>}
          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200/30 bg-rose-500/20 p-4 text-sm text-white">
              {error}
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="glass-panel p-5 md:p-6">
            {weather ? (
              <>
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.25em] text-white/60">
                      Current Weather
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
                      {weather.name}, {weather?.sys?.country}
                    </h2>
                    <p className="mt-2 text-white/75">
                      {weather?.weather?.[0]?.description}
                    </p>
                    <p className="mt-3 text-sm text-white/70">
                      Local Time: {getCityLocalTime(weather.timezone)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {weather?.weather?.[0]?.icon && (
                      <img
                        src={`https://openweathermap.org/img/wn/${weather.weather[0].icon}@4x.png`}
                        alt="weather icon"
                        className="h-28 w-28 drop-shadow-2xl"
                      />
                    )}
                    <div className="text-right">
                      <p className="text-5xl font-semibold text-white md:text-6xl">
                        {Math.round(weather?.main?.temp)}
                        {temperatureUnit}
                      </p>
                      <p className="text-sm uppercase tracking-[0.3em] text-white/65">
                        {weather?.weather?.[0]?.main}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="metric-card">
                    <span>Feels Like</span>
                    <strong>
                      {Math.round(weather?.main?.feels_like)}
                      {temperatureUnit}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span>Humidity</span>
                    <strong>{weather?.main?.humidity}%</strong>
                  </div>
                  <div className="metric-card">
                    <span>Sunrise</span>
                    <strong>
                      {formatTime(weather.sys.sunrise + weather.timezone)}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span>Sunset</span>
                    <strong>
                      {formatTime(weather.sys.sunset + weather.timezone)}
                    </strong>
                  </div>
                  <div className="metric-card sm:col-span-2 lg:col-span-1">
                    <span>Wind</span>
                    <strong>
                      {windSpeed} {windUnit}
                    </strong>
                  </div>
                </div>

                <div className="mt-6 h-72 rounded-3xl border border-white/10 bg-black/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm uppercase tracking-[0.3em] text-white/65">
                      Temperature Trend
                    </h3>
                    <span className="text-xs text-white/60">
                      {selectedCity}
                    </span>
                  </div>
                  <div className="h-[calc(100%-2rem)]">
                    {forecast && forecast.length > 0 ? (
                      <canvas ref={chartRef} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-white/70">
                        Loading forecast data...
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[30rem] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-white/5 p-8 text-center text-white/70">
                <h2 className="text-2xl font-semibold text-white">
                  Search a city to begin
                </h2>
                <p className="mt-2 max-w-md text-sm">
                  The current weather, forecast, chart, and map will appear
                  here.
                </p>
              </div>
            )}
          </div>

          <div className="glass-panel p-5 md:p-6">
            {weather ? (
              <>
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-white/60">
                    Map Location
                  </p>
                  <div
                    ref={mapRef}
                    className="mt-3 h-80 overflow-hidden rounded-3xl border border-white/10"
                  />
                  {!mapReady && (
                    <p className="mt-3 text-sm text-white/65">Loading map...</p>
                  )}
                </div>

                {forecast && forecast.length > 0 && (
                  <div className="mt-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm uppercase tracking-[0.3em] text-white/65">
                        5-Day Forecast
                      </h3>
                      <span className="text-xs text-white/60">
                        {selectedCity}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-2">
                      {forecast.map((day) => {
                        const date = new Date(day.dt * 1000);
                        const dayName = date.toLocaleDateString(undefined, {
                          weekday: "short",
                        });
                        return (
                          <div key={day.dt} className="forecast-card">
                            <p className="text-xs uppercase tracking-[0.2em] text-white/65">
                              {dayName}
                            </p>
                            {day?.weather?.[0]?.icon && (
                              <img
                                src={`https://openweathermap.org/img/wn/${day.weather[0].icon}.png`}
                                alt="forecast icon"
                                className="my-2 h-12 w-12"
                              />
                            )}
                            <p className="text-lg font-semibold text-white">
                              {Math.round(day?.main?.temp)}
                              {temperatureUnit}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[30rem] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-white/5 p-8 text-center text-white/70">
                <h2 className="text-2xl font-semibold text-white">
                  Map and forecast
                </h2>
                <p className="mt-2 max-w-md text-sm">
                  Your searched city will appear here once results are loaded.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
