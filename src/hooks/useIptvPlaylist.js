import { useCallback, useEffect, useMemo, useState } from 'react';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';

// ── IPTV Playlist Hook ──────────────────────────────────────────────────
// Fetches an m3u playlist from iptv-org (or a custom URL), parses it into
// channel objects, and exposes category filtering + favorites.
//
// Each channel:
//   {
//     id: 'us-abc-news',             // stable ID derived from name + url
//     name: 'ABC News',
//     url: 'https://.../stream.m3u8',
//     logo: 'https://.../logo.png',
//     group: 'News',                 // #EXTGRP or category
//     country: 'US',                 // inferred from tvg-id or group
//     lang: 'English',
//   }

const PLAYLIST_SOURCE_KEY = 'perci_iptv_source';
const FAVORITES_KEY = 'perci_iptv_favorites';
const LAST_CHANNEL_KEY = 'perci_iptv_last_channel';

const DEFAULT_SOURCES = [
  { id: 'news', label: 'News', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { id: 'movies', label: 'Movies', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { id: 'sports', label: 'Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'music', label: 'Music', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { id: 'documentary', label: 'Documentary', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { id: 'kids', label: 'Kids', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { id: 'entertainment', label: 'Entertainment', url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  { id: 'science', label: 'Science', url: 'https://iptv-org.github.io/iptv/categories/science.m3u' },
];

// Parse a single #EXTINF line + its following URL line into a channel object.
function parseExtinf(line, urlLine, index) {
  const url = (urlLine || '').trim();
  if (!url || !url.startsWith('http')) return null;

  // Extract attributes from #EXTINF line
  const attrs = {};
  const attrRegex = /([\w-]+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(line)) !== null) {
    attrs[match[1]] = match[2];
  }

  // Channel name is everything after the last comma
  const commaIdx = line.lastIndexOf(',');
  const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : `Channel ${index + 1}`;
  if (!name) return null;

  const group = attrs['group-title'] || '';
  const tvgId = attrs['tvg-id'] || '';
  const country = extractCountry(tvgId, group, name);

  // Stable ID from tvg-id or name hash
  const id = tvgId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `ch-${index}`;

  return {
    id: `${id}-${index}`,
    name,
    url,
    logo: attrs['tvg-logo'] || '',
    group,
    country,
    lang: detectLanguage(name, group),
  };
}

function extractCountry(tvgId, group, name) {
  // tvg-id often ends with country code: ".us", ".uk", ".fr"
  const tvgMatch = tvgId.match(/\.([a-z]{2})$/i);
  if (tvgMatch) return tvgMatch[1].toUpperCase();

  // Group sometimes starts with country code: "US | News", "UK | Entertainment"
  const groupMatch = group.match(/^([A-Z]{2})\s*[|]/i) || group.match(/^[A-Z]{2}\s/);
  if (groupMatch) return groupMatch[1].toUpperCase();

  // Fallback: check name for common country indicators
  const upper = name.toUpperCase();
  if (/\b(US|USA|AMERICAN)\b/.test(upper)) return 'US';
  if (/\b(UK|BRITISH|GB|BBC)\b/.test(upper)) return 'UK';
  if (/\b(FR|FRENCH|FRANCE)\b/.test(upper)) return 'FR';
  if (/\b(DE|GERMAN|DEUTSCH)\b/.test(upper)) return 'DE';
  if (/\b(ES|SPANISH|ESPANOL|ESPAÑA)\b/.test(upper)) return 'ES';
  if (/\b(IT|ITALIAN|ITALIA)\b/.test(upper)) return 'IT';
  if (/\b(BR|BRAZIL|BRASIL|PORTUG)\b/.test(upper)) return 'BR';
  if (/\b(JP|JAPAN|JAPANESE)\b/.test(upper)) return 'JP';
  if (/\b(KR|KOREA|KOREAN)\b/.test(upper)) return 'KR';
  if (/\b(CN|CHINA|CHINESE)\b/.test(upper)) return 'CN';
  if (/\b(IN|INDIA|INDIAN|HINDI)\b/.test(upper)) return 'IN';
  if (/\b(RU|RUSSIAN|RUSSIA)\b/.test(upper)) return 'RU';
  if (/\b(AR|ARGENTINA|ARGENTINO)\b/.test(upper)) return 'AR';
  if (/\b(MX|MEXICO|MEXICAN)\b/.test(upper)) return 'MX';
  if (/\b(CA|CANADA|CANADIAN)\b/.test(upper)) return 'CA';
  if (/\b(AU|AUSTRALIAN|AUSTRALIA)\b/.test(upper)) return 'AU';
  if (/\b(TR|TURKISH|TURKEY|TÜRK)\b/.test(upper)) return 'TR';
  if (/\b(PL|POLISH|POLAND|POLSKI)\b/.test(upper)) return 'PL';
  if (/\b(NL|DUTCH|NETHERLANDS|NEDERLANDS)\b/.test(upper)) return 'NL';
  if (/\b(SE|SWEDISH|SWEDEN|SVENSKA)\b/.test(upper)) return 'SE';
  if (/\b(NO|NORWEGIAN|NORWAY|NORSK)\b/.test(upper)) return 'NO';
  if (/\b(DK|DANISH|DENMARK|DANSK)\b/.test(upper)) return 'DK';
  if (/\b(FI|FINNISH|FINLAND|SUOMI)\b/.test(upper)) return 'FI';
  if (/\b(PT|PORTUGAL|PORTUGUESE)\b/.test(upper)) return 'PT';
  if (/\b(GR|GREEK|GREECE|ΕΛΛΗΝΙΚΑ)\b/.test(upper)) return 'GR';
  if (/\b(CZ|CZECH|ČESKÝ|ČESKO)\b/.test(upper)) return 'CZ';
  if (/\b(HU|HUNGARY|HUNGARIAN|MAGYAR)\b/.test(upper)) return 'HU';
  if (/\b(RO|ROMANIAN|ROMANIA|ROMÂNĂ)\b/.test(upper)) return 'RO';
  if (/\b(RS|SERBIAN|SERBIA|SRPSKI)\b/.test(upper)) return 'RS';
  if (/\b(BG|BULGARIAN|BULGARIA)\b/.test(upper)) return 'BG';
  if (/\b(HR|CROATIAN|CROATIA|HRVATSKA)\b/.test(upper)) return 'HR';
  if (/\b(SI|SLOVENIAN|SLOVENIA|SLOVENŠČINA)\b/.test(upper)) return 'SI';
  if (/\b(SK|SLOVAK|SLOVAKIA|SLOVENČINA)\b/.test(upper)) return 'SK';
  if (/\b(EE|ESTONIAN|ESTONIA|ESTI)\b/.test(upper)) return 'EE';
  if (/\b(LV|LATVIAN|LATVIA|LATVIEŠU)\b/.test(upper)) return 'LV';
  if (/\b(LT|LITHUANIAN|LITHUANIA|LIETUVIŲ)\b/.test(upper)) return 'LT';
  if (/\b(UA|UKRAINIAN|UKRAINE|УКРАЇНА)\b/.test(upper)) return 'UA';
  if (/\b(BY|BELARUSIAN|BELARUS|БЕЛАРУСЬ)\b/.test(upper)) return 'BY';
  if (/\b(MD|MOLDOVAN|MOLDOVA|MOLDOVENEASCĂ)\b/.test(upper)) return 'MD';
  if (/\b(AL|ALBANIAN|ALBANIA|SHQIP)\b/.test(upper)) return 'AL';
  if (/\b(BA|BOSNIAN|BOSNIA|BOSANSKI)\b/.test(upper)) return 'BA';
  if (/\b(MK|MACEDONIAN|MACEDONIA|МАКЕДОНСКИ)\b/.test(upper)) return 'MK';
  if (/\b(ME|MONTENEGRIN|MONTENEGOR|CRNOGORSKI)\b/.test(upper)) return 'ME';
  if (/\b(XK|KOSOVO|KOSOVAR)\b/.test(upper)) return 'XK';
  if (/\b(CH|SWISS|SCHWEIZ|SUISSE|SVIZZERA)\b/.test(upper)) return 'CH';
  if (/\b(AT|AUSTRIAN|ÖSTERREICH|ÖSTERREICHISCH)\b/.test(upper)) return 'AT';
  if (/\b(IE|IRISH|IRELAND|ÉIREANN)\b/.test(upper)) return 'IE';
  if (/\b(BE|BELGIAN|BELGIUM|BELGIQUE|BELGISCH)\b/.test(upper)) return 'BE';
  if (/\b(LU|LUXEMBOURG|LUXEMBOURGISH|LËTZEBUERGESCH)\b/.test(upper)) return 'LU';
  if (/\b(IS|ICELANDIC|ICELAND|ÍSLENSKA)\b/.test(upper)) return 'IS';
  if (/\b(NO|NORWAY|NORSK)\b/.test(upper)) return 'NO';
  if (/\b(IL|ISRAELI|ISRAEL|ישראל|עברית)\b/.test(upper)) return 'IL';
  if (/\b(SA|SAUDI|SAUDI ARABIA|العربية السعودية)\b/.test(upper)) return 'SA';
  if (/\b(AE|UAE|UNITED ARAB EMIRATES|الإمارات)\b/.test(upper)) return 'AE';
  if (/\b(QA|QATARI|QATAR|قطر)\b/.test(upper)) return 'QA';
  if (/\b(KW|KUWAITI|KUWAIT|الكويت)\b/.test(upper)) return 'KW';
  if (/\b(BH|BAHRAINI|BAHRAIN|البحرين)\b/.test(upper)) return 'BH';
  if (/\b(OM|OMANI|OMAN|عمان)\b/.test(upper)) return 'OM';
  if (/\b(JO|JORDANIAN|JORDAN|الأردن)\b/.test(upper)) return 'JO';
  if (/\b(LB|LEBANESE|LEBANON|لبنان)\b/.test(upper)) return 'LB';
  if (/\b(SY|SYRIAN|SYRIA|سوريا)\b/.test(upper)) return 'SY';
  if (/\b(IQ|IRAQI|IRAQ|العراق)\b/.test(upper)) return 'IQ';
  if (/\b(IR|IRANIAN|IRAN|ایران|فارسی)\b/.test(upper)) return 'IR';
  if (/\b(PK|PAKISTANI|PAKISTAN|پاکستان|اردو)\b/.test(upper)) return 'PK';
  if (/\b(BD|BANGLADESHI|BANGLADESH|বাংলাদেশ)\b/.test(upper)) return 'BD';
  if (/\b(LK|SRI LANKAN|SRI LANKA|ශ්‍රී ලංකා)\b/.test(upper)) return 'LK';
  if (/\b(NP|NEPALI|NEPAL|नेपाल)\b/.test(upper)) return 'NP';
  if (/\b(MM|MYANMAR|MYANMAR|မြန်မာ)\b/.test(upper)) return 'MM';
  if (/\b(TH|THAI|THAILAND|ไทย)\b/.test(upper)) return 'TH';
  if (/\b(VN|VIETNAMESE|VIETNAM|VIỆT NAM)\b/.test(upper)) return 'VN';
  if (/\b(KH|CAMBODIAN|CAMBODIA|កម្ពុជា)\b/.test(upper)) return 'KH';
  if (/\b(LA|LAOTIAN|LAOS|ລາວ)\b/.test(upper)) return 'LA';
  if (/\b(MY|MALAYSIAN|MALAYSIA|MELAYU)\b/.test(upper)) return 'MY';
  if (/\b(SG|SINGAPORE|SINGAPOREAN)\b/.test(upper)) return 'SG';
  if (/\b(ID|INDONESIAN|INDONESIA|BASA INDONESIA)\b/.test(upper)) return 'ID';
  if (/\b(PH|FILIPINO|PHILIPPINES|TAGALOG)\b/.test(upper)) return 'PH';
  if (/\b(TW|TAIWANESE|TAIWAN|台灣|繁體)\b/.test(upper)) return 'TW';
  if (/\b(HK|HONG KONG|香港)\b/.test(upper)) return 'HK';
  if (/\b(MO|MACAU|MACANESE|澳門)\b/.test(upper)) return 'MO';
  if (/\b(NZ|NEW ZEALAND|NEW ZEALANDER)\b/.test(upper)) return 'NZ';
  if (/\b(FJ|FIJIAN|FIJI)\b/.test(upper)) return 'FJ';
  if (/\b(PG|PAPUA NEW GUINEA|PNG)\b/.test(upper)) return 'PG';
  if (/\b(NG|NIGERIAN|NIGERIA)\b/.test(upper)) return 'NG';
  if (/\b(GH|GHANAIAN|GHANA)\b/.test(upper)) return 'GH';
  if (/\b(KE|KENYAN|KENYA)\b/.test(upper)) return 'KE';
  if (/\b(TZ|TANZANIAN|TANZANIA)\b/.test(upper)) return 'TZ';
  if (/\b(ZA|SOUTH AFRICAN|SOUTH AFRICA)\b/.test(upper)) return 'ZA';
  if (/\b(EG|EGYPTIAN|EGYPT|مصر|العربية)\b/.test(upper)) return 'EG';
  if (/\b(MA|MOROCCAN|MOROCCO|المغرب|العربية)\b/.test(upper)) return 'MA';
  if (/\b(TN|TUNISIAN|TUNISIA|تونس|العربية)\b/.test(upper)) return 'TN';
  if (/\b(DZ|ALGERIAN|ALGERIA|الجزائر|العربية)\b/.test(upper)) return 'DZ';
  if (/\b(LY|LIBYAN|LIBYA|ليبيا|العربية)\b/.test(upper)) return 'LY';
  if (/\b(SD|SUDANESE|SUDAN|السودان|العربية)\b/.test(upper)) return 'SD';
  if (/\b(ET|ETHIOPIAN|ETHIOPIA|ኢትዮጵያ)\b/.test(upper)) return 'ET';
  if (/\b(UG|UGANDAN|UGANDA)\b/.test(upper)) return 'UG';
  if (/\b(RW|RWANDAN|RWANDA|KINYARWANDA)\b/.test(upper)) return 'RW';
  if (/\b(CD|CONGOLESE|DRC|CONGO-KINSHASA)\b/.test(upper)) return 'CD';
  if (/\b(CG|CONGOLESE|CONGO-BRAZZAVILLE)\b/.test(upper)) return 'CG';
  if (/\b(CM|CAMEROONIAN|CAMEROON|CAMEROUN)\b/.test(upper)) return 'CM';
  if (/\b(CF|CENTRAL AFRICAN|CAR)\b/.test(upper)) return 'CF';
  if (/\b(TD|CHADIAN|CHAD|TCHAD)\b/.test(upper)) return 'TD';
  if (/\b(NE|NIGERIEN|NIGER|NIGÉRIA)\b/.test(upper)) return 'NE';
  if (/\b(BJ|BENINESE|BENIN|BÉNIN)\b/.test(upper)) return 'BJ';
  if (/\b(TG|TOGOLESE|TOGO|TOGOLAIS)\b/.test(upper)) return 'TG';
  if (/\b(BF|BURKINABE|BURKINA FASO)\b/.test(upper)) return 'BF';
  if (/\b(CI|IVORIAN|CÔTE D'IVOIRE|IVOIRIEN)\b/.test(upper)) return 'CI';
  if (/\b(LR|LIBERIAN|LIBERIA)\b/.test(upper)) return 'LR';
  if (/\b(SL|SIERRA LEONEAN|SIERRA LEONE)\b/.test(upper)) return 'SL';
  if (/\b(GN|GUINEAN|GUINEE|GUINÉE)\b/.test(upper)) return 'GN';
  if (/\b(GW|BISSAU-GUINEAN|GUINÉ-BISSAU)\b/.test(upper)) return 'GW';
  if (/\b(SN|SENEGALESE|SENEGAL|SÉNÉGAL)\b/.test(upper)) return 'SN';
  if (/\b(GM|GAMBIAN|GAMBIA)\b/.test(upper)) return 'GM';
  if (/\b(ML|MALIAN|MALI|MAlien)\b/.test(upper)) return 'ML';
  if (/\b(MR|MAURITANIAN|MAURITANIE|MAURITANIA|موريتانيا)\b/.test(upper)) return 'MR';
  if (/\b(MU|MAURITIAN|MAURITIUS|MAURICE)\b/.test(upper)) return 'MU';
  if (/\b(MG|MALAGASY|MADAGASCAR|MALAGASY)\b/.test(upper)) return 'MG';
  if (/\b(ZM|ZAMBIAN|ZAMBIA)\b/.test(upper)) return 'ZM';
  if (/\b(ZW|ZIMBABWEAN|ZIMBABWE)\b/.test(upper)) return 'ZW';
  if (/\b(BW|BOTSWANAN|BOTSWANA)\b/.test(upper)) return 'BW';
  if (/\b(NA|NAMIBIAN|NAMIBIA)\b/.test(upper)) return 'NA';
  if (/\b(SZ|SWAZI|SWAZILAND|ESWATINI)\b/.test(upper)) return 'SZ';
  if (/\b(LS|LESOTHO|LESOTHO|MOSOTHO)\b/.test(upper)) return 'LS';
  if (/\b(MW|MALAWIAN|MALAWI)\b/.test(upper)) return 'MW';
  if (/\b(MZ|MOZAMBICAN|MOZAMBIQUE|MOÇAMBIQUE)\b/.test(upper)) return 'MZ';
  if (/\b(AO|ANGOLAN|ANGOLA|ANGOLANO)\b/.test(upper)) return 'AO';
  if (/\b(GA|GABONESE|GABON|GABONAIS)\b/.test(upper)) return 'GA';
  if (/\b(GQ|EQUATORIAL GUINEAN|GUINEA ECUATORIAL)\b/.test(upper)) return 'GQ';
  if (/\b(ST|SAO TOMEAN|SÃO TOMÉ)\b/.test(upper)) return 'ST';
  if (/\b(CV|CAPE VERDEAN|CABO VERDE|CAPE VERDE)\b/.test(upper)) return 'CV';
  if (/\b(KM|COMORIAN|COMOROS|COMORES)\b/.test(upper)) return 'KM';
  if (/\b(YT|MAHORAN|MAYOTTE|MAHORAIS)\b/.test(upper)) return 'YT';
  if (/\b(RE|RÉUNIONNAISE|RÉUNION|REUNION)\b/.test(upper)) return 'RE';
  if (/\b(SC|SEYCHELLOIS|SEYCHELLES)\b/.test(upper)) return 'SC';
  if (/\b(MU|MAURITIAN|MAURITIUS)\b/.test(upper)) return 'MU';
  if (/\b(DJ|DJIBOUTIAN|DJIBOUTI|جيبوتي)\b/.test(upper)) return 'DJ';
  if (/\b(SO|SOMALI|SOMALIA|SOALIYA)\b/.test(upper)) return 'SO';
  if (/\b(ER|ERITREAN|ERITREA|إريتريا)\b/.test(upper)) return 'ER';
  if (/\b(SS|SOUTH SUDANESE|SOUTH SUDAN)\b/.test(upper)) return 'SS';

  // No country detected — return empty string so it doesn't pollute the country filter
  return '';
}

function detectLanguage(name, group) {
  const text = `${name} ${group}`.toUpperCase();
  if (/\b(ESPANOL|SPANISH|ESPANOL|LATINO)\b/.test(text)) return 'Spanish';
  if (/\b(FRENCH|FRANCAIS|FRANÇAIS)\b/.test(text)) return 'French';
  if (/\b(GERMAN|DEUTSCH)\b/.test(text)) return 'German';
  if (/\b(PORTUG|BRASIL|BRASILEIRO)\b/.test(text)) return 'Portuguese';
  if (/\b(ITALIAN|ITALIANO)\b/.test(text)) return 'Italian';
  if (/\b(RUSSIAN|RUSSKIY)\b/.test(text)) return 'Russian';
  if (/\b(CHINESE|ZH|CN)\b/.test(text)) return 'Chinese';
  if (/\b(JAPANESE|JP|JA)\b/.test(text)) return 'Japanese';
  if (/\b(KOREAN|KO|KR)\b/.test(text)) return 'Korean';
  if (/\b(HINDI|IN|INDIAN)\b/.test(text)) return 'Hindi';
  if (/\b(ARABIC|AR|العربية)\b/.test(text)) return 'Arabic';
  if (/\b(TURKISH|TR|TÜRK)\b/.test(text)) return 'Turkish';
  if (/\b(DUTCH|NEDERLANDS|NL)\b/.test(text)) return 'Dutch';
  if (/\b(POLISH|PL|POLSKI)\b/.test(text)) return 'Polish';
  if (/\b(UKRAINIAN|UA|УКРАЇНСЬКА)\b/.test(text)) return 'Ukrainian';
  return 'English';
}

function parseM3u(content) {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;
    const urlLine = (i + 1 < lines.length) ? lines[i + 1] : '';
    const channel = parseExtinf(line, urlLine, channels.length);
    if (channel) channels.push(channel);
  }

  return channels;
}

function dedupeChannels(channels) {
  const seen = new Set();
  return channels.filter((ch) => {
    const key = `${ch.name}::${ch.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function useIptvPlaylist() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSource, setActiveSource] = useState(() =>
    readStringStorage(PLAYLIST_SOURCE_KEY, DEFAULT_SOURCES[0].id)
  );
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(readStringStorage(FAVORITES_KEY, '[]')) || [];
    } catch {
      return [];
    }
  });
  const [lastChannelId, setLastChannelId] = useState(() =>
    readStringStorage(LAST_CHANNEL_KEY, '')
  );

  const sources = DEFAULT_SOURCES;

  // Fetch + parse the active playlist
  const loadPlaylist = useCallback(async (sourceId) => {
    const source = DEFAULT_SOURCES.find((s) => s.id === sourceId) || DEFAULT_SOURCES[0];
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(source.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const parsed = dedupeChannels(parseM3u(text));
      setChannels(parsed);
      writeStringStorage(PLAYLIST_SOURCE_KEY, sourceId);
    } catch (err) {
      setError(err.message || 'Failed to load playlist');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount and source change
  useEffect(() => {
    loadPlaylist(activeSource);
  }, [activeSource, loadPlaylist]);

  // Derived: unique categories from channels (split multi-value groups like "News;Public")
  const categories = useMemo(() => {
    const set = new Set();
    for (const ch of channels) {
      if (ch.group) {
        // Some groups are semicolon-separated: "News;Public"
        for (const g of ch.group.split(';')) {
          const trimmed = g.trim();
          if (trimmed) set.add(trimmed);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [channels]);

  // Derived: unique countries (exclude empty strings — undetected countries)
  const countries = useMemo(() => {
    const set = new Set();
    for (const ch of channels) {
      if (ch.country && ch.country.length === 2) set.add(ch.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [channels]);

  // Derived: favorite channels
  const favoriteChannels = useMemo(() => {
    const favSet = new Set(favorites);
    return channels.filter((ch) => favSet.has(ch.id));
  }, [channels, favorites]);

  // Toggle favorite
  const toggleFavorite = useCallback((channelId) => {
    setFavorites((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId];
      writeStringStorage(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Record last-watched channel
  const setLastChannel = useCallback((channelId) => {
    setLastChannelId(channelId);
    writeStringStorage(LAST_CHANNEL_KEY, channelId);
  }, []);

  // Find a channel by ID
  const getChannelById = useCallback(
    (id) => channels.find((ch) => ch.id === id) || null,
    [channels]
  );

  // Search channels
  const searchChannels = useCallback(
    (query) => {
      if (!query) return channels;
      const q = query.toLowerCase();
      return channels.filter(
        (ch) =>
          ch.name.toLowerCase().includes(q) ||
          ch.group.toLowerCase().includes(q) ||
          ch.country.toLowerCase().includes(q)
      );
    },
    [channels]
  );

  return {
    channels,
    loading,
    error,
    activeSource,
    setActiveSource,
    sources,
    categories,
    countries,
    favorites,
    favoriteChannels,
    toggleFavorite,
    lastChannelId,
    setLastChannel,
    getChannelById,
    searchChannels,
    reload: () => loadPlaylist(activeSource),
  };
}
