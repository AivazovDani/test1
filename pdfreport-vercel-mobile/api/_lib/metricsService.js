/*
 * Metrics service module
 *
 * This module orchestrates metric retrieval for different social media
 * platforms. When provided with a platform identifier and profile URL, it
 * delegates to the corresponding integration module (e.g., Instagram or
 * TikTok) to fetch real or scraped analytics. If no platform is specified
 * or if the integration fails, it falls back to synthetic metrics for
 * demonstration purposes. The synthetic metrics functions are retained
 * from the original stub implementation to preserve an easy, standalone
 * experience when real API calls are not possible.
 */

// Import integration modules. If additional platforms are added, import them here.
// Import integration modules from the local integrations directory. In this
// deployment, `_lib` contains its own `integrations` folder, so we can
// reference them relative to this file.
import { getInstagramMetrics } from './integrations/instagram.js';
import { getTikTokMetrics } from './integrations/tiktok.js';

// Note: we avoid external dependencies like date‑fns to keep this example lightweight.

/**
 * Generate a sequence of dates and a simple follower growth curve.
 *
 * @param {Date} startDate - The start of the reporting period.
 * @param {Date} endDate - The end of the reporting period.
 * @returns {Array<{date: string, count: number}>}
 */
function generateFollowerHistory(startDate, endDate) {
  const history = [];
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  let currentCount = 1000; // starting follower count
  for (let i = 0; i <= totalDays; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    // Simulate steady growth with a bit of randomness
    const delta = Math.floor(Math.random() * 10 + 5); // between +5 and +14
    if (i > 0) {
      currentCount += delta;
    }
    history.push({ date: date.toISOString(), count: currentCount });
  }
  return history;
}

/**
 * Generate a list of top posts with mock titles and engagement stats.
 *
 * @returns {Array<{title: string, likes: number, comments: number}>}
 */
function generateTopPosts() {
  const sampleTitles = [
    'Behind the scenes of our latest product',
    '5 tips for increasing productivity',
    'Our journey to 10K followers',
    'Customer spotlight: Meet Jane',
    'How we give back to the community',
  ];
  return sampleTitles.map(title => ({
    title,
    likes: Math.floor(Math.random() * 500 + 100), // 100 to 599 likes
    comments: Math.floor(Math.random() * 50 + 10), // 10 to 59 comments
  }));
}

/**
 * Fetch metrics for a specified date range and platform.
 *
 * If a platform and profile URL are provided, this function delegates
 * metric retrieval to the corresponding integration module. Supported
 * platforms include:
 *   - 'instagram': uses the Instagram integration to scrape follower data.
 *   - 'tiktok': uses the TikTok integration to scrape follower data.
 *
 * If no platform is provided or if the integration throws an error, the
 * function falls back to generating synthetic metrics using the helper
 * functions defined above.
 *
 * @param {string|undefined} since - ISO date string for start date.
 * @param {string|undefined} until - ISO date string for end date.
 * @param {string|undefined} platform - Social platform identifier (e.g., 'instagram', 'tiktok').
 * @param {string|undefined} profileUrl - Full profile URL for the selected platform.
 * @returns {Promise<{ followerHistory: any[], topPosts: any[] }>}
 */
export async function fetchMetrics(since, until, platform, profileUrl) {
  // Attempt to call the appropriate integration if platform and profileUrl are provided
  if (platform && profileUrl) {
    try {
      if (platform.toLowerCase() === 'instagram') {
        return await getInstagramMetrics(profileUrl, since, until);
      }
      if (platform.toLowerCase() === 'tiktok') {
        return await getTikTokMetrics(profileUrl, since, until);
      }
    } catch (err) {
      // log the integration error and fall back to stubbed data
      console.error('Error fetching metrics from integration:', err);
    }
  }
  // Fall back to synthetic data
  let endDate;
  let startDate;
  if (until) {
    endDate = new Date(until);
  } else {
    endDate = new Date();
  }
  if (since) {
    startDate = new Date(since);
  } else {
    startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  const followerHistory = generateFollowerHistory(startDate, endDate);
  const topPosts = generateTopPosts();
  return { followerHistory, topPosts };
}