// crisisAnalysis.js

// We'll store loaded data for each TID in a dictionary
let loadedData = {};
// We'll store an array for the "simulation" line
let simulatedData = [];
// Current selected signals
let selectedSignals = [];
// Chart references
let detailedChartSvg, detailedXScale, detailedYScale;
// Zoom behavior
let zoom;

// Color palette for consistent styling
const colors = {
  signal1: "#4285F4", // Google blue
  signal2: "#EA4335", // Google red
  signal3: "#FBBC05", // Google yellow
  signal4: "#34A853", // Google green
  signal5: "#673AB7", // Purple
  signal6: "#FF5722", // Deep Orange
  signal7: "#009688", // Teal
  signal8: "#795548", // Brown
  simulation: "#FF9800", // Orange
  timeMarker: "rgba(0, 0, 0, 0.5)",
  interventionA: "#4CAF50", // Green
  interventionB: "#F44336" // Red
};

// On page load
document.addEventListener("DOMContentLoaded", () => {
  // Back to Dashboard button
  document.getElementById("backButton").addEventListener("click", function () {
    // Grab case/time from URL
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get("caseId") || 1;
    const centerTime = urlParams.get("centerTime") || 0;
    window.location.href = `index.html?caseId=${caseId}&time=${centerTime}`;
  });

  // Parse URL params with better validation
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = parseInt(urlParams.get("caseId")) || 1;
  
  // Default to a 10-minute window (600s) if not specified
  // Ensure we have reasonable values that won't overwhelm the API
  let startTime = parseFloat(urlParams.get("start"));
  let endTime = parseFloat(urlParams.get("end"));
  let centerTime = parseFloat(urlParams.get("centerTime"));
  
  if (isNaN(startTime) || isNaN(endTime) || isNaN(centerTime)) {
    // If any of the times are invalid, set defaults
    console.warn("Invalid time parameters in URL, using defaults");
    startTime = 0;
    endTime = 600; // 10 minute window
    centerTime = 300; // Center point
  } else {
    // Validate the values are reasonable
    if (endTime - startTime > 3600) {
      console.warn("Time window too large, limiting to 1 hour");
      endTime = startTime + 3600; // Max 1 hour window
    }
    
    if (endTime <= startTime) {
      console.warn("End time must be greater than start time, using defaults");
      startTime = 0;
      endTime = 600;
    }
    
    if (centerTime < startTime || centerTime > endTime) {
      console.warn("Center time outside of window, setting to middle");
      centerTime = (startTime + endTime) / 2;
    }
  }
  
  console.log(`Time range: ${startTime} to ${endTime}, center: ${centerTime}`);

  // Attempt to fetch track list from some API or local data
  fetch(`https://api.vitaldb.net/trks?caseid=${caseId}`)
    .then((response) => response.json())
    .then((tracks) => {
      // Filter down to signals that we want
      const biosignalsForCase = tracks
        .filter((track) => track.tname && track.tname.includes("/"))
        .slice(0, 8) // limit for demo
        .map((track, index) => ({
          tid: track.tid,
          name: track.tname,
          checked: index < 3, // Only first 3 checked by default
          color: colors[`signal${index + 1}`] || "#999"
        }));

      selectedSignals = biosignalsForCase.filter(s => s.checked);
      createBiosignalCheckboxes(biosignalsForCase, startTime, endTime, centerTime);
    })
    .catch((error) => {
      console.error("Error fetching track list:", error);

      // Fallback example signals if the fetch fails
      const fallbackSignals = [
        { tid: "fd869e25ba82a66cc95b38ed47110bf4f14bb368", name: "BIS/BIS", checked: true, color: colors.signal1 },
        { tid: "0aa685df768489a18a5e9f53af0d83bf60890c73", name: "BIS/EEG1_WAV", checked: true, color: colors.signal2 },
        { tid: "ad13b2c39b19193c8ae4a2de4f8315f18d61a57e", name: "BIS/EEG2_WAV", checked: true, color: colors.signal3 },
        { tid: "fd869e25ba82a66cc95b38ed47110bf4f14bb368", name: "HR/HR", checked: false, color: colors.signal4 },
        { tid: "0aa685df768489a18a5e9f53af0d83bf60890c73", name: "BP/Systolic", checked: false, color: colors.signal5 },
        { tid: "ad13b2c39b19193c8ae4a2de4f8315f18d61a57e", name: "BP/Diastolic", checked: false, color: colors.signal6 }
      ];

      selectedSignals = fallbackSignals.filter(s => s.checked);
      createBiosignalCheckboxes(fallbackSignals, startTime, endTime, centerTime);
    });

  // Initialize simulation controls
  initSimulationControls();
});

// Create checkboxes for each biosignal
function createBiosignalCheckboxes(signals, startTime, endTime, centerTime) {
  const container = document.getElementById("signalCheckboxes");
  container.innerHTML = "";

  signals.forEach((signal, index) => {
    const checkboxId = `signal-${index}`;
    
    // Create checkbox container
    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "signal-checkbox-container";
    
    // Create checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = checkboxId;
    checkbox.checked = signal.checked;
    checkbox.dataset.tid = signal.tid;
    
    // Create colored color swatch
    const colorSwatch = document.createElement("span");
    colorSwatch.className = "color-swatch";
    colorSwatch.style.backgroundColor = signal.color;
    
    // Create label with signal name
    const label = document.createElement("label");
    label.htmlFor = checkboxId;
    label.className = "signal-label";
    label.textContent = signal.name.split("/").pop(); // Just show the part after the last slash
    
    // Add elements to container
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(colorSwatch);
    checkboxContainer.appendChild(label);
    container.appendChild(checkboxContainer);

    // Set up event listener
    checkbox.addEventListener("change", function () {
      // Update our selected signals array
      if (this.checked) {
        const selectedSignal = signals.find(s => s.tid === this.dataset.tid);
        selectedSignals.push(selectedSignal);
      } else {
        selectedSignals = selectedSignals.filter(s => s.tid !== this.dataset.tid);
      }
      
      // Refresh the chart with our selection
      refreshChart(startTime, endTime, centerTime);
    });
  });

  // Fetch data for initially selected signals and draw chart
  const promises = selectedSignals.map(signal => fetchSignalData(signal.tid, startTime, endTime));
  
  Promise.all(promises)
    .then(() => {
      refreshChart(startTime, endTime, centerTime);
      // Initialize intervention tree after data is loaded
      initInterventionTree(centerTime);
    })
    .catch(error => {
      console.error("Error loading initial data:", error);
    });
}

// Fetch data for a specific signal
function fetchSignalData(tid, startT, endT) {
  // If we already have this data loaded, return it
  if (loadedData[tid]) {
    return Promise.resolve(loadedData[tid]);
  }
  
  // Show loading message
  const loadingMessage = document.createElement("div");
  loadingMessage.className = "loading-message";
  loadingMessage.textContent = `Loading signal data for ${tid}...`;
  document.getElementById("detailedChartArea").appendChild(loadingMessage);
  
  // Check if we have the data API available
  if (window.dataAPI) {
    // Use our local data API
    return window.dataAPI.getSignalData(tid, startT, endT)
      .then(data => {
        // Remove loading message
        loadingMessage.remove();
        
        // If we got no data or very little data, generate demo data instead
        if (!data || data.length < 5) {
          console.warn(`Received insufficient data for ${tid} (${data ? data.length : 0} points). Using demo data.`);
          data = generateDemoData(tid, startT, endT);
        }
        
        // Store in our cache
        loadedData[tid] = data;
        console.log(`Loaded ${data.length} data points for signal ${tid}`);
        return data;
      })
      .catch(error => {
        console.error(`Error loading signal data from data API for ${tid}:`, error);
        loadingMessage.textContent = `Using demo data for ${tid}`;
        
        // Generate demo data as fallback
        const demoData = generateDemoData(tid, startT, endT);
        loadedData[tid] = demoData;
        
        return demoData;
      });
  } else {
    // Fallback to direct API call if data_api.js is not loaded
    const url = `https://api.vitaldb.net/${tid}?from=${startT}&to=${endT}`;
    
    return d3.csv(url, d3.autoType)
      .then(data => {
        // Remove loading message
        loadingMessage.remove();
        
        // Process data
        data.forEach(d => {
          d.time = +d.Time;
          const keys = Object.keys(d);
          const valKey = keys.find(k => k !== "Time");
          d.value = +d[valKey];
        });
        
        // Sort by time
        data.sort((a, b) => a.time - b.time);
        
        // If we got no data or very little data, generate demo data instead
        if (!data || data.length < 5) {
          console.warn(`Received insufficient data from VitalDB API for ${tid}. Using demo data.`);
          data = generateDemoData(tid, startT, endT);
        }
        
        // Store in our cache
        loadedData[tid] = data;
        console.log(`Loaded ${data.length} data points for signal ${tid}`);
        
        return data;
      })
      .catch(error => {
        console.error(`Error loading signal data for ${tid}:`, error);
        loadingMessage.textContent = `Using demo data for ${tid}`;
        
        // Generate demo data as fallback
        const demoData = generateDemoData(tid, startT, endT);
        loadedData[tid] = demoData;
        
        return demoData;
      });
  }
}

// Create the detailed time-series chart
function refreshChart(startTime, endTime, centerTime) {
  // Clear existing chart
  d3.select("#detailedChartArea").selectAll("*").remove();
  
  // Set dimensions for the chart
  const margin = { top: 20, right: 60, bottom: 50, left: 60 };
  const width = document.getElementById("detailedChartArea").clientWidth - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  
  // Create new SVG
  detailedChartSvg = d3.select("#detailedChartArea")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
    
  // Add title
  detailedChartSvg.append("text")
    .attr("class", "chart-title")
    .attr("x", (width + margin.left + margin.right) / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .text("Detailed Crisis Analysis");
  
  // Add a clip path
  detailedChartSvg.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);
  
  // Create main chart group
  const g = detailedChartSvg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  
  // Create charting area with clip path
  const chartArea = g.append("g")
    .attr("class", "chart-area")
    .attr("clip-path", "url(#clip)");
  
  // Find combined time range
  let allTimes = [];
  let hasData = false;
  
  for (const signal of selectedSignals) {
    if (loadedData[signal.tid] && loadedData[signal.tid].length > 0) {
      hasData = true;
      const times = loadedData[signal.tid].map(d => d.time);
      allTimes = allTimes.concat(times);
    }
  }
  
  // If we have no data, show a helpful error message
  if (!hasData || allTimes.length === 0) {
    const errorMessage = g.append("g")
      .attr("class", "error-message");
      
    errorMessage.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 - 20)
      .attr("text-anchor", "middle")
      .attr("font-weight", "bold")
      .text("No data available for selected signals");
      
    errorMessage.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 + 10)
      .attr("text-anchor", "middle")
      .text("Please check that:");
      
    errorMessage.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 + 30)
      .attr("text-anchor", "middle")
      .text("1. At least one biosignal is selected");
      
    errorMessage.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 + 50)
      .attr("text-anchor", "middle")
      .text("2. The API endpoint is accessible");
      
    errorMessage.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 + 70)
      .attr("text-anchor", "middle")
      .text("3. Data exists for the selected time range");
    
    console.error("No data available for selected signals:", selectedSignals);
    return;
  }
  
  // Create x scale
  detailedXScale = d3.scaleLinear()
    .domain([startTime, endTime])
    .range([0, width]);
  
  // Find value ranges for all signals
  let allValues = [];
  selectedSignals.forEach(signal => {
    if (loadedData[signal.tid]) {
      const values = loadedData[signal.tid].map(d => d.value);
      allValues = allValues.concat(values);
    }
  });
  
  // Calculate extent of values with padding
  const valueExtent = d3.extent(allValues);
  const valuePadding = (valueExtent[1] - valueExtent[0]) * 0.1;
  
  // Create y scale
  detailedYScale = d3.scaleLinear()
    .domain([valueExtent[0] - valuePadding, valueExtent[1] + valuePadding])
    .range([height, 0])
    .nice();
  
  // Create axes
  const xAxis = d3.axisBottom(detailedXScale)
    .ticks(10)
    .tickFormat(d => d + "s");
  
  const yAxis = d3.axisLeft(detailedYScale)
    .ticks(8);
  
  // Add grid lines
  g.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0, ${height})`)
    .call(xAxis.tickSize(-height).tickFormat(""));
  
  g.append("g")
    .attr("class", "grid")
    .call(yAxis.tickSize(-width).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll(".tick line")
      .attr("stroke", "#eee")
      .attr("stroke-dasharray", "3,3"));
  
  // Add x-axis
  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${height})`)
    .call(xAxis)
    .call(g => g.select(".domain").attr("stroke", "#ccc"))
    .call(g => g.selectAll(".tick line").attr("stroke", "#ddd"))
    .call(g => g.selectAll(".tick text").attr("font-size", "10px"));
  
  // Add y-axis
  g.append("g")
    .attr("class", "y-axis")
    .call(yAxis)
    .call(g => g.select(".domain").attr("stroke", "#ccc"))
    .call(g => g.selectAll(".tick line").attr("stroke", "#ddd"))
    .call(g => g.selectAll(".tick text").attr("font-size", "10px"));
  
  // Add x-axis label
  g.append("text")
    .attr("class", "x-label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 35)
    .text("Time (seconds)");
  
  // Add y-axis label
  g.append("text")
    .attr("class", "y-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("y", -40)
    .attr("x", -height / 2)
    .text("Value");
  
  // Create a line generator
  const line = d3.line()
    .x(d => detailedXScale(d.time))
    .y(d => detailedYScale(d.value))
    .curve(d3.curveMonotoneX);
  
  // Add lines for each selected signal
  selectedSignals.forEach(signal => {
    if (loadedData[signal.tid]) {
      const path = chartArea.append("path")
        .datum(loadedData[signal.tid])
        .attr("class", "signal-line")
        .attr("fill", "none")
        .attr("stroke", signal.color)
        .attr("stroke-width", 2)
        .attr("d", line);
      
      // Add a smooth enter animation
      const pathLength = path.node().getTotalLength();
      path.attr("stroke-dasharray", pathLength + " " + pathLength)
        .attr("stroke-dashoffset", pathLength)
        .transition()
        .duration(1000)
        .attr("stroke-dashoffset", 0);
    }
  });
  
  // Add simulation data if available
  if (simulatedData.length > 0) {
    chartArea.append("path")
      .datum(simulatedData)
      .attr("class", "simulation-line")
      .attr("fill", "none")
      .attr("stroke", colors.simulation)
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "5,5")
      .attr("d", line);
  }
  
  // Add a vertical line for the center time
  chartArea.append("line")
    .attr("class", "center-time-line")
    .attr("x1", detailedXScale(centerTime))
    .attr("x2", detailedXScale(centerTime))
    .attr("y1", 0)
    .attr("y2", height)
    .attr("stroke", colors.timeMarker)
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,5");
  
  // Add tooltip for data exploration
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);
  
  // Add invisible overlay for mouse tracking
  chartArea.append("rect")
    .attr("class", "overlay")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mousemove", function(event) {
      // Get mouse position
      const [xPos] = d3.pointer(event);
      const time = detailedXScale.invert(xPos);
      
      // Update the tooltip position
      tooltip.style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
      
      // Show values for each signal at this time
      let html = `<strong>Time: ${time.toFixed(1)}s</strong><br/>`;
      let foundData = false;
      
      selectedSignals.forEach(signal => {
        if (loadedData[signal.tid]) {
          // Find nearest data point
          const dataPoint = findNearestPoint(loadedData[signal.tid], time);
          if (dataPoint) {
            foundData = true;
            html += `<div style="color:${signal.color}">
              ${signal.name.split("/").pop()}: ${dataPoint.value.toFixed(2)}
            </div>`;
          }
        }
      });
      
      if (foundData) {
        tooltip.transition().duration(100).style("opacity", 0.9);
        tooltip.html(html);
        
        // Update vertical tracking line
        chartArea.select(".tracking-line").remove();
        chartArea.append("line")
          .attr("class", "tracking-line")
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("y1", 0)
          .attr("y2", height)
          .attr("stroke", "#999")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "3,3");
      }
    })
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
      chartArea.select(".tracking-line").remove();
    });
  
  // Add zooming behavior
  zoom = d3.zoom()
    .scaleExtent([1, 10])
    .extent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      // Apply zoom transform to chart area
      chartArea.attr("transform", event.transform);
      
      // Update axes
      const newXScale = event.transform.rescaleX(detailedXScale);
      g.select(".x-axis").call(xAxis.scale(newXScale));
    });
  
  // Add zoom controls
  detailedChartSvg.call(zoom);
  
  // Add zoom buttons
  const zoomControls = g.append("g")
    .attr("class", "zoom-controls")
    .attr("transform", `translate(${width - 100}, 10)`);
  
  // Zoom in button
  zoomControls.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 30)
    .attr("height", 30)
    .attr("rx", 5)
    .attr("fill", "#f0f0f0")
    .attr("stroke", "#ccc")
    .on("click", () => {
      detailedChartSvg.transition().duration(300).call(zoom.scaleBy, 1.5);
    });
  
  zoomControls.append("text")
    .attr("x", 15)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .text("+")
    .style("font-size", "20px")
    .style("user-select", "none");
  
  // Zoom out button
  zoomControls.append("rect")
    .attr("x", 40)
    .attr("y", 0)
    .attr("width", 30)
    .attr("height", 30)
    .attr("rx", 5)
    .attr("fill", "#f0f0f0")
    .attr("stroke", "#ccc")
    .on("click", () => {
      detailedChartSvg.transition().duration(300).call(zoom.scaleBy, 0.67);
    });
  
  zoomControls.append("text")
    .attr("x", 55)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .text("-")
    .style("font-size", "20px")
    .style("user-select", "none");
  
  // Reset zoom button
  zoomControls.append("rect")
    .attr("x", 80)
    .attr("y", 0)
    .attr("width", 30)
    .attr("height", 30)
    .attr("rx", 5)
    .attr("fill", "#f0f0f0")
    .attr("stroke", "#ccc")
    .on("click", () => {
      detailedChartSvg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    });
  
  zoomControls.append("text")
    .attr("x", 95)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .text("⟲")
    .style("font-size", "16px")
    .style("user-select", "none");
  
  // Add legend
  const legendGroup = g.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - 150}, ${50})`);
  
  selectedSignals.forEach((signal, i) => {
    const legendRow = legendGroup.append("g")
      .attr("transform", `translate(0, ${i * 20})`);
    
    legendRow.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 20)
      .attr("y2", 0)
      .attr("stroke", signal.color)
      .attr("stroke-width", 2);
    
    legendRow.append("text")
      .attr("x", 25)
      .attr("y", 4)
      .text(signal.name.split("/").pop())
      .style("font-size", "10px");
  });
  
  // Add simulation to legend if present
  if (simulatedData.length > 0) {
    const simRow = legendGroup.append("g")
      .attr("transform", `translate(0, ${selectedSignals.length * 20})`);
    
    simRow.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 20)
      .attr("y2", 0)
      .attr("stroke", colors.simulation)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");
    
    simRow.append("text")
      .attr("x", 25)
      .attr("y", 4)
      .text("Simulation")
      .style("font-size", "10px");
  }
  
  // Helper function to find the nearest data point to a given time
  function findNearestPoint(data, time) {
    let closest = null;
    let closestDist = Infinity;
    
    for (const point of data) {
      const dist = Math.abs(point.time - time);
      if (dist < closestDist) {
        closestDist = dist;
        closest = point;
      }
    }
    
    // Only return if reasonably close (within 5 seconds)
    return closestDist <= 5 ? closest : null;
  }
}

// Initialize the intervention decision tree
function initInterventionTree(centerTime) {
  // Clear existing tree
  d3.select("#interventionTree").selectAll("*").remove();
  
  // Set dimensions
  const margin = { top: 20, right: 20, bottom: 20, left: 20 };
  const width = document.getElementById("interventionTree").clientWidth - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;
  
  // Create SVG
  const svg = d3.select("#interventionTree")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  
  // Get tree data
  const treeData = generateTreeData(centerTime);
  
  // Create tree layout
  const treeLayout = d3.tree()
    .size([width, height - 50]);
  
  // Create hierarchy
  const root = d3.hierarchy(treeData);
  
  // Compute node positions
  treeLayout(root);
  
  // Add links between nodes
  svg.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "link")
    .attr("d", d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y))
    .attr("fill", "none")
    .attr("stroke", "#ccc")
    .attr("stroke-width", 1.5);
  
  // Create nodes
  const nodes = svg.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("class", d => `node ${d.data.type}`)
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .on("mouseover", showNodeDetails)
    .on("click", (event, d) => {
      // Handle clicks for intervention nodes
      if (d.data.type === "intervention") {
        if (d.data.name.includes("A")) {
          chooseInterventionA(d.data.eventType);
        } else if (d.data.name.includes("B")) {
          chooseInterventionB(d.data.eventType);
        }
      }
    });
  
  // Add node circles
  nodes.append("circle")
    .attr("r", d => d.data.type === "root" ? 10 : 7)
    .attr("fill", d => {
      if (d.data.type === "root") return "#666";
      if (d.data.type === "event") return "#FF9800";
      if (d.data.name.includes("A")) return colors.interventionA;
      if (d.data.name.includes("B")) return colors.interventionB;
      return "#999";
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);
  
  // Add labels
  nodes.append("text")
    .attr("dy", d => d.data.type === "root" ? 25 : 20)
    .attr("text-anchor", "middle")
    .text(d => d.data.name)
    .attr("font-size", "10px");
  
  // Add additional labels for intervention probability
  nodes.filter(d => d.data.type === "intervention")
    .append("text")
    .attr("dy", 32)
    .attr("text-anchor", "middle")
    .text(d => `Success: ${d.data.probability}%`)
    .attr("font-size", "8px")
    .attr("fill", "#666");
  
  // Add tooltips
  const tooltip = d3.select("#tooltip");
  
  // Helper function for node details
  function showNodeDetails(event, d) {
    tooltip.transition()
      .duration(200)
      .style("opacity", 0.9);
    
    let html = `<strong>${d.data.name}</strong><br/>`;
    
    if (d.data.type === "root") {
      html += "Current crisis state";
    } else if (d.data.type === "event") {
      html += `Event Type: ${d.data.eventType}<br/>`;
      html += "Select an intervention";
    } else if (d.data.type === "intervention") {
      html += `Success Probability: ${d.data.probability}%<br/>`;
      html += `Strategy: ${d.data.strategy}<br/>`;
      html += "Click to simulate";
    } else if (d.data.type === "outcome") {
      html += d.data.description;
    }
    
    tooltip.html(html)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 28) + "px");
  }
}

// Generate tree data structure
function generateTreeData(centerTime) {
  // Create a tree structure for intervention decisions
  return {
    name: "Crisis at " + centerTime.toFixed(1) + "s",
    type: "root",
    children: [
      {
        name: "Hypotension",
        type: "event",
        eventType: "hypotension",
        children: [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Increase fluids",
            probability: 75,
            eventType: "hypotension"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "Vasopressors",
            probability: 85,
            eventType: "hypotension"
          }
        ]
      },
      {
        name: "Bradycardia",
        type: "event",
        eventType: "bradycardia",
        children: [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Atropine",
            probability: 80,
            eventType: "bradycardia"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "Pacing",
            probability: 90,
            eventType: "bradycardia"
          }
        ]
      }
    ]
  };
}

// Handle intervention A choice
function chooseInterventionA(eventType) {
  // Generate simulation data for intervention A
  simulatedData = buildSimulatedData(d3.select("#paramSlider").property("value"));
  // Refresh chart with simulation data
  refreshChart(detailedXScale.domain()[0], detailedXScale.domain()[1], (detailedXScale.domain()[0] + detailedXScale.domain()[1]) / 2);
}

// Handle intervention B choice
function chooseInterventionB(eventType) {
  // Use a different model for intervention B
  const paramValue = d3.select("#paramSlider").property("value");
  simulatedData = buildSimulatedData(paramValue, true);
  // Refresh chart with simulation data
  refreshChart(detailedXScale.domain()[0], detailedXScale.domain()[1], (detailedXScale.domain()[0] + detailedXScale.domain()[1]) / 2);
}

// Show node details on hover
function showNodeDetails(event, d) {
  // Implemented inside initInterventionTree
}

// Initialize simulation controls
function initSimulationControls() {
  // Add event listeners for slider
  d3.select("#paramSlider").on("input", function() {
    // Update the display value
    d3.select("#paramValue").property("value", this.value);
  });
  
  d3.select("#paramValue").on("input", function() {
    // Update the slider
    d3.select("#paramSlider").property("value", this.value);
  });
  
  // Add event listener for apply button
  d3.select("#applySimulation").on("click", function() {
    const paramValue = d3.select("#paramSlider").property("value");
    simulatedData = buildSimulatedData(paramValue);
    
    // Refresh chart with simulation data
    if (detailedXScale) {
      refreshChart(detailedXScale.domain()[0], detailedXScale.domain()[1], (detailedXScale.domain()[0] + detailedXScale.domain()[1]) / 2);
    }
  });
}

// Build simulated data based on parameter
function buildSimulatedData(param, isInterventionB = false) {
  // Get domain of x scale
  if (!detailedXScale) return [];
  
  const domain = detailedXScale.domain();
  const centerTime = (domain[0] + domain[1]) / 2;
  
  // Generate data points for simulation
  const result = [];
  const numPoints = 100;
  const timeStep = (domain[1] - domain[0]) / numPoints;
  
  // Get the first selected signal as reference
  let referenceData = [];
  if (selectedSignals.length > 0 && loadedData[selectedSignals[0].tid]) {
    referenceData = loadedData[selectedSignals[0].tid];
  } else {
    // If no reference data, return empty array
    return [];
  }
  
  // Find the average value before center time
  const preValues = referenceData.filter(d => d.time < centerTime).map(d => d.value);
  const preAvg = preValues.length > 0 ? d3.mean(preValues) : 0;
  
  // Generate simulated data
  for (let i = 0; i <= numPoints; i++) {
    const time = domain[0] + i * timeStep;
    
    // Find closest reference point
    const closestPoint = referenceData.reduce((prev, curr) => 
      Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev
    );
    
    let value;
    
    if (time < centerTime) {
      // Before intervention: use actual data
      value = closestPoint.value;
    } else {
      // After intervention: simulate based on parameter
      // Time since intervention
      const elapsed = time - centerTime;
      
      // Effect magnitude increases with parameter
      const magnitude = param / 100;
      
      // Different models for different interventions
      if (isInterventionB) {
        // Intervention B: quick response then plateau
        value = closestPoint.value + (preAvg - closestPoint.value) * 
          (1 - Math.exp(-elapsed * magnitude * 0.2)) * magnitude * 2;
      } else {
        // Intervention A: gradual improvement
        value = closestPoint.value + (preAvg - closestPoint.value) * 
          Math.min(1, elapsed * magnitude * 0.1) * magnitude;
      }
    }
    
    result.push({
      time: time,
      value: value
    });
  }
  
  return result;
}

// Generate demo data for crisis analysis if real data isn't available
function generateDemoData(tid, startTime, endTime) {
  console.log(`Generating demo data for ${tid} from ${startTime} to ${endTime}`);
  
  const dataPoints = 500;
  const timeStep = (endTime - startTime) / dataPoints;
  const result = [];
  
  // Base waveform parameters - different for each signal
  const baseFreq = (parseInt(tid, 16) % 10) / 10 + 0.1; // 0.1-1.0 Hz, varies by signal
  const amplitude = (parseInt(tid, 16) % 15) + 5; // 5-20 amplitude, varies by signal
  const trend = (parseInt(tid, 16) % 3) - 1; // -1, 0, or 1 for downward, flat, or upward trend
  
  // Crisis event at 40% of the time range
  const crisisPoint = startTime + (endTime - startTime) * 0.4;
  const recoveryPoint = startTime + (endTime - startTime) * 0.7;
  
  for (let i = 0; i < dataPoints; i++) {
    const time = startTime + i * timeStep;
    
    // Base sinusoidal signal
    let value = amplitude * Math.sin(2 * Math.PI * baseFreq * i / 50);
    
    // Add trend
    value += trend * (i / dataPoints) * 10;
    
    // Add crisis event - sudden change followed by recovery
    if (time >= crisisPoint && time < recoveryPoint) {
      // How far into the crisis (0-1)
      const crisisProgress = (time - crisisPoint) / (recoveryPoint - crisisPoint);
      
      if (crisisProgress < 0.1) {
        // Initial sharp change
        value += amplitude * 0.8 * (crisisProgress / 0.1);
      } else if (crisisProgress < 0.4) {
        // Sustained crisis
        value += amplitude * 0.8;
      } else {
        // Recovery
        value += amplitude * 0.8 * (1 - (crisisProgress - 0.4) / 0.6);
      }
    }
    
    // Add noise
    value += (Math.random() - 0.5) * amplitude * 0.2;
    
    result.push({
      time: time,
      value: value,
      // Include min/max values for consistency with data_api.js
      minValue: value - Math.random() * 0.5,
      maxValue: value + Math.random() * 0.5
    });
  }
  
  return result;
}
