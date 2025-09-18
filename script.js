// Weather App Plus: adds °C/°F toggle, 5-day forecast, and more details.
// NOTE: For production, avoid exposing API keys in client code. Use a proxy/server if possible.
const API_KEY = "9516a74ca0cbb9eebb06656902d13844"; 

/* ===============================
   DOM REFERENCES
   =============================== */
const form = document.getElementById("searchForm");
const cityInput = document.getElementById("cityInput");
const resultCard = document.getElementById("result");
const placeEl = document.getElementById("place");
const tempEl = document.getElementById("temp");
const unitLabel = document.getElementById("unitLabel");
const descEl = document.getElementById("desc");
const iconEl = document.getElementById("icon");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");
const windUnitEl = document.getElementById("windUnit");
const feelsLikeEl = document.getElementById("feelsLike");
const pressureEl = document.getElementById("pressure");
const visibilityEl = document.getElementById("visibility");
const sunriseEl = document.getElementById("sunrise");
const sunsetEl = document.getElementById("sunset");

const errorEl = document.getElementById("error");
const loaderEl = document.getElementById("loader");
const forecastSection = document.getElementById("forecast");
const forecastStrip = document.getElementById("forecastStrip");

/* ===============================
   UNIT TOGGLE (°C / °F)
   Persisted in localStorage
   =============================== */
const unitButtons = document.querySelectorAll(".unit-btn");
let UNIT = localStorage.getItem("weather_unit") || "metric"; // default to metric
applyUnitButtons();

/* ===============================
   CITY SUGGESTIONS (Geo API)
   with debounce + keyboard nav
   =============================== */
const suggestionsEl = document.getElementById("suggestions");
let suggestionIndex = -1;            // which suggestion is currently highlighted
let currentSuggestions = [];         // cache suggestions to allow keyboard selection

// Generic debounce helper to limit API calls while typing
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Fetch up to 5 city suggestions as the user types
const fetchCitySuggestions = debounce(async (q) => {
  if (!q || q.length < 2) { hide(suggestionsEl); return; }
  try {
    const url = new URL("https://api.openweathermap.org/geo/1.0/direct");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "5");
    url.searchParams.set("appid", API_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Suggestion fetch failed");

    const list = await res.json();
    // Normalize results into a simple shape the UI can render
    currentSuggestions = list.map((c) => ({
      name: c.name,
      country: c.country || "",
      state: c.state || "",
      lat: c.lat,
      lon: c.lon,
      // Label shown in the input once selected
      label: c.country && c.state
        ? `${c.name}, ${c.state}, ${c.country}`
        : c.country
        ? `${c.name}, ${c.country}`
        : c.name
    }));
    renderSuggestions(currentSuggestions);
  } catch (e) {
    // Fail quietly: simply hide suggestions if geocoding fails
    hide(suggestionsEl);
  }
}, 250);

// Render the suggestions dropdown
function renderSuggestions(items) {
  suggestionsEl.innerHTML = "";
  suggestionIndex = -1;

  if (!items || items.length === 0) { hide(suggestionsEl); return; }

  for (const [i, item] of items.entries()) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.index = String(i);
    li.innerHTML = `
      <span>${escapeHtml(item.name)}</span>
      <span class="suggestion-secondary">
        ${escapeHtml((item.state ? item.state + ", " : "") + item.country)}
      </span>`;
    // Mouse click selects the suggestion and triggers a search
    li.addEventListener("click", () => selectSuggestion(i));
    suggestionsEl.appendChild(li);
  }
  show(suggestionsEl);
}

// Put selected suggestion into the input and submit the form
function selectSuggestion(i) {
  const sel = currentSuggestions[i];
  if (!sel) return;
  cityInput.value = sel.label;
  hide(suggestionsEl);
  // Programmatically submit the form
  form.dispatchEvent(new Event("submit", { cancelable: true }));
}

// Input listeners: fetch suggestions and handle arrow/enter/esc keys
cityInput.addEventListener("input", (e) => fetchCitySuggestions(e.target.value.trim()));
cityInput.addEventListener("keydown", (e) => {
  const visible = !suggestionsEl.classList.contains("hidden");
  if (!visible) return;

  const max = currentSuggestions.length;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    suggestionIndex = (suggestionIndex + 1) % max;
    updateActiveSuggestion();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    suggestionIndex = (suggestionIndex - 1 + max) % max;
    updateActiveSuggestion();
  } else if (e.key === "Enter") {
    if (suggestionIndex >= 0 && suggestionIndex < max) {
      e.preventDefault();
      selectSuggestion(suggestionIndex);
    }
  } else if (e.key === "Escape") {
    hide(suggestionsEl);
  }
});

// Highlight the active suggestion (arrow keys)
function updateActiveSuggestion() {
  const items = Array.from(suggestionsEl.querySelectorAll("li"));
  items.forEach((el) => el.classList.remove("active"));
  if (suggestionIndex >= 0 && suggestionIndex < items.length) {
    items[suggestionIndex].classList.add("active");
  }
}

// Simple HTML escape to avoid unsafe markup in suggestions
function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

/* ===============================
   UNIT TOGGLE LOGIC
   =============================== */
unitButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    UNIT = btn.dataset.unit;                        // "metric" or "imperial"
    localStorage.setItem("weather_unit", UNIT);     // persist choice
    applyUnitButtons();
    // If a city is already entered, refresh results with new units
    if (cityInput.value.trim()) {
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });
});

// Update UI state for unit buttons + labels
function applyUnitButtons() {
  unitButtons.forEach(b => b.classList.toggle("active", b.dataset.unit === UNIT));
  unitLabel.textContent = UNIT === "metric" ? "°C" : "°F";
  windUnitEl.textContent = UNIT === "metric" ? "m/s" : "mph";
}

/* ===============================
   FORM SUBMIT: Fetch current + forecast
   =============================== */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();

  hide(errorEl);          // reset error UI
  hide(resultCard);       // hide previous results while loading
  hide(forecastSection);  // hide previous forecast while loading

  if (!city) { showError("Please enter a city name."); return; }

  show(loaderEl);         // show spinner

  try {
    // Fetch current conditions
    const current = await fetchCurrent(city, UNIT);
    renderCurrent(current);

    // Fetch forecast using the coordinates from the current response
    const { lat, lon } = current.coord || {};
    if (lat != null && lon != null) {
      const forecast = await fetchForecast(lat, lon, UNIT);
      renderForecast(forecast);
    }
  } catch (err) {
    handleError(err);
  } finally {
    hide(loaderEl);       // always hide loader at the end
  }
});

/* ===============================
   API HELPERS
   =============================== */

// Fetch "current weather" by city + unit
async function fetchCurrent(city, unit) {
  const endpoint = new URL("https://api.openweathermap.org/data/2.5/weather");
  endpoint.searchParams.set("q", city);
  endpoint.searchParams.set("appid", API_KEY);
  endpoint.searchParams.set("units", unit);

  const res = await fetch(endpoint); 
  if (!res.ok) {
    // Produce a human-friendly error message when possible
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {}
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

// Fetch 5-day forecast by coordinates + unit
async function fetchForecast(lat, lon, unit) {
  const endpoint = new URL("https://api.openweathermap.org/data/2.5/forecast");
  endpoint.searchParams.set("lat", lat);
  endpoint.searchParams.set("lon", lon);
  endpoint.searchParams.set("appid", API_KEY);
  endpoint.searchParams.set("units", unit);

  const res = await fetch(endpoint);
  if (!res.ok) {
    let message = `Forecast failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {}
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/* ===============================
   RENDER: CURRENT CONDITIONS
   =============================== */
function renderCurrent(data) {
  const city = data.name || "Unknown location";
  const country = (data.sys && data.sys.country) ? data.sys.country : "";
  const temp = Math.round(data.main?.temp ?? 0);
  const feels = Math.round(data.main?.feels_like ?? 0);
  const desc = capitalize(data.weather?.[0]?.description ?? "—");
  const iconCode = data.weather?.[0]?.icon ?? "";
  const humidity = data.main?.humidity ?? "—";
  const wind = data.wind?.speed ?? "—";
  const pressure = data.main?.pressure ?? "—";
  const visibilityKm = data.visibility != null ? (data.visibility / 1000).toFixed(1) : "—";

  // Convert sunrise/sunset using city's timezone offset
  const tz = data.timezone || 0;
  const sunrise = data.sys?.sunrise ? toLocalTime(data.sys.sunrise, tz) : "—";
  const sunset = data.sys?.sunset ? toLocalTime(data.sys.sunset, tz) : "—";

  // Write values to UI
  placeEl.textContent = country ? `${city}, ${country}` : city;
  animateCount(tempEl, temp);      // smooth temperature count-up animation
  descEl.textContent = desc;
  humidityEl.textContent = humidity;
  windEl.textContent = wind;
  pressureEl.textContent = pressure;
  visibilityEl.textContent = visibilityKm;
  feelsLikeEl.textContent = feels;
  sunriseEl.textContent = sunrise;
  sunsetEl.textContent = sunset;

  // Weather icon (2x for retina)
  if (iconCode) {
    iconEl.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
    iconEl.alt = `Weather icon: ${desc}`;
  } else {
    iconEl.removeAttribute("src");
    iconEl.alt = "";
  }

  show(resultCard);
}

// Convert a UNIX timestamp + timezone offset (in seconds) to HH:mm local time
function toLocalTime(unixSeconds, tzOffsetSeconds) {
  const date = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/* ===============================
   RENDER: 5-DAY FORECAST
   Pick one representative (closest to 12:00) per day
   =============================== */
function renderForecast(data) {
  if (!data?.list?.length) { hide(forecastSection); return; }

  // Group forecast entries by date "YYYY-MM-DD"
  const groups = {};
  data.list.forEach(item => {
    const date = item.dt_txt.split(" ")[0];
    (groups[date] ||= []).push(item);
  });

  // Take up to 5 days; pick the entry closest to noon for each day
  const days = Object.entries(groups).slice(0, 5).map(([date, items]) => {
    // Reduce to the entry closest to 12:00
    let pick = items.reduce((a, b) => {
      const ah = Math.abs(new Date(a.dt_txt).getHours() - 12);
      const bh = Math.abs(new Date(b.dt_txt).getHours() - 12);
      return ah <= bh ? a : b;
    });
    const d = new Date(date);
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return {
      weekday,
      temp: Math.round(pick.main?.temp ?? 0),
      desc: capitalize(pick.weather?.[0]?.description ?? ""),
      icon: pick.weather?.[0]?.icon ?? ""
    };
  });

  // Render compact cards
  forecastStrip.innerHTML = "";
  days.forEach(day => {
    const card = document.createElement("div");
    card.className = "forecast-card";
    card.innerHTML = `
      <div class="forecast-day">${day.weekday}</div>
      <img class="forecast-icon" src="https://openweathermap.org/img/wn/${day.icon}@2x.png" alt="${day.desc}">
      <div class="forecast-temp">${day.temp} ${UNIT === "metric" ? "°C" : "°F"}</div>
      <div class="forecast-desc">${day.desc}</div>
    `;
    forecastStrip.appendChild(card);
  });

  show(forecastSection);
}

/* ===============================
   UTILITIES
   =============================== */

// Smoothly animates a number change in an element (used for temperature)
function animateCount(el, toValue, duration = 650) {
  const from = Number(el.textContent) || 0;
  const start = performance.now();
  const diff = toValue - from;

  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const val = Math.round(from + diff * p);
    el.textContent = String(val);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Convert raw errors into friendly messages for users
function handleError(err) {
  let friendly = "Something went wrong. Please try again.";
  if (err && typeof err === "object") {
    if (err.status === 404) friendly = "City not found. Check the spelling.";
    else if (err.status === 401) friendly = "Invalid API key. Double-check your key.";
    else if (err.message) friendly = err.message;
  }
  showError(friendly);
}

// Tiny helpers for show/hide and capitalization
function showError(msg) { errorEl.textContent = msg; show(errorEl); }
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function capitalize(s) { if (!s) return s; return s.charAt(0).toUpperCase() + s.slice(1); }

/* ===============================
   CREDIT BADGE PERSISTENCE
   Remembers whether the user hid the credit
   =============================== */
const creditBadge = document.getElementById("creditBadge");
const hideCreditBtn = document.getElementById("hideCredit");
const showCreditBtn = document.getElementById("showCredit");
const CREDIT_KEY = "show_credit_badge";

// Apply current saved preference (show/hide)
function applyCreditVisibility() {
  const visible = localStorage.getItem(CREDIT_KEY) !== "false";
  creditBadge.classList.toggle("hidden", !visible);
  showCreditBtn.classList.toggle("hidden", visible);
}

// Buttons to toggle credit visibility
hideCreditBtn?.addEventListener("click", () => {
  localStorage.setItem(CREDIT_KEY, "false");
  applyCreditVisibility();
});
showCreditBtn?.addEventListener("click", () => {
  localStorage.setItem(CREDIT_KEY, "true");
  applyCreditVisibility();
});

// Initialize on load
applyCreditVisibility();
