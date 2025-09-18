// Weather App Plus: adds °C/°F toggle, 5-day forecast, and more details.
// (Built on top of your enhanced version.)

const API_KEY = "9516a74ca0cbb9eebb06656902d13844"; 

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

const unitButtons = document.querySelectorAll(".unit-btn");
let UNIT = localStorage.getItem("weather_unit") || "metric";
applyUnitButtons();

// Suggestions
const suggestionsEl = document.getElementById("suggestions");
let suggestionIndex = -1;
let currentSuggestions = [];

function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

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
    currentSuggestions = list.map((c) => ({
      name: c.name,
      country: c.country || "",
      state: c.state || "",
      lat: c.lat,
      lon: c.lon,
      label: c.country && c.state ? `${c.name}, ${c.state}, ${c.country}` : c.country ? `${c.name}, ${c.country}` : c.name
    }));
    renderSuggestions(currentSuggestions);
  } catch (e) { hide(suggestionsEl); }
}, 250);

function renderSuggestions(items) {
  suggestionsEl.innerHTML = "";
  suggestionIndex = -1;
  if (!items || items.length === 0) { hide(suggestionsEl); return; }
  for (const [i, item] of items.entries()) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.index = String(i);
    li.innerHTML = `<span>${escapeHtml(item.name)}</span>
      <span class="suggestion-secondary">${escapeHtml((item.state ? item.state + ", " : "") + item.country)}</span>`;
    li.addEventListener("click", () => selectSuggestion(i));
    suggestionsEl.appendChild(li);
  }
  show(suggestionsEl);
}
function selectSuggestion(i) {
  const sel = currentSuggestions[i];
  if (!sel) return;
  cityInput.value = sel.label;
  hide(suggestionsEl);
  form.dispatchEvent(new Event("submit", { cancelable: true }));
}
cityInput.addEventListener("input", (e) => fetchCitySuggestions(e.target.value.trim()));
cityInput.addEventListener("keydown", (e) => {
  const visible = !suggestionsEl.classList.contains("hidden");
  if (!visible) return;
  const max = currentSuggestions.length;
  if (e.key === "ArrowDown") { e.preventDefault(); suggestionIndex = (suggestionIndex + 1) % max; updateActiveSuggestion(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); suggestionIndex = (suggestionIndex - 1 + max) % max; updateActiveSuggestion(); }
  else if (e.key === "Enter") { if (suggestionIndex >= 0 && suggestionIndex < max) { e.preventDefault(); selectSuggestion(suggestionIndex);} }
  else if (e.key === "Escape") { hide(suggestionsEl); }
});
function updateActiveSuggestion() {
  const items = Array.from(suggestionsEl.querySelectorAll("li"));
  items.forEach((el) => el.classList.remove("active"));
  if (suggestionIndex >= 0 && suggestionIndex < items.length) {
    items[suggestionIndex].classList.add("active");
  }
}
function escapeHtml(s) { return (s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

// Unit toggle
unitButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    UNIT = btn.dataset.unit;
    localStorage.setItem("weather_unit", UNIT);
    applyUnitButtons();
    // Re-run search if a city is present
    if (cityInput.value.trim()) form.dispatchEvent(new Event("submit", { cancelable: true }));
  });
});
function applyUnitButtons() {
  unitButtons.forEach(b => b.classList.toggle("active", b.dataset.unit === UNIT));
  unitLabel.textContent = UNIT === "metric" ? "°C" : "°F";
  windUnitEl.textContent = UNIT === "metric" ? "m/s" : "mph";
}

// Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();
  hide(errorEl); hide(resultCard); hide(forecastSection);
  if (!city) { showError("Please enter a city name."); return; }
  show(loaderEl);
  try {
    const current = await fetchCurrent(city, UNIT);
    renderCurrent(current);
    const { lat, lon } = current.coord || {};
    if (lat != null && lon != null) {
      const forecast = await fetchForecast(lat, lon, UNIT);
      renderForecast(forecast);
    }
  } catch (err) {
    handleError(err);
  } finally {
    hide(loaderEl);
  }
});

// API fetchers
async function fetchCurrent(city, unit) {
  const endpoint = new URL("https://api.openweathermap.org/data/2.5/weather");
  endpoint.searchParams.set("q", city);
  endpoint.searchParams.set("appid", API_KEY);
  endpoint.searchParams.set("units", unit);
  const res = await fetch(endpoint); 
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try { const body = await res.json(); if (body?.message) message = body.message; } catch {}
    const error = new Error(message); error.status = res.status; throw error;
  }
  return res.json();
}

async function fetchForecast(lat, lon, unit) {
  const endpoint = new URL("https://api.openweathermap.org/data/2.5/forecast");
  endpoint.searchParams.set("lat", lat);
  endpoint.searchParams.set("lon", lon);
  endpoint.searchParams.set("appid", API_KEY);
  endpoint.searchParams.set("units", unit);
  const res = await fetch(endpoint);
  if (!res.ok) {
    let message = `Forecast failed with status ${res.status}`;
    try { const body = await res.json(); if (body?.message) message = body.message; } catch {}
    const error = new Error(message); error.status = res.status; throw error;
  }
  return res.json();
}

// Render current
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

  const tz = data.timezone || 0;
  const sunrise = data.sys?.sunrise ? toLocalTime(data.sys.sunrise, tz) : "—";
  const sunset = data.sys?.sunset ? toLocalTime(data.sys.sunset, tz) : "—";

  placeEl.textContent = country ? `${city}, ${country}` : city;
  animateCount(tempEl, temp);
  descEl.textContent = desc;
  humidityEl.textContent = humidity;
  windEl.textContent = wind;
  pressureEl.textContent = pressure;
  visibilityEl.textContent = visibilityKm;
  feelsLikeEl.textContent = feels;
  sunriseEl.textContent = sunrise;
  sunsetEl.textContent = sunset;

  if (iconCode) {
    iconEl.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
    iconEl.alt = `Weather icon: ${desc}`;
  } else {
    iconEl.removeAttribute("src");
    iconEl.alt = "";
  }
  show(resultCard);
}

function toLocalTime(unixSeconds, tzOffsetSeconds) {
  const date = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Render forecast (5 days - pick midday slots)
function renderForecast(data) {
  if (!data?.list?.length) { hide(forecastSection); return; }

  // Group by date (yyyy-mm-dd) then choose a representative entry (around 12:00)
  const groups = {};
  data.list.forEach(item => {
    const date = item.dt_txt.split(" ")[0];
    (groups[date] ||= []).push(item);
  });

  const days = Object.entries(groups).slice(0, 5).map(([date, items]) => {
    // Find item closest to 12:00
    let pick = items.reduce((a,b) => {
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

// Utilities
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

function handleError(err) {
  let friendly = "Something went wrong. Please try again.";
  if (err && typeof err === "object") {
    if (err.status === 404) friendly = "City not found. Check the spelling.";
    else if (err.status === 401) friendly = "Invalid API key. Double-check your key.";
    else if (err.message) friendly = err.message;
  }
  showError(friendly);
}
function showError(msg) { errorEl.textContent = msg; show(errorEl); }
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function capitalize(s) { if (!s) return s; return s.charAt(0).toUpperCase() + s.slice(1); }

// Credit badge persistence
const creditBadge = document.getElementById("creditBadge");
const hideCreditBtn = document.getElementById("hideCredit");
const showCreditBtn = document.getElementById("showCredit");
const CREDIT_KEY = "show_credit_badge";
function applyCreditVisibility() {
  const visible = localStorage.getItem(CREDIT_KEY) !== "false";
  creditBadge.classList.toggle("hidden", !visible);
  showCreditBtn.classList.toggle("hidden", visible);
}
hideCreditBtn?.addEventListener("click", () => { localStorage.setItem(CREDIT_KEY, "false"); applyCreditVisibility(); });
showCreditBtn?.addEventListener("click", () => { localStorage.setItem(CREDIT_KEY, "true"); applyCreditVisibility(); });
applyCreditVisibility();
