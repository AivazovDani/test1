import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
// ChartJSNodeCanvas is removed to avoid native dependencies.

/*
 * Generates a PDF report using metrics data.
 *
 * @param {Object} metrics – An object containing follower history and top posts.
 *   metrics.followerHistory: Array of { date: ISOString, count: Number }
 *   metrics.topPosts: Array of { title: String, likes: Number, comments: Number }
 * @param {Object} options – Additional options for the report.
 *   options.since: ISO date string or undefined
 *   options.until: ISO date string or undefined
 * @returns {Promise<Buffer>} A promise that resolves with the PDF buffer.
 */
export async function generateReport(metrics, options = {}) {
  const { followerHistory, topPosts } = metrics;
  // Extract follower counts for summary
  const dates = followerHistory.map(item => new Date(item.date));
  const counts = followerHistory.map(item => item.count);
  const startCount = counts[0];
  const endCount = counts[counts.length - 1];
  const growth = startCount ? ((endCount - startCount) / startCount) * 100 : 0;

  // Additional analytics for a more detailed summary
  const totalNewFollowers = endCount - startCount;
  const dailyGrowth = counts.length > 1 ? totalNewFollowers / (counts.length - 1) : 0;
  const totalLikes = topPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = topPosts.reduce((sum, p) => sum + (p.comments || 0), 0);
  const avgLikes = topPosts.length ? totalLikes / topPosts.length : 0;
  const avgComments = topPosts.length ? totalComments / topPosts.length : 0;

  // Advanced metrics
  // Engagement rate is calculated as (total likes + total comments) divided by
  // the total potential audience reached (approximate using end follower count
  // multiplied by number of posts) expressed as a percentage.
  const engagementRate = endCount > 0 && topPosts.length > 0
    ? ((totalLikes + totalComments) / (topPosts.length * endCount)) * 100
    : 0;
  // Ratio of comments to likes – helpful to understand how interactive the
  // audience is relative to their passive engagement. Expressed as a percentage.
  const commentLikeRatio = totalLikes > 0 ? (totalComments / totalLikes) * 100 : 0;
  // Growth slope for forecasting future follower count. Based on a simple
  // linear projection using the follower history. If fewer than two points,
  // assume no growth.
  const numDays = counts.length > 1 ? counts.length - 1 : 1;
  const growthSlope = numDays > 0 ? (endCount - startCount) / numDays : 0;
  const forecast30 = Math.round(endCount + growthSlope * 30);
  const forecast90 = Math.round(endCount + growthSlope * 90);

  // Create PDF document in memory with no margin to allow full‑bleed background
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));

  // Compute page dimensions
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  // Margins for the card holding all content
  // Increase card margins slightly for more breathing room
  const cardMarginX = 50;
  const cardMarginY = 50;
  const cardWidth = pageWidth - cardMarginX * 2;
  const cardHeight = pageHeight - cardMarginY * 2;

  // Preload logo once at module scope. The logo lives in the frontend folder and is
  // read synchronously here so that we can embed it in the PDF. If the file
  // cannot be found, fall back to undefined and skip rendering the logo.
  let logoBuffer;
  try {
    // Adjust the logo path for the Vercel deployment. In this project, the
    // static assets live in the `public` directory at the repository root.
    // The `reportGenerator.js` file resides in `api/_lib`, so to resolve
    // the logo correctly we walk up two directories to the root and then
    // into `public`.
    logoBuffer = fs.readFileSync(path.join(__dirname, '../../public/logo.png'));
  } catch {
    logoBuffer = undefined;
  }

  /**
   * Draws the gradient background and the semi‑transparent card on the current page.
   * Also resets doc.x and doc.y to the starting coordinates inside the card.
   */
  function drawBackgroundAndCard() {
    // Pastel gradient background similar to the provided business plan. We use
    // deeper purple and a muted green to match the style.
    const grad = doc.linearGradient(0, 0, pageWidth, pageHeight);
    grad.stop(0, '#6f72db');
    grad.stop(1, '#a4c8a1');
    doc.rect(0, 0, pageWidth, pageHeight).fill(grad);
    // Add a large, semi‑transparent ellipse in the upper right corner to mimic
    // the swooping shape from the reference PDF. The ellipse lightly overlays
    // the gradient and adds depth. The fill uses a very low opacity.
    doc.save();
    doc.fillColor('#ffffff');
    doc.fillOpacity(0.05);
    // ellipse parameters: center X, center Y, radiusX, radiusY
    const ellipseCX = pageWidth * 0.7;
    const ellipseCY = pageHeight * 0.1;
    const ellipseRX = pageWidth * 0.8;
    const ellipseRY = pageHeight * 0.6;
    doc.ellipse(ellipseCX, ellipseCY, ellipseRX, ellipseRY).fill();
    doc.restore();
    // Card with slightly more transparency so that the gradient subtly shows
    doc.save();
    doc.fillOpacity(0.9);
    doc.roundedRect(cardMarginX, cardMarginY, cardWidth, cardHeight, 20).fill('#ffffff');
    doc.restore();
    // Reset text cursor inside the card with generous padding
    doc.x = cardMarginX + 40;
    doc.y = cardMarginY + 40;
  }

  // Use Helvetica as the default font for the entire document for a cleaner look
  doc.font('Helvetica');
  // Draw on the first page
  drawBackgroundAndCard();
  // Ensure subsequent pages also have the gradient and card
  doc.on('pageAdded', () => {
    drawBackgroundAndCard();
  });

  // Build the header: logo, date, title, and subtitle. The business plan
  // example uses a clean top bar with a logo on the left and the date on
  // the right. We replicate that here. Then we render the report title and
  // a short subtitle below.
  const sinceDate = options.since
    ? new Date(options.since).toLocaleDateString()
    : 'Last 30 days';
  const untilDate = options.until
    ? new Date(options.until).toLocaleDateString()
    : '';
  const dateRangeText = untilDate ? `${sinceDate} – ${untilDate}` : sinceDate;
  // Top bar: logo and date
  // Embed the logo at the top of the card. Provide only a width so the
  // original aspect ratio of the image is preserved. The height will be
  // automatically computed by PDFKit. Adjust the width as desired for
  // visibility in the header.
  // Increase the logo width to make the branding more prominent in the PDF.
  const logoDisplayWidth = 140;
  if (logoBuffer) {
    doc.image(logoBuffer, cardMarginX + 20, cardMarginY + 20, {
      width: logoDisplayWidth,
    });
  }
  // Date on the right
  doc.fontSize(12).fillColor('#5a6dfb');
  const dateWidth = doc.widthOfString(dateRangeText);
  doc.text(
    dateRangeText,
    cardMarginX + cardWidth - dateWidth - 20,
    cardMarginY + 26
  );
  // Title and subtitle
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#5a6dfb').text(
    'Social Media Report',
    cardMarginX + 20,
    cardMarginY + 60,
    { width: cardWidth - 40, align: 'left' }
  );
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(16).fillColor('#6f72db').text(
    'Performance & Growth Insights',
    cardMarginX + 20,
    doc.y,
    { width: cardWidth - 40, align: 'left' }
  );
  // Prepare cursor for the next section
  doc.x = cardMarginX + 20;
  doc.y += 20;

  /*
   * The report is divided into four distinct pages to ensure that each
   * analytical module has sufficient space and does not overlap with
   * adjacent content. Page 1 contains the summary and follower growth
   * chart. Page 2 contains the follower history table and bar chart of
   * top posts. Page 3 presents key takeaways and growth forecasts
   * followed by actionable recommendations. Page 4 lists the top posts
   * in a clean table format. Splitting the content across multiple
   * pages improves readability and gives each section room to breathe.
   */

  // ----- PAGE 1: Summary and Follower Growth Chart -----
  // Build summary lines
  const summaryLines = [];
  summaryLines.push(
    `Follower count changed from ${startCount} to ${endCount}, a ${growth.toFixed(1)}% change.`
  );
  summaryLines.push(
    `Total new followers: ${totalNewFollowers} (~${dailyGrowth.toFixed(1)} per day)`
  );
  summaryLines.push(
    `Average likes: ${avgLikes.toFixed(0)}, Average comments: ${avgComments.toFixed(1)} per post`
  );
  doc.fontSize(16).fillColor('#5a6dfb').text('Summary', { underline: true });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(12).fillColor('#333333');
  summaryLines.forEach(line => {
    doc.text(line);
  });
  // Space before follower growth chart
  doc.moveDown(1.2);
  // Draw chart heading first, then compute positions relative to current y
  if (followerHistory.length > 1) {
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#5a6dfb').text('Follower Growth');
    // small spacing
    doc.moveDown(0.5);
    const chartWidth = 450;
    const chartHeight = 220;
    const marginX = 50;
    const totalChartSpan = marginX + chartWidth;
    // Chart starting coordinates: horizontally centered; vertically at current doc.y
    const chartX = cardMarginX + (cardWidth - totalChartSpan) / 2;
    const chartY = doc.y;
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const yRange = maxCount - minCount || 1;
    const xStep = chartWidth / (followerHistory.length - 1);
    doc.save();
    // axes
    doc.strokeColor('#DDDDDD').lineWidth(1);
    doc.moveTo(chartX + marginX, chartY).lineTo(chartX + marginX, chartY + chartHeight).stroke();
    doc.moveTo(chartX + marginX, chartY + chartHeight).lineTo(
      chartX + marginX + chartWidth,
      chartY + chartHeight
    ).stroke();
    // axis labels
    doc.fontSize(8).fillColor('#333333');
    doc.text(maxCount.toString(), chartX + 5, chartY - 4);
    doc.text(minCount.toString(), chartX + 5, chartY + chartHeight - 8);
    const firstDateStr = new Date(followerHistory[0].date).toLocaleDateString();
    const lastDateStr = new Date(followerHistory[followerHistory.length - 1].date).toLocaleDateString();
    doc.text(firstDateStr, chartX + marginX, chartY + chartHeight + 4);
    const lastDateWidth = doc.widthOfString(lastDateStr);
    doc.text(
      lastDateStr,
      chartX + marginX + chartWidth - lastDateWidth,
      chartY + chartHeight + 4
    );
    // line
    doc.strokeColor('#5a6dfb').lineWidth(1.5);
    followerHistory.forEach((item, idx) => {
      const x = chartX + marginX + xStep * idx;
      const normalized = (item.count - minCount) / yRange;
      const y = chartY + chartHeight - normalized * chartHeight;
      if (idx === 0) {
        doc.moveTo(x, y);
      } else {
        doc.lineTo(x, y);
      }
    });
    doc.stroke();
    doc.restore();
    // Move y below chart for next section
    doc.y = chartY + chartHeight + 60;
  }

  // ----- PAGE 2: Follower History Table and Bar Chart -----
  // Start new page for tables and bar chart
  doc.addPage();
  // Follower history table
  doc.fontSize(16).fillColor('#5a6dfb').text('Follower History', { underline: true });
  doc.moveDown(0.4);
  followerHistory.forEach(item => {
    const dateStr = new Date(item.date).toLocaleDateString();
    const countStr = item.count.toString();
    doc.font('Helvetica').fontSize(10).fillColor('#333333').text(`${dateStr.padEnd(14)}  ${countStr}`);
  });
  doc.moveDown(1.0);
  // Bar chart for top posts, only if there are posts
  if (topPosts.length > 0) {
    // Title above the bar chart
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#5a6dfb').text('Top Posts Engagement (Likes vs Comments)');
    doc.moveDown(0.4);
    const barWidth = 30;
    const barGap = 20;
    const chartHeight = 180;
    const totalBarChartWidth = topPosts.length * (2 * barWidth + barGap);
    const chartX = cardMarginX + (cardWidth - totalBarChartWidth) / 2;
    const chartY = doc.y;
    const maxMetric = Math.max(
      ...topPosts.map(p => p.likes || 0),
      ...topPosts.map(p => p.comments || 0)
    ) || 1;
    doc.save();
    doc.strokeColor('#CCCCCC').lineWidth(1);
    // axes
    doc.moveTo(chartX, chartY).lineTo(chartX, chartY + chartHeight).stroke();
    doc.moveTo(chartX, chartY + chartHeight).lineTo(
      chartX + totalBarChartWidth,
      chartY + chartHeight
    ).stroke();
    // draw bars
    topPosts.forEach((post, idx) => {
      const likesHeight = (post.likes || 0) / maxMetric * chartHeight;
      const commentsHeight = (post.comments || 0) / maxMetric * chartHeight;
      const baseX = chartX + idx * (2 * barWidth + barGap);
      // Likes
      doc.fillColor('#5a6dfb').rect(
        baseX,
        chartY + chartHeight - likesHeight,
        barWidth,
        likesHeight
      ).fill();
      // Comments
      doc.fillColor('#c76fe2').rect(
        baseX + barWidth,
        chartY + chartHeight - commentsHeight,
        barWidth,
        commentsHeight
      ).fill();
      // Post index label
      doc.font('Helvetica').fontSize(8).fillColor('#333333').text(
        String(idx + 1),
        baseX + barWidth * 0.5,
        chartY + chartHeight + 2,
        { align: 'center', width: 2 * barWidth }
      );
    });
    // Legend
    const legendY = chartY + chartHeight + 20;
    const legendX = chartX;
    doc.fillColor('#5a6dfb').rect(legendX, legendY, 10, 10).fill();
    doc.font('Helvetica').fontSize(8).fillColor('#333333').text('Likes', legendX + 14, legendY - 2);
    const secondLegendX = legendX + 60;
    doc.fillColor('#c76fe2').rect(secondLegendX, legendY, 10, 10).fill();
    doc.font('Helvetica').fontSize(8).fillColor('#333333').text('Comments', secondLegendX + 14, legendY - 2);
    doc.restore();
    // update y after chart
    doc.y = legendY + 30;
  }

  // ----- PAGE 3: Key Takeaways & Recommendations -----
  doc.addPage();
  // Key takeaways section
  doc.fontSize(16).fillColor('#5a6dfb').text('Key Takeaways & Growth Forecast', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#333333');
  const keyPoints = [];
  keyPoints.push(`Average daily follower growth: ${dailyGrowth.toFixed(1)} per day.`);
  keyPoints.push(`Engagement rate: ${engagementRate.toFixed(2)}% (likes + comments relative to reach).`);
  keyPoints.push(`Comment-to-like ratio: ${commentLikeRatio.toFixed(2)}%.`);
  keyPoints.push(`Projected followers in 30 days: ${forecast30.toLocaleString()}.`);
  keyPoints.push(`Projected followers in 90 days: ${forecast90.toLocaleString()}.`);
  keyPoints.forEach(point => {
    doc.text(`• ${point}`);
  });
  // Space before recommendations
  doc.moveDown(1.0);
  // Recommendations heading
  doc.fontSize(14).fillColor('#5a6dfb').text('Recommendations', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor('#333333');
  const recommendations = [];
  if (growthSlope <= 0) {
    recommendations.push(
      'Growth is flat or declining. Increase posting frequency and experiment with varied content types (videos, stories) to reignite growth.'
    );
  } else if (dailyGrowth < 5) {
    recommendations.push(
      'Growth is positive but modest. Leverage trending topics and hashtags to expand reach and attract new followers.'
    );
  } else {
    recommendations.push(
      'Growth is strong. Maintain your current posting cadence and continue engaging with your audience to sustain momentum.'
    );
  }
  if (engagementRate < 1) {
    recommendations.push(
      'Low engagement rate. Encourage interaction by asking questions in captions and responding promptly to comments.'
    );
  } else if (engagementRate > 5) {
    recommendations.push(
      'High engagement rate. Capitalize on this by collaborating with influencers or hosting contests to further boost engagement.'
    );
  }
  if (commentLikeRatio < 10) {
    recommendations.push(
      'Comments are relatively low compared to likes. Inspire discussion by inviting followers to share their thoughts or experiences.'
    );
  } else {
    recommendations.push(
      'Good balance between comments and likes. Keep fostering conversations to strengthen your community.'
    );
  }
  recommendations.push(
    'Regularly review your top performing content to identify themes that resonate with your audience, and iterate on these successes.'
  );
  recommendations.forEach(rec => {
    doc.text(`• ${rec}`);
  });

  // ----- PAGE 4: Top Posts Table -----
  doc.addPage();
  doc.fontSize(16).fillColor('#5a6dfb').text('Top Posts', { underline: true });
  doc.moveDown(0.5);
  const headerX2 = cardMarginX + 40;
  const titleColWidth2 = 260;
  const likesColWidth2 = 80;
  const commentsColWidth2 = 80;
  doc.fontSize(10).fillColor('#555555');
  // table headers
  doc.text('Title', headerX2, doc.y, { width: titleColWidth2 });
  doc.text('Likes', headerX2 + titleColWidth2, doc.y, { width: likesColWidth2 });
  doc.text('Comments', headerX2 + titleColWidth2 + likesColWidth2, doc.y, { width: commentsColWidth2 });
  doc.moveDown(0.3);
  topPosts.forEach(post => {
    const { title, likes, comments } = post;
    const truncated = title.length > 50 ? title.slice(0, 47) + '…' : title;
    doc.fontSize(10).fillColor('#333333');
    doc.text(truncated, headerX2, doc.y, { width: titleColWidth2 });
    doc.text(String(likes), headerX2 + titleColWidth2, doc.y, { width: likesColWidth2 });
    doc.text(String(comments), headerX2 + titleColWidth2 + likesColWidth2, doc.y, { width: commentsColWidth2 });
    doc.y += 14;
  });

  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on('error', reject);
  });
}