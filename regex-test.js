const patterns = [
  /^<[^>]+>\s/,
  /^\[[^\]]+\]\s*<[^>]+>\s/,
  /^[a-zA-Z0-9_~]{3,16}\s*[:>]\s/,
  /^\[[^\]]+\]\s*[a-zA-Z0-9_~]{3,16}\s*[:>]\s/,
];

const text = "<zitachi1232> tpa to baseor 2 m i go first but no scam".toLowerCase().trim();

console.log("Text:", text);
for (const p of patterns) {
  console.log(p.source, p.test(text));
}
