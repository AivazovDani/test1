import { generateReport } from './_lib/reportGenerator.js';
import { fetchMetrics } from './_lib/metricsService.js';

/**
 * API route for generating a PDF social media report.
 *
 * This handler accepts a POST request with JSON payload containing:
 *   - platform: string identifying the social network (e.g. 'instagram', 'tiktok')
 *   - profileUrl: full URL to the social profile
 *   - since: optional ISO date string for the start of the reporting period
 *   - until: optional ISO date string for the end of the reporting period
 *
 * It fetches metrics for the given account and timeframe, generates a
 * polished PDF report with summary, charts and recommendations, and
 * returns the PDF as a binary response. On error, it returns a JSON
 * error response with status code 500.
 *
 * Note: Vercel serverless functions do not automatically parse the
 * request body for non-GET methods, so we manually buffer and parse
 * the incoming chunks.
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // Buffer the incoming request body because Vercel functions do not
    // automatically parse it. If the body is empty, default to an
    // empty object.
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString() || '{}';
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (err) {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    const { platform, profileUrl, since, until } = data;

    // Fetch social metrics. This will return follower history and top posts.
    const metrics = await fetchMetrics(since, until, platform, profileUrl);

    // Generate the PDF report as a Buffer. Pass through the date range
    // options so the report header shows the selected period.
    const pdfBuffer = await generateReport(metrics, { since, until });

    // Send the PDF back to the client with appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
    res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}