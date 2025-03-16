document.addEventListener("DOMContentLoaded", () => {
  const miniMargin = { top: 10, right: 30, bottom: 20, left: 40 },
    miniWidth = 900 - miniMargin.left - miniMargin.right,
    miniHeight = 100 - miniMargin.top - miniMargin.bottom;

  // Color palette to match main chart
  const colors = {
    miniLinePath: "#999",
    brushHandle: "#666",
    brushArea: "rgba(51, 103, 214, 0.15)",
    eventMarker: "#2196F3",
    criticalMarker: "#2196F3",
    dataRange: "rgba(153, 153, 153, 0.25)"
  };

  const svgMini = d3
    .select("#data-overview")
    .append("svg")
    .attr("width", miniWidth + miniMargin.left + miniMargin.right)
    .attr("height", miniHeight + miniMargin.top + miniMargin.bottom)
    .attr("viewBox", `0 0 ${miniWidth + miniMargin.left + miniMargin.right} ${miniHeight + miniMargin.top + miniMargin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform", `translate(${miniMargin.left}, ${miniMargin.top})`);

  // Add a title to the overview
  svgMini.append("text")
    .attr("class", "overview-title")
    .attr("x", miniWidth / 2)
    .attr("y", -2)
    .attr("text-anchor", "middle")
    .style("font-size", "10px")
    .style("font-weight", "bold")
    .text("Full Timeline Overview - Drag to Focus");

  const xMini = d3.scaleLinear().range([0, miniWidth]);
  const yMini = d3.scaleLinear().range([miniHeight, 0]);

  let brush = null;
  let brushG = null;
  let markerGroup = null;
  let latestAnnotations = [];
  let overviewPath = null;
  let overviewArea = null;

  function drawOverview() {
    // Get data for overview - first clear old paths and brush
    if (overviewPath) overviewPath.remove();
    if (overviewArea) overviewArea.remove();
    if (brushG) brushG.remove();
    
    // Don't try to update the overview while we're in the middle of a brush operation
    if (window.isActiveBrushing) return;
    
    // Get data from the current track
    let data;
    if (window.currentMultiSignalData && window.currentMultiSignalData.length > 0) {
      data = window.currentMultiSignalData[0].data;
    } else if (window.currentTrackData) {
      data = window.currentTrackData;
    } else {
      console.warn("No track data for overview timeline");
      return;
    }

    // Always downsample for the overview regardless of size for consistent performance
    const targetSampleSize = 300; // Aim for ~300 points in the overview
    let overviewData;
    
    if (data.length > targetSampleSize) {
      const factor = Math.ceil(data.length / targetSampleSize);
      const downsampled = [];
      
      // Use a simple but fast downsampling algorithm - pick evenly spaced points
      for (let i = 0; i < data.length; i += factor) {
        const start = i;
        const end = Math.min(i + factor, data.length);
        
        // Get all points in this segment
        const segment = data.slice(start, end);
        if (segment.length === 0) continue;
        
        // Calculate average time and value
        let sumTime = 0, sumValue = 0;
        let minValue = Infinity, maxValue = -Infinity;
        
        for (let j = 0; j < segment.length; j++) {
          const point = segment[j];
          sumTime += point.time;
          sumValue += point.value;
          
          // Track min/max for the range display
          if ('minValue' in point) {
            minValue = Math.min(minValue, point.minValue);
            maxValue = Math.max(maxValue, point.maxValue);
          } else {
            minValue = Math.min(minValue, point.value);
            maxValue = Math.max(maxValue, point.value);
          }
        }
        
        const avgTime = sumTime / segment.length;
        const avgValue = sumValue / segment.length;
        
        downsampled.push({
          time: avgTime,
          value: avgValue,
          minValue: minValue === Infinity ? avgValue : minValue,
          maxValue: maxValue === -Infinity ? avgValue : maxValue
        });
      }
      
      overviewData = downsampled;
    } else {
      overviewData = data;
    }

    // Update the scales
    const timeExtent = d3.extent(overviewData, d => d.time);
    const valueMin = d3.min(overviewData, d => d.minValue);
    const valueMax = d3.max(overviewData, d => d.maxValue);
    const valuePadding = (valueMax - valueMin) * 0.1;

    xMini.domain(timeExtent);
    yMini.domain([valueMin - valuePadding, valueMax + valuePadding]);

    // Draw axes
    svgMini.selectAll(".mini-axis").remove();

    // X-axis
    svgMini
      .append("g")
      .attr("class", "mini-axis")
      .attr("transform", `translate(0, ${miniHeight})`)
      .call(d3.axisBottom(xMini).ticks(7).tickFormat(d => d + "s"))
      .selectAll("text")
      .style("font-size", "8px");

    // If we have min/max values, show a range area
    if (overviewData.length > 0 && 'minValue' in overviewData[0]) {
      const areaGenerator = d3.area()
        .x(d => xMini(d.time))
        .y0(d => yMini(d.minValue))
        .y1(d => yMini(d.maxValue))
        .curve(d3.curveMonotoneX);
        
      overviewArea = svgMini
        .append("path")
        .datum(overviewData)
        .attr("class", "mini-area")
        .attr("fill", colors.dataRange)
        .attr("d", areaGenerator);
    }

    // Create path for line
    const line = d3.line()
      .x(d => xMini(d.time))
      .y(d => yMini(d.value))
      .curve(d3.curveMonotoneX);

    // Main path
    overviewPath = svgMini
      .append("path")
      .datum(overviewData)
      .attr("class", "mini-line")
      .attr("fill", "none")
      .attr("stroke", colors.miniLinePath)
      .attr("stroke-width", 1)
      .attr("d", line);

    // Get anomalies from the main chart
    let anomalies = window.anomalies || [];
    
    // Create marker group for anomalies
    markerGroup = svgMini
      .append("g")
      .attr("class", "mini-markers");
    
    // Update anomaly markers
    updateAnomalyMarkers();

    // Initialize the brush
    brush = d3
      .brushX()
      .extent([
        [0, 0],
        [miniWidth, miniHeight],
      ])
      .on("start", brushStarted)
      .on("brush", brushed)
      .on("end", brushEnded);
      
    // Track when brushing starts
    function brushStarted() {
      window.isActiveBrushing = true;
    }

    // Add the brush
    brushG = svgMini
      .append("g")
      .attr("class", "brush")
      .call(brush);

    // Style the brush
    brushG.select(".selection")
      .attr("fill", colors.brushArea)
      .attr("stroke", "#3367D6")
      .attr("stroke-width", 1);
    
    // Add custom brush handles
    const brushHandlePath = (d) => {
      const e = +(d.type === "e");
      const x = e ? 1 : -1;
      const y = miniHeight / 2;
      return `M${0.5 * x},${y - 15} 
              l${0},${30} 
              l${-8 * x},${5} 
              l${0},${-40} 
              l${8 * x},${5} z`;
    };
    
    const brushHandles = brushG
      .selectAll(".custom-handle")
      .data([{ type: "w" }, { type: "e" }])
      .enter()
      .append("path")
      .attr("class", "custom-handle")
      .attr("fill", colors.brushHandle)
      .attr("cursor", "ew-resize")
      .attr("d", brushHandlePath);

    // Position handles correctly on brush events
    function updateBrushHandles(selection) {
      if (!selection) return;
      brushHandles
        .attr("display", null)
        .attr("transform", (d, i) => `translate(${selection[i]}, 0)`);
    }
    
    // If we have a current domain, initialize the brush to match
    if (window.currentXDomain) {
      const [start, end] = window.currentXDomain;
      brush.move(brushG, [xMini(start), xMini(end)]);
    }
    
    // Set up the clear brush button
    d3.select("#clearBrush").on("click", () => {
      // brushG.call(brush.move, null);
      drawOverview();
      rewindPlayback();
    });

    // Track the last update time to throttle updates during rapid brush movement
    let lastBrushUpdate = 0;

    brushG.call(brush.move, xMini.range()); // Move brush to full range by default
    
    function brushed({ selection }) {
      if (!selection) return;
      
      // Always update brush handles for smooth visual feedback
      updateBrushHandles(selection);
      
      // Throttle main chart updates during active brushing
      const now = Date.now();
      if (now - lastBrushUpdate < 50) { // Only update at most every 50ms during active brushing
        return;
      }
      
      // Map the brush selection back to data domain
      const newDomain = selection.map(xMini.invert);
      
      // Update the main chart's domain
      if (typeof setMainChartDomain === 'function') {
        setMainChartDomain(newDomain);
        lastBrushUpdate = now;
      }
      
      // Update anomaly markers in both overview and main chart
      if (window.anomalies && window.anomalies.length > 0) {
        // Update mini anomaly markers with proper data binding
        updateAnomalyMarkers();
        
        // Update main chart anomaly markers through the updateChartElements function
        if (typeof updateChartElements === 'function') {
          updateChartElements();
        }
      }
    }

    function brushEnded({ selection }) {
      // Reset the active brushing flag
      window.isActiveBrushing = false;
      
      if (!selection) {
        // If the brush was cleared, restore the full domain
        if (typeof setMainChartDomain === 'function') {
          setMainChartDomain(timeExtent);
        }
        return;
      }
      
      // Map the brush selection back to data domain
      const newDomain = selection.map(xMini.invert);
      
      // Always do a final update with the final domain after brush end
      if (typeof setMainChartDomain === 'function') {
        setMainChartDomain(newDomain);
      }
      
      // Ensure anomaly markers are updated after brush ends
      if (window.anomalies && window.anomalies.length > 0) {
        updateAnomalyMarkers();
        
        // Update main chart elements
        if (typeof updateChartElements === 'function') {
          updateChartElements();
        }
      }
    }
  }

  // Make the drawOverview function available globally
  window.drawOverview = drawOverview;
  window.overviewXScale = xMini;
  window.overviewSVG = svgMini;
  window.miniHeight = miniHeight;
  window.overviewYScale = yMini;

  // Add markers for anomalies
  function updateAnomalyMarkers() {
    // Get current anomalies
    const anomalies = window.anomalies || [];
    
    // Update markers with proper data binding
    const markers = markerGroup.selectAll(".mini-anomaly-marker")
      .data(anomalies, d => d.time); // Use time as the key for stable updates
    
    // Update existing markers with transition
    markers
      .transition()
      .duration(200)
      .attr("cx", d => xMini(d.time))
      .attr("cy", d => yMini(d.value))
      .attr("r", d => d.severity === 'critical' ? 3 : d.severity === 'high' ? 2 : 1.5)
      .attr("fill", d => d.baseColor);
    
    // Add new markers
    const enterMarkers = markers.enter()
      .append("circle")
      .attr("class", "mini-anomaly-marker")
      .attr("r", d => d.severity === 'critical' ? 3 : d.severity === 'high' ? 2 : 1.5)
      .attr("fill", d => d.baseColor)
      .attr("opacity", 0.5)
      .attr("data-time", d => d.time)
      .attr("cx", d => xMini(d.time))
      .attr("cy", d => yMini(d.value));
    
    // Remove old markers
    markers.exit().remove();
    
    // Merge enter and update selections and add event handlers
    markers.merge(enterMarkers)
      .on("mouseover", function(event, d) {
        // Highlight corresponding marker in main chart
        highlightAnomalyMarker(d.time);
        
        // Show tooltip using the existing tooltip class
        d3.select("body")
          .append("div")
          .attr("class", "tooltip")
          .style("opacity", "0")
          .style("left", (event.pageX + 15) + "px")
          .style("top", (event.pageY - 40) + "px")
          .html(`
            <div style="margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center">
              <strong style="font-size: 15px">${d.type}</strong>
              <span style="background: ${d.severity === 'critical' ? 'rgba(255,59,48,0.3)' : d.severity === 'high' ? 'rgba(255,149,0,0.3)' : 'rgba(52,199,89,0.3)'}; padding: 4px 10px; border-radius: 4px; font-size: 12px; margin-left: 12px">${d.severity}</span>
            </div>
            <div style="font-size: 14px; margin-bottom: 8px; display: flex; justify-content: space-between;">
              <span>Time:</span> <strong style="margin-left: 8px">${formatTime(d.time)}</strong>
            </div>
            ${d.zScore ? 
              `<div style="font-size: 14px; margin-bottom: 8px; display: flex; justify-content: space-between;">
                <span>Z-Score:</span> <strong style="margin-left: 8px">${d.zScore.toFixed(1)}σ</strong>
               </div>` : 
              d.trendChange ? 
              `<div style="font-size: 14px; margin-bottom: 8px; display: flex; justify-content: space-between;">
                <span>Change:</span> <strong style="margin-left: 8px">${(d.trendChange * 100).toFixed(1)}%</strong>
               </div>` : 
              ''}
            <div style="font-size: 13px; margin-top: 10px; opacity: 0.8; text-align: center; background: rgba(255,255,255,0.1); padding: 5px; border-radius: 4px;">Click to focus on this anomaly</div>
          `)
          .transition()
          .duration(200)
          .style("opacity", "1");
      })
      .on("mouseout", function() {
        // Remove highlight
        unhighlightAnomalyMarker();
        // Remove tooltip with fade out effect
        d3.selectAll(".tooltip")
          .transition()
          .duration(200)
          .style("opacity", 0)
          .remove();
      })
      .on("click", function(event, d) {
        // Focus main chart on this anomaly
        if (window.currentXScale && typeof setMainChartDomain === 'function') {
          const focusWindow = 60; // 60-second window
          const start = Math.max(d.time - focusWindow/2, xMini.domain()[0]);
          const end = Math.min(d.time + focusWindow/2, xMini.domain()[1]);
          setMainChartDomain([start, end]);
          
          // Update current time
          if (typeof currentTime !== 'undefined') {
            window.currentTime = d.time;
            window.updatePlayback();
          }
        }
      });
  }

  // Make updateAnomalyMarkers available globally
  window.updateOverviewAnomalyMarkers = updateAnomalyMarkers;
});

