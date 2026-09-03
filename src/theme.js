/* Shared look: palette, type stacks, and the shade helper. Kept out of the
   engine on purpose — the engine must not know what colour anything is. */
const C = {
  asphalt: "#43474F", grass: "#5E8A54", grassDark: "#4E7746",
  line: "#FAFAF2", yellow: "#FFC93C", ink: "#191C22",
  red: "#E05252", green: "#3BAA51", blue: "#3B7BE8", amber: "#F0A93C",
  white: "#FAFAF2", bg: "#16181C", signal: "#FFB330",
};
/* Upgrade rarity, painted. The tiers themselves — their order, their
   weights, which part sits in which — are engine data in traits.js,
   which never learns what colour any of it is. Keyed by that file's
   rarity ids. */
const RARITY_C = {
  common: "#9AA3B2",
  uncommon: "#3BAA51",
  rare: "#3B7BE8",
  epic: "#A264E0",
  legendary: "#F0A93C",
};

const FONT_D = "'Rajdhani','Oswald','Arial Narrow',system-ui,sans-serif";
const FONT_U = "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + 255 * amt))));
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, "0")}`;
};
export { C, RARITY_C, FONT_D, FONT_U, shade };
