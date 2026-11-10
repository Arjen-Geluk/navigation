// RD (EPSG:28992) <-> WGS84, benaderingsformules (Schreutelkamp & Strang van Hees), nauwkeurig tot ca. 1 m.
// Dezelfde formules als in getijkaart/index.html.
export function wgsNaarRd(lon, lat) {
  const dp = 0.36 * (lat - 52.15517440), dl = 0.36 * (lon - 5.38720621);
  const X = 155000 + 190094.945 * dl - 11832.228 * dp * dl - 114.221 * dp * dp * dl - 32.391 * dl ** 3 - 0.705 * dp
    - 2.340 * dp ** 3 * dl - 0.608 * dp * dl ** 3 - 0.008 * dl * dl + 0.148 * dp * dp * dl ** 3;
  const Y = 463000 + 309056.544 * dp + 3638.893 * dl * dl + 73.077 * dp * dp - 157.984 * dp * dl * dl + 59.788 * dp ** 3
    + 0.433 * dl - 6.439 * dp * dp * dl * dl - 0.032 * dp * dl + 0.092 * dl ** 4 - 0.054 * dp * dl ** 4;
  return [X, Y];
}

// afstand in meters tussen twee WGS84-punten (klein gebied: platte benadering is ruim voldoende)
export function afstandM(a, b) {
  const kx = 111320 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110574);
}
