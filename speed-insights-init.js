// Vercel Speed Insights initialization
// This script imports and initializes Speed Insights for vanilla JavaScript projects
import { injectSpeedInsights } from '/public/vendor/speed-insights.mjs';

// Initialize Speed Insights
injectSpeedInsights({
  debug: false, // Set to true during development to see console logs
});
