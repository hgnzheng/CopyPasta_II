// dashboard.js

// Global chart dimensions with responsive sizing
const margin = { top: 20, right: 50, bottom: 50, left: 60 },
      width = 900 - margin.left - margin.right,
      height = 400 - margin.top - margin.bottom;

// Playback variables
let currentTime = 0;
let playing = false;
let playbackSpeed = 1;
let timer = null;

// References to current chart elements
let currentXScale,
    currentYScale,
    currentTimeMarker,
    currentAnnotationGroup,
    currentXDomain,
    currentTransitionDuration = 300; // animation duration in ms

// Global data from CSV
let casesData, labsData, trksData;
// Store detected anomalies
let anomalies = [];

// Color palette for improved aesthetics
const colors = {
  mainLine: "#4285F4",  // Google blue
  movingAvg1: "#FBBC05", // Google yellow
  movingAvg5: "#34A853", // Google green
  anomalyMarker: "#EA4335", // Google red
  timeMarker: "rgba(0, 0, 0, 0.5)",
  annotationNormal: "#5F6368", // Google gray
  annotationActive: "#F6B26B" // Orange
};

// Tooltip for mouseover feedback with improved styling
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

// ----------------------------------------------------------
// 1) PLAYBACK CONTROLS
// ----------------------------------------------------------
function updatePlayback() {
  // Update the scrubber slider
  d3.select("#scrubber").property("value", currentTime);

  // Move vertical time marker with smooth transition
  if (window.mainXScale && window.timeMarker) {
    const xPos = window.mainXScale(currentTime);
    window.timeMarker
      .transition()
      .duration(currentTransitionDuration / playbackSpeed)
      .attr("x1", xPos)
      .attr("x2", xPos);
  }

  // Highlight annotations whose time is <= currentTime with transition
  if (currentAnnotationGroup) {
    currentAnnotationGroup.selectAll("circle")
      .transition()
      .duration(currentTransitionDuration / 2)
      .attr("fill", d => currentTime >= d.time ? colors.annotationActive : d.baseColor)
      .attr("r", d => currentTime >= d.time ? 8 : 6) // Make active annotations slightly larger
      .attr("stroke-width", d => currentTime >= d.time ? 2 : 1);
      
    // Add flashing effect to critical events
    currentAnnotationGroup.selectAll("circle")
      .classed("flash", d => d.critical && currentTime >= d.time);
  }
  
  // Check for anomalies around current time
  checkForAnomalies();
}

function stepPlayback() {
  if (!playing) return;
  
  // Increment time based on speed
  currentTime += playbackSpeed;
  
  // Update the display
  updatePlayback();
  
  // Schedule the next step
  timer = setTimeout(stepPlayback, 100);
}

function playPlayback() {
  if (playing) return;
  
  playing = true;
  document.getElementById("play").disabled = true;
  document.getElementById("pause").disabled = false;
  
  stepPlayback();
}

function pausePlayback() {
  if (!playing) return;
  
  playing = false;
  document.getElementById("play").disabled = false;
  document.getElementById("pause").disabled = true;
  
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function rewindPlayback() {
  if (playing) pausePlayback();
  
  currentTime = currentXDomain ? currentXDomain[0] : 0;
  updatePlayback();
}

function fastForwardPlayback() {
  if (playing) pausePlayback();
  
  currentTime = currentXDomain ? currentXDomain[1] : 100;
  updatePlayback();
}

// ----------------------------------------------------------
// ANOMALY DETECTION FUNCTIONS
// ----------------------------------------------------------
function checkForAnomalies() {
  if (!window.currentTrackData) return;
  
  const currentData = window.currentTrackData;
  const timeWindow = 10; // Look at data points within 10 seconds of current time
  
  // Get data points within the time window
  const relevantData = currentData.filter(d => 
    Math.abs(d.time - currentTime) <= timeWindow
  );
  
  if (relevantData.length < 3) return; // Need at least a few points
  
  // Simple anomaly detection based on standard deviation
  const values = relevantData.map(d => d.value);
  const mean = d3.mean(values);
  const stdDev = d3.deviation(values);
  
  // Define threshold for anomaly (e.g., 2 standard deviations)
  const threshold = 2;
  
  relevantData.forEach(d => {
    // Check if this point is an anomaly
    if (Math.abs(d.value - mean) > threshold * stdDev) {
      // Check if we already detected this anomaly
      const existingAnomaly = anomalies.find(a => Math.abs(a.time - d.time) < 2);
      
      if (!existingAnomaly && d.time <= currentTime) {
        // This is a new anomaly
        const anomaly = {
          time: d.time,
          value: d.value,
          severity: Math.abs(d.value - mean) / stdDev > 3 ? 'critical' : 'warning'
        };
        
        anomalies.push(anomaly);
        
        // Add visual marker
        if (currentXScale && currentYScale) {
          d3.select("svg").select("g")
            .append("circle")
            .attr("class", "anomaly-marker")
            .attr("cx", currentXScale(d.time))
            .attr("cy", currentYScale(d.value))
            .attr("r", 0)
            .attr("fill", anomaly.severity === 'critical' ? colors.anomalyMarker : "#FFA726")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .attr("opacity", 0.8)
            .on("mouseover", function(event) {
              // Show tooltip
              tooltip.transition()
                .duration(200)
                .style("opacity", .9);
              tooltip.html(`
                <strong>${anomaly.severity.toUpperCase()}</strong><br/>
                Time: ${d.time.toFixed(1)}s<br/>
                Value: ${d.value.toFixed(1)}<br/>
                ${anomaly.severity === 'critical' ? 
                  'Value exceeds 3σ from mean' : 
                  'Value exceeds 2σ from mean'}
              `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function(d) {
              tooltip.transition()
                .duration(500)
                .style("opacity", 0);
            })
            .on("click", function() {
              // Navigate to crisis analysis page
              const caseId = d3.select("#caseSelector").property("value");
              window.location.href = `crisisAnalysis.html?caseId=${caseId}&centerTime=${d.time}&start=${d.time-30}&end=${d.time+30}`;
            })
            .transition()
            .duration(500)
            .attr("r", anomaly.severity === 'critical' ? 10 : 8);
        }
      }
    }
  });
}

// ----------------------------------------------------------
// 2) LOAD DATA
// ----------------------------------------------------------
document.addEventListener("DOMContentLoaded", function() {
  // Check if we have the data API available
  if (!window.dataAPI) {
    console.error("Data API not found - falling back to legacy data loading");
    
    // Create a basic version of dataAPI for fallback
    window.dataAPI = {
      initialize: function() {
        console.warn("Using fallback data loading methods");
        return loadData();
      },
      getTracksForCase: function(caseId) {
        return Promise.resolve(window.trksData.filter(t => t.caseid === +caseId));
      },
      getLabsForCase: function(caseId) {
        return Promise.resolve(window.labsData.filter(l => l.caseid === +caseId));
      },
      getSignalData: function(tid, startTime, endTime) {
        // This is a simplified fallback that won't actually work for signal data
        // It will just show an error message to the user
        showErrorMessage("Signal data loading requires the data API module.");
        return Promise.reject("Signal data loading requires the data API module");
      }
    };
  }
  
  // Bind playback buttons
  document.getElementById("play").addEventListener("click", playPlayback);
  document.getElementById("pause").addEventListener("click", pausePlayback);
  document.getElementById("rewind").addEventListener("click", rewindPlayback);
  document.getElementById("fastForward").addEventListener("click", fastForwardPlayback);
  
  // Initialize speed control
  document.getElementById("speed").addEventListener("change", function() {
    playbackSpeed = parseFloat(this.value);
  });

  // Initialize loading - using data API if available
  if (window.dataAPI) {
    initializeWithDataAPI();
  } else {
    // Legacy loading method
    loadData();
  }
});

// Modern initialization method using data API
function initializeWithDataAPI() {
  // Show loading indicator
  showLoadingOverlay('Initializing dashboard...');
  
  // Initialize the data API
  window.dataAPI.initialize()
    .then(() => {
      // Once initialized, get the case list
      return window.dataAPI.getCaseList();
    })
    .then(cases => {
      // Populate case dropdown
      let caseSelector = d3.select("#caseSelector");
      caseSelector.selectAll("option")
        .data(cases)
        .enter()
        .append("option")
        .attr("value", d => d.caseid)
        .text(d => `Case ${d.caseid}: ${d.opname || 'Unknown'}`);

      // On case change
      caseSelector.on("change", function() {
        updateCaseWithDataAPI(+this.value);
      });

      // By default, pick the first case
      let defaultCase = cases[0];
      if (defaultCase) {
        caseSelector.property("value", defaultCase.caseid);
        updateCaseWithDataAPI(defaultCase.caseid);
      } else {
        showErrorMessage("No cases found in the dataset.");
      }
      
      // Hide loading indicator
      hideLoadingOverlay();
    })
    .catch(error => {
      console.error("Error initializing dashboard:", error);
      showErrorMessage(`Failed to initialize dashboard: ${error.message || 'Unknown error'}`);
    });
}

// Legacy loading method (fallback)
function loadData() {
  // Show loading indicator
  showLoadingOverlay('Loading data...');

  Promise.all([
    d3.csv("data/cases.txt", d3.autoType),
    d3.csv("data/labs.txt", d3.autoType),
    d3.csv("data/trks.txt", d3.autoType)
  ])
  .then(([cases, labs, trks]) => {
    // Store in global variables for legacy support
    window.casesData = cases;
    window.labsData = labs;
    window.trksData = trks;

    // Populate case dropdown
    let caseSelector = d3.select("#caseSelector");
    caseSelector.selectAll("option")
      .data(cases)
      .enter()
      .append("option")
      .attr("value", d => d.caseid)
      .text(d => `Case ${d.caseid}: ${d.opname || 'Unknown'}`);

    // On case change
    caseSelector.on("change", function() {
      updateCase(+this.value);
    });

    // By default, pick the first case that has track data
    let defaultCase = cases.find(c => trks.some(t => t.caseid === c.caseid)) || cases[0];
    caseSelector.property("value", defaultCase.caseid);
    updateCase(defaultCase.caseid);

    // Hide loading indicator
    hideLoadingOverlay();
  })
  .catch(error => {
    console.error("Error loading data files:", error);
    // Show error to user
    const errorMessage = `
      <div class="error-message">
        <h3>Error Loading Data</h3>
        <p>${error.message || 'Unknown error'}</p>
        <button onclick="location.reload()">Retry</button>
      </div>
    `;
    document.getElementById("chart").innerHTML = errorMessage;
    hideLoadingOverlay();
  });
}

// ----------------------------------------------------------
// 3) UPDATE CASE USING DATA API
// ----------------------------------------------------------
function updateCaseWithDataAPI(caseId) {
  // Stop playback if needed
  if (playing) pausePlayback();

  // Load tracks for this case
  window.dataAPI.getTracksForCase(caseId)
    .then(tracks => {
      // Update track dropdown
      let trackSelector = d3.select("#trackSelector");
      trackSelector.selectAll("option").remove();
      trackSelector.selectAll("option")
        .data(tracks)
        .enter()
        .append("option")
        .attr("value", d => d.tid)
        .text(d => d.tname);

      // On track change
      trackSelector.on("change", function() {
        if (playing) pausePlayback();
        updateChartWithDataAPI(this.value);
      });

      // If we have at least one track, update the chart
      if (tracks.length > 0) {
        trackSelector.property("value", tracks[0].tid);
        updateChartWithDataAPI(tracks[0].tid);
      } else {
        d3.select("#chart").html("No track data available for this case.");
      }

      // Load labs in the background
      window.dataAPI.getLabsForCase(caseId)
        .then(labs => {
          // Update labs table
          updateLabTable(labs);
        })
        .catch(error => {
          console.error("Error loading lab data:", error);
        });
    })
    .catch(error => {
      console.error("Error loading tracks for case:", error);
      d3.select("#chart").html(`Error loading tracks: ${error.message}`);
    });
}

// Update lab results table
function updateLabTable(labs) {
  let labTable = d3.select("#labTable");
  labTable.html("");
  
  if (labs.length > 0) {
    let header = labTable.append("thead").append("tr");
    header.append("th").text("DateTime");
    header.append("th").text("Test Name");
    header.append("th").text("Result");
    
    let tbody = labTable.append("tbody");
    
    // Only show up to 25 rows to keep it performant
    const displayLabs = labs.slice(0, 25);
    
    displayLabs.forEach(lab => {
      let row = tbody.append("tr");
      row.append("td").text(lab.dt);
      row.append("td").text(lab.name);
      row.append("td").text(lab.result);
    });
    
    // If there are more labs than we're showing
    if (labs.length > 25) {
      let infoRow = tbody.append("tr");
      infoRow.append("td")
        .attr("colspan", 3)
        .attr("class", "info-message")
        .text(`Showing 25 of ${labs.length} lab results.`);
    }
  } else {
    labTable.append("tr").append("td")
      .attr("colspan", 3)
      .text("No lab results available for this case.");
  }
}

// ----------------------------------------------------------
// 4) UPDATE CHART USING DATA API
// ----------------------------------------------------------
function updateChartWithDataAPI(tid) {
  if (playing) pausePlayback();
  currentTime = 0;
  anomalies = []; // Reset anomalies

  // Remove any existing chart
  d3.select("#chart").select("svg").remove();
  
  // Show loading indicator
  showLoadingOverlay('Loading chart data...');

  // Set up main SVG with responsive sizing
  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Add title
  svg.append("text")
    .attr("class", "chart-title")
    .attr("x", width / 2)
    .attr("y", -margin.top / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .text("Biosignals Time Series");

  // Add clip path
  svg.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const chartG = svg.append("g")
    .attr("clip-path", "url(#clip)");

  // Get an initial time range estimate
  const startTime = 0;
  const endTime = 1000; // Initial estimate, will be refined

  // Fetch signal data with optimized loading
  window.dataAPI.getSignalData(tid, startTime, endTime)
    .then(data => {
      // Store globally for reference
      window.currentTrackData = data;

      // Compute domain with a bit of padding
      const timeExtent = d3.extent(data, d => d.time);
      
      // If we have min/max values in our dataset, use them for more accurate visualization
      let valueMin, valueMax;
      if (data.length > 0 && 'minValue' in data[0] && 'maxValue' in data[0]) {
        valueMin = d3.min(data, d => d.minValue);
        valueMax = d3.max(data, d => d.maxValue);
      } else {
        // Fall back to just using the average values
        const valueExtent = d3.extent(data, d => d.value);
        valueMin = valueExtent[0];
        valueMax = valueExtent[1];
      }
      
      const valuePadding = (valueMax - valueMin) * 0.1;

      const xScale = d3.scaleLinear()
        .range([0, width])
        .domain([timeExtent[0], timeExtent[1]]);

      const yScale = d3.scaleLinear()
        .range([height, 0])
        .domain([valueMin - valuePadding, valueMax + valuePadding]);

      // Save scales globally for updates
      window.mainXScale = xScale;
      window.mainYScale = yScale;
      
      // Check if we're dealing with a large dataset
      const isLargeDataset = data.length > 1000;

      // Create line generator
      const line = d3.line()
        .x(d => xScale(d.time))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX); // smoother curve

      // Add the line path - with proper rendering strategy based on dataset size
      if (isLargeDataset && 'minValue' in data[0] && 'maxValue' in data[0]) {
        // For large datasets, add a range area to show data variation
        const area = d3.area()
          .x(d => xScale(d.time))
          .y0(d => yScale(d.minValue))
          .y1(d => yScale(d.maxValue))
          .curve(d3.curveMonotoneX);
          
        chartG.append("path")
          .datum(data)
          .attr("class", "range-area")
          .attr("fill", "rgba(66, 133, 244, 0.2)")
          .attr("d", area);
          
        // Add the main line (mean values)
        chartG.append("path")
          .datum(data)
          .attr("class", "line")
          .attr("fill", "none")
          .attr("stroke", "#4285F4")
          .attr("stroke-width", 1.5)
          .attr("d", line);
      } else {
        // Standard line rendering for smaller datasets
        chartG.append("path")
          .datum(data)
          .attr("class", "line")
          .attr("fill", "none")
          .attr("stroke", "#4285F4")
          .attr("stroke-width", 1.5)
          .attr("d", line);
      }

      // Add a vertical line to visualize current time
      chartG.append("line")
        .attr("class", "time-marker")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("x1", xScale(currentTime))
        .attr("x2", xScale(currentTime))
        .attr("stroke", colors.timeMarker)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 4");

      // Save for use in updatePlayback
      window.timeMarker = chartG.select(".time-marker");

      // Add axes
      const xAxis = d3.axisBottom(xScale);
      const yAxis = d3.axisLeft(yScale);
      
      // Add x-axis
      svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis);
        
      // Add y-axis
      svg.append("g")
        .attr("class", "y-axis")
        .call(yAxis);
        
      // Add x-axis label
      svg.append("text")
        .attr("class", "x-label")
        .attr("x", width / 2)
        .attr("y", height + 35)
        .attr("text-anchor", "middle")
        .text("Time (seconds)");
        
      // Add y-axis label
      svg.append("text")
        .attr("class", "y-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -40)
        .attr("text-anchor", "middle")
        .text("Value");

      // Compute moving averages
      computeMovingAverages(data);
      
      // Add 1-minute moving average line
      const ma1Line = d3.line()
        .x(d => xScale(d.time))
        .y(d => yScale(d.ma1min))
        .defined(d => !isNaN(d.ma1min))
        .curve(d3.curveMonotoneX);
        
      const ma1Path = chartG.append("path")
        .datum(data.filter(d => d.ma1min !== undefined))
        .attr("class", "ma1min-line")
        .attr("fill", "none")
        .attr("stroke", colors.movingAvg1)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,5")
        .attr("d", ma1Line);
        
      // Add 5-minute moving average line
      const ma5Line = d3.line()
        .x(d => xScale(d.time))
        .y(d => yScale(d.ma5min))
        .defined(d => !isNaN(d.ma5min))
        .curve(d3.curveMonotoneX);
        
      const ma5Path = chartG.append("path")
        .datum(data.filter(d => d.ma5min !== undefined))
        .attr("class", "ma5min-line")
        .attr("fill", "none")
        .attr("stroke", colors.movingAvg5)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "1,3")
        .attr("d", ma5Line);
        
      // Store references for toggling
      window.ma1Path = ma1Path;
      window.ma5Path = ma5Path;
      
      // Initially hide MA lines
      ma1Path.style("display", "none");
      ma5Path.style("display", "none");
      
      // Add event handler for the moving average dropdown
      d3.select("#MAdropdownMenu").on("change", function() {
        const value = this.value;
        window.ma1Path.style("display", value === "1min" || value === "both" ? "block" : "none");
        window.ma5Path.style("display", value === "5min" || value === "both" ? "block" : "none");
      });
      
      // Add sample annotations (in real app, fetch this from an API)
      const annotations = [
        { time: timeExtent[0] + (timeExtent[1] - timeExtent[0]) * 0.2, type: "Phase Start", label: "Induction", critical: false },
        { time: timeExtent[0] + (timeExtent[1] - timeExtent[0]) * 0.4, type: "Medication", label: "Propofol", critical: false },
        { time: timeExtent[0] + (timeExtent[1] - timeExtent[0]) * 0.6, type: "Event", label: "Intubation", critical: true },
        { time: timeExtent[0] + (timeExtent[1] - timeExtent[0]) * 0.8, type: "Alert", label: "BP Drop", critical: true }
      ];
      
      // Add color based on type
      annotations.forEach(d => {
        switch(d.type) {
          case "Phase Start": d.baseColor = "#4CAF50"; break; // Green
          case "Medication": d.baseColor = "#2196F3"; break; // Blue
          case "Event": d.baseColor = "#FF9800"; break; // Orange
          case "Alert": d.baseColor = "#F44336"; break; // Red
          default: d.baseColor = "#9E9E9E"; // Gray
        }
      });

      // Add annotation markers
      const annotationGroup = svg.append("g")
        .attr("class", "annotations");

      currentAnnotationGroup = annotationGroup;
        
      annotationGroup.selectAll("circle")
        .data(annotations)
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.time))
        .attr("cy", 0)
        .attr("r", 6)
        .attr("fill", d => d.baseColor)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .on("mouseover", function(event, d) {
          // Show tooltip on hover
          tooltip.transition()
            .duration(200)
            .style("opacity", 0.9);
          tooltip.html(`
            <strong>${d.type}</strong><br/>
            ${d.label}<br/>
            Time: ${d.time.toFixed(1)}s
          `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
            
          // Highlight the marker
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 8)
            .attr("stroke-width", 2);
        })
        .on("mouseout", function() {
          // Hide tooltip
          tooltip.transition()
            .duration(500)
            .style("opacity", 0);
            
          // Restore marker
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 6)
            .attr("stroke-width", 1);
        })
        .on("click", function(event, d) {
          // Navigate to detailed view on click
          const caseId = d3.select("#caseSelector").property("value");
          window.location.href = `crisisAnalysis.html?caseId=${caseId}&centerTime=${d.time}&start=${d.time-30}&end=${d.time+30}`;
        });

      // Add hoverable data points (not all, to avoid cluttering)
      const sampleInterval = Math.ceil(data.length / 50); // Show about 50 points
      chartG.selectAll(".data-point")
        .data(data.filter((d, i) => i % sampleInterval === 0))
        .enter()
        .append("circle")
        .attr("class", "data-point")
        .attr("cx", d => xScale(d.time))
        .attr("cy", d => yScale(d.value))
        .attr("r", 3)
        .attr("fill", colors.mainLine)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .attr("opacity", 0.7)
        .on("mouseover", function(event, d) {
          // Enlarge point and show tooltip
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 5)
            .attr("opacity", 1);
          
          tooltip.transition()
            .duration(200)
            .style("opacity", 0.9);
          tooltip.html(`
            Time: ${d.time.toFixed(1)}s<br/>
            Value: ${d.value.toFixed(2)}
          `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
          // Restore point and hide tooltip
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 3)
            .attr("opacity", 0.7);
          
          tooltip.transition()
            .duration(500)
            .style("opacity", 0);
        });

      // Update the scrubber slider range
      d3.select("#scrubber")
        .attr("min", timeExtent[0])
        .attr("max", timeExtent[1])
        .attr("step", (timeExtent[1] - timeExtent[0]) / 1000)
        .on("input", function() {
          currentTime = +this.value;
          updatePlayback();
        });
        
      // Add legend
      const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width - 150}, 10)`);
        
      // Raw data
      legend.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 20)
        .attr("y2", 0)
        .attr("stroke", colors.mainLine)
        .attr("stroke-width", 2.5);
        
      legend.append("text")
        .attr("x", 25)
        .attr("y", 4)
        .text("Raw Data")
        .style("font-size", "10px");
        
      // 1-min MA
      legend.append("line")
        .attr("x1", 0)
        .attr("y1", 15)
        .attr("x2", 20)
        .attr("y2", 15)
        .attr("stroke", colors.movingAvg1)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
        
      legend.append("text")
        .attr("x", 25)
        .attr("y", 19)
        .text("1-min MA")
        .style("font-size", "10px");
        
      // 5-min MA
      legend.append("line")
        .attr("x1", 0)
        .attr("y1", 30)
        .attr("x2", 20)
        .attr("y2", 30)
        .attr("stroke", colors.movingAvg5)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "10,5");
        
      legend.append("text")
        .attr("x", 25)
        .attr("y", 34)
        .text("5-min MA")
        .style("font-size", "10px");
        
      // Update the overview timeline
      if (typeof drawOverview === "function") {
        drawOverview();
      }
      
      // Hide loading indicator
      hideLoadingOverlay();
    })
    .catch(error => {
      console.error("Error loading signal data:", error);
      d3.select("#chart").html(`Error loading data: ${error.message}`);
      hideLoadingOverlay();
    });
}

// Helper function to compute moving averages efficiently
function computeMovingAverages(data) {
  // 1-min moving average (window: 60 seconds)
  const window1 = 60;
  
  // Use a sliding window approach for better performance
  let sum = 0;
  let count = 0;
  let windowStart = 0;
  
  for (let i = 0; i < data.length; i++) {
    // Add current point to sum
    sum += data[i].value;
    count++;
    
    // Remove points that fall outside the window
    while (windowStart < i && data[i].time - data[windowStart].time > window1) {
      sum -= data[windowStart].value;
      count--;
      windowStart++;
    }
    
    // Calculate moving average
    data[i].ma1min = count > 0 ? sum / count : data[i].value;
  }
  
  // 5-min moving average (window: 300 seconds)
  const window5 = 300;
  
  // Reset for 5-min calculation
  sum = 0;
  count = 0;
  windowStart = 0;
  
  for (let i = 0; i < data.length; i++) {
    // Add current point to sum
    sum += data[i].value;
    count++;
    
    // Remove points that fall outside the window
    while (windowStart < i && data[i].time - data[windowStart].time > window5) {
      sum -= data[windowStart].value;
      count--;
      windowStart++;
    }
    
    // Calculate moving average
    data[i].ma5min = count > 0 ? sum / count : data[i].value;
  }
}

// Helper function to set main chart domain (for brushing from overview)
function setMainChartDomain(newDomain) {
  if (!window.mainXScale) return;
  
  // Update the global scale references
  currentXScale = window.mainXScale;
  currentYScale = window.mainYScale;
  
  // Update the scale
  currentXScale.domain(newDomain);
  
  // Prevent excessive redrawing by debouncing updates
  // If we already have a pending update request, cancel it
  if (window.pendingChartUpdate) {
    window.cancelAnimationFrame(window.pendingChartUpdate);
  }
  
  // Schedule the update for the next animation frame
  window.pendingChartUpdate = window.requestAnimationFrame(() => {
    // Update the x-axis
    d3.select(".x-axis")
      .call(d3.axisBottom(currentXScale).ticks(10).tickFormat(d => d + "s"));
    
    // Update all elements that depend on the x scale
    updateChartElements();
    
    // Clear the pending update flag
    window.pendingChartUpdate = null;
  });
  
  // Store the current domain for reference immediately
  currentXDomain = newDomain;
}

// Update chart elements after scale changes
function updateChartElements() {
  // Skip unnecessary updates if the chart is not visible
  if (!document.getElementById("chart").offsetParent) return;
  
  // Performance optimization: Only update elements that are in view
  const [domainStart, domainEnd] = currentXScale.domain();
  
  // Get current track data
  const data = window.currentTrackData;
  if (!data || !data.length) return;
  
  // Filter to only the data points in the current domain plus a small buffer
  // This greatly improves performance for large datasets
  const domainRange = domainEnd - domainStart;
  const buffer = domainRange * 0.1; // 10% buffer on each side
  const visibleData = data.filter(d => 
    d.time >= domainStart - buffer && d.time <= domainEnd + buffer
  );
  
  // Check if we're dealing with a large dataset with range area
  const hasRangeArea = d3.select(".range-area").size() > 0;
  
  // Update range area if it exists
  if (hasRangeArea) {
    // Create area generator optimized for visible data
    const area = d3.area()
      .x(d => currentXScale(d.time))
      .y0(d => currentYScale(d.minValue))
      .y1(d => currentYScale(d.maxValue))
      .curve(d3.curveMonotoneX);
      
    d3.select(".range-area")
      .datum(visibleData)
      .attr("d", area);
  }

  // Create optimized line generator
  const line = d3.line()
    .x(d => currentXScale(d.time))
    .y(d => currentYScale(d.value))
    .curve(d3.curveMonotoneX);

  // Update main line without transition for better performance
  d3.select(".line")
    .datum(visibleData)
    .attr("d", line);
  
  // Update moving average lines if they're visible
  const ma1Line = d3.select(".ma1min-line");
  const ma5Line = d3.select(".ma5min-line");
  
  if (ma1Line.style("display") !== "none") {
    ma1Line
      .datum(visibleData.filter(d => d.ma1min !== undefined))
      .attr("d", d3.line()
        .x(d => currentXScale(d.time))
        .y(d => currentYScale(d.ma1min))
        .defined(d => !isNaN(d.ma1min))
        .curve(d3.curveMonotoneX)
      );
  }
  
  if (ma5Line.style("display") !== "none") {
    ma5Line
      .datum(visibleData.filter(d => d.ma5min !== undefined))
      .attr("d", d3.line()
        .x(d => currentXScale(d.time))
        .y(d => currentYScale(d.ma5min))
        .defined(d => !isNaN(d.ma5min))
        .curve(d3.curveMonotoneX)
      );
  }
  
  // Update time marker
  if (window.timeMarker) {
    window.timeMarker
      .attr("x1", currentXScale(currentTime))
      .attr("x2", currentXScale(currentTime));
  }
  
  // Update other interactive elements without transitions
  // Only update elements that are actually present
  
  // Update annotations if present
  const annotationGroup = d3.selectAll(".annotations circle");
  if (annotationGroup.size() > 0) {
    annotationGroup.attr("cx", d => currentXScale(d.time));
  }
  
  // Update anomaly markers if present
  const anomalyMarkers = d3.selectAll(".anomaly-marker");
  if (anomalyMarkers.size() > 0) {
    anomalyMarkers.attr("cx", d => currentXScale(d.time));
  }
  
  // Update data points if present
  const dataPoints = d3.selectAll(".data-point");
  if (dataPoints.size() > 0) {
    dataPoints.attr("cx", d => currentXScale(d.time));
  }
}

// Loading overlay functions
function showLoadingOverlay(message = 'Loading...') {
  if (window.dataAPI) return; // Use the data API's built-in loading indicator if available
  
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-message">${message}</div>
    `;
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(255, 255, 255, 0.8)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector('.loading-message').textContent = message;
    overlay.style.display = 'flex';
  }
}

function hideLoadingOverlay() {
  if (window.dataAPI) return; // Use the data API's built-in loading indicator if available
  
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function updateCase(caseId) {
  // This function redirects to updateCaseWithDataAPI to fix the "updateCase is not defined" error
  updateCaseWithDataAPI(caseId);
}

// Display a user-friendly error message
function showErrorMessage(message) {
  // Hide loading overlay if it's showing
  hideLoadingOverlay();
  
  // Create error message element
  const errorMessage = `
    <div class="error-message">
      <h3>Error Loading Data</h3>
      <p>${message}</p>
      <button onclick="location.reload()">Retry</button>
    </div>
  `;
  
  // Show in the chart area
  document.getElementById("chart").innerHTML = errorMessage;
}
