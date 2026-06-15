/**
 * Weather Service to fetch coordinates and weather conditions from the Open-Meteo API.
 */

export async function getCoordinatesForCity(cityName) {
    if (!cityName) return null;
    
    // Check if the input is a pair of coordinates, e.g. "40.7128, -74.0060" or "40.7128 -74.0060"
    const match = cityName.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$/) 
        || cityName.match(/^\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*$/);
    if (match) {
        return {
            latitude: parseFloat(match[1]),
            longitude: parseFloat(match[2]),
            name: `${parseFloat(match[1])}, ${parseFloat(match[2])}`
        };
    }

    try {
        const response = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
        );
        if (!response.ok) {
            throw new Error(`Geocoding request failed: ${response.status}`);
        }
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const result = data.results[0];
            return {
                latitude: result.latitude,
                longitude: result.longitude,
                name: `${result.name}${result.admin1 ? `, ${result.admin1}` : ''}${result.country ? `, ${result.country}` : ''}`
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching geocoding coordinates:', error);
        return null;
    }
}

function isValidCoordinate(latitude, longitude) {
    return Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= -90
        && latitude <= 90
        && longitude >= -180
        && longitude <= 180;
}

export function getLocaleLocationName() {
    if (typeof Intl === 'undefined') return '';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const city = timeZone.split('/').pop();
    return city ? city.replace(/_/g, ' ') : '';
}

export async function getCoordinatesForBrowserLocale() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return null;
    }

    return new Promise((resolve) => {
        const timeoutId = window.setTimeout(() => resolve(null), 6000);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                window.clearTimeout(timeoutId);
                const { latitude, longitude } = position.coords || {};
                if (!isValidCoordinate(latitude, longitude)) {
                    resolve(null);
                    return;
                }
                resolve({
                    latitude,
                    longitude,
                    name: 'Current location'
                });
            },
            () => {
                window.clearTimeout(timeoutId);
                resolve(null);
            },
            { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 6000 }
        );
    });
}

export async function getCoordinatesForLocale() {
    const browserCoords = await getCoordinatesForBrowserLocale();
    if (browserCoords) return browserCoords;

    const localeLocation = getLocaleLocationName();
    return localeLocation ? getCoordinatesForCity(localeLocation) : null;
}

export async function getWeatherForCoordinates(latitude, longitude) {
    if (!isValidCoordinate(latitude, longitude)) return null;

    try {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code`
        );
        if (!response.ok) {
            throw new Error(`Weather request failed: ${response.status}`);
        }
        const data = await response.json();
        if (data.current && typeof data.current.weather_code === 'number') {
            return data.current.weather_code;
        }
        return null;
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return null;
    }
}

export function mapWeatherCode(code) {
    if (code === 0 || code === 1) {
        return 'clear';
    } else if ([2, 3, 45, 48].includes(code)) {
        return 'clouds';
    } else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
        return 'rain';
    } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
        return 'snow';
    }
    return 'clear'; // default fallback
}

export async function fetchWeather(locationString) {
    if (!locationString) return null;
    const coords = await getCoordinatesForCity(locationString);
    if (!coords) return null;
    const weatherCode = await getWeatherForCoordinates(coords.latitude, coords.longitude);
    if (weatherCode === null) return null;
    
    return {
        condition: mapWeatherCode(weatherCode),
        locationName: coords.name,
        latitude: coords.latitude,
        longitude: coords.longitude
    };
}

export async function fetchWeatherForLocale() {
    const coords = await getCoordinatesForLocale();
    if (!coords) return null;
    const weatherCode = await getWeatherForCoordinates(coords.latitude, coords.longitude);
    if (weatherCode === null) return null;

    return {
        condition: mapWeatherCode(weatherCode),
        locationName: coords.name,
        latitude: coords.latitude,
        longitude: coords.longitude
    };
}
