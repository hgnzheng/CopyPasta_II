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
      // Even for small datasets, ensure min/max values exist
      overviewData = data.map(d => ({
        time: d.time,
        value: d.value,
        minValue: 'minValue' in d ? d.minValue : d.value,
        maxValue: 'maxValue' in d ? d.maxValue : d.value
      }));
    }

    // Update the scales, adding 10% padding to the y-domain for better appearance
    const timeExtent = d3.extent(overviewData, d => d.time);
    
    // Use min/max values for better range display
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

    // If we have min/max values, show a range area for better visualization
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

    // Get contextual events/markers from main chart or create defaults
    let contextMarkers = [];
    
    // Use annotations from the main chart if available
    if (window.currentAnnotationGroup) {
      const nodes = window.currentAnnotationGroup.selectAll("circle").nodes();
      if (nodes.length > 0) {
        latestAnnotations = nodes.map(node => {
          const d = d3.select(node).datum();
          return {
            time: d.time,
            type: d.type || "event",
            label: d.label || "",
            critical: d.critical || false
          };
        });
      }
    }
    
    // If we have annotations from main chart, use them
    if (latestAnnotations.length > 0) {
      contextMarkers = latestAnnotations;
    } 
    // Otherwise create generic markers based on the time range
    else {
      const range = timeExtent[1] - timeExtent[0];
      for (let i = 1; i <= 4; i++) {
        contextMarkers.push({
          time: timeExtent[0] + (range * i / 5),
          type: i % 2 === 0 ? "critical" : "event",
          label: i % 2 === 0 ? "Critical Event" : "Event",
          critical: i % 2 === 0
        });
      }
    }
    
    // Create marker group for events
    markerGroup = svgMini
      .append("g")
      .attr("class", "mini-markers");
    
    // Add markers
    markerGroup
      .selectAll(".mini-marker")
      .data(contextMarkers)
      .enter()
      .append("rect")
      .attr("class", "mini-marker")
      .attr("x", d => xMini(d.time) - 2)
      .attr("y", 0)
      .attr("width", 4)
      .attr("height", miniHeight)
      .attr("fill", d => d.critical ? colors.criticalMarker : colors.eventMarker)
      .attr("opacity", 0.3)
      .on("mouseover", function(event, d) {
        // Highlight on hover
        d3.select(this)
          .attr("opacity", 0.7)
          .attr("width", 6)
          .attr("x", d => xMini(d.time) - 3);
        
        // Show tooltip
        d3.select("body")
          .append("div")
          .attr("class", "mini-tooltip")
          .style("position", "absolute")
          .style("background", "rgba(0,0,0,0.7)")
          .style("color", "white")
          .style("padding", "5px")
          .style("border-radius", "3px")
          .style("font-size", "10px")
          .style("pointer-events", "none")
          .style("left", (event.pageX + 5) + "px")
          .style("top", (event.pageY - 28) + "px")
          .html(`${d.label || d.type} at ${d.time.toFixed(1)}s`);
      })
      .on("mouseout", function() {
        // Restore marker
        d3.select(this)
          .attr("opacity", 0.3)
          .attr("width", 4)
          .attr("x", d => xMini(d.time) - 2);
        
        // Remove tooltip
        d3.selectAll(".mini-tooltip").remove();
      })
      .on("click", function(event, d) {
        // Focus main chart on this marker
        if (window.currentXScale && typeof setMainChartDomain === 'function') {
          const focusWindow = 60; // 60-second window
          const start = Math.max(timeExtent[0], d.time - focusWindow/2);
          const end = Math.min(timeExtent[1], d.time + focusWindow/2);
          setMainChartDomain([start, end]);
          
          // If we have the time marker, set it to this time
          if (window.currentTimeMarker && typeof currentTime !== 'undefined') {
            window.currentTime = d.time;
            window.updatePlayback();
          }
        }
      });
    
    // Add time marker for current position if it exists
    if (typeof currentTime !== 'undefined') {
      svgMini.append("line")
        .attr("class", "mini-time-marker")
        .attr("x1", xMini(currentTime))
        .attr("y1", 0)
        .attr("x2", xMini(currentTime))
        .attr("y2", miniHeight)
        .attr("stroke", "rgba(0, 0, 0, 0.5)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,2");
    }
    
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
      brushG.call(brush.move, null);
      if (typeof setMainChartDomain === 'function') {
        setMainChartDomain(timeExtent);
      }
    });

    // Track the last update time to throttle updates during rapid brush movement
    let lastBrushUpdate = 0;

    brushG.call(brush.move, xMini.range()); // Move brush to full range by default
    
    function brushed({ selection }) {
      if (!selection) return;
      
      // Always update brush handles for smooth visual feedback
      updateBrushHandles(selection);
      
      // Throttle main chart updates during active brushing to prevent freezing
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
    }

    function brushEnded({ selection }) {
      // Reset the active brushing flag
      window.isActiveBrushing = false;
      
      if (!selection) {
        // If the brush was cleared by clicking outside, 
        // restore the full domain in the main chart
        if (typeof setMainChartDomain === 'function') {
          setMainChartDomain(timeExtent);
        }
        return;
      }
      
      // Snap the brush to nearest events/markers for better UX
      const newDomain = selection.map(xMini.invert);
      const snapThreshold = (timeExtent[1] - timeExtent[0]) * 0.02; // 2% of timeline
      
      // Limit the number of markers we check for snapping to improve performance
      const contextMarkersSample = contextMarkers.length > 100 ? 
        contextMarkers.filter((_, i) => i % Math.ceil(contextMarkers.length / 100) === 0) : 
        contextMarkers;
      
      // Try to snap to nearby markers
      let closestLeft = null;
      let closestRight = null;
      
      contextMarkersSample.forEach(marker => {
        const markerTime = marker.time;
        // For the left edge
        if (Math.abs(markerTime - newDomain[0]) < snapThreshold && 
            (closestLeft === null || Math.abs(markerTime - newDomain[0]) < Math.abs(closestLeft - newDomain[0]))) {
          closestLeft = markerTime;
        }
        // For the right edge
        if (Math.abs(markerTime - newDomain[1]) < snapThreshold && 
            (closestRight === null || Math.abs(markerTime - newDomain[1]) < Math.abs(closestRight - newDomain[1]))) {
          closestRight = markerTime;
        }
      });
      
      // Apply snapping if we found close markers
      if (closestLeft !== null) newDomain[0] = closestLeft;
      if (closestRight !== null) newDomain[1] = closestRight;
      
      // Always do a final update with the final domain after brush end
      if (typeof setMainChartDomain === 'function') {
        setMainChartDomain(newDomain);
      }
      
      // Update the brush position to match the snapped domain, but only if we snapped
      if (closestLeft !== null || closestRight !== null) {
        brush.move(brushG, [xMini(newDomain[0]), xMini(newDomain[1])]);
      }
    }
  }

  // Make the drawOverview function available globally
  window.drawOverview = drawOverview;
  window.overviewXScale = xMini;
  window.overviewSVG = svgMini;
  window.miniHeight = miniHeight;
  window.overviewYScale = yMini;
});

