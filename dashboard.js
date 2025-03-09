// dashboard.js

// Immediately show a default visualization when the page loads
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOM loaded, showing initial visualization");
  
  // Show a loading indicator
  if (typeof showLoadingOverlay === 'function') {
    showLoadingOverlay("Initializing dashboard...");
  }
  
  // Show a default visualization right away
  setTimeout(function() {
    if (typeof showDefaultVisualization === 'function') {
      showDefaultVisualization();
    }
    
    // Then try to load the real data
    if (typeof initializeWithDataAPI === 'function') {
      initializeWithDataAPI();
    }
  }, 100);
});

// Global chart dimensions with responsive sizing
const margin = { top: 20, right: 50, bottom: 50, left: 60 },
      width = 900 - margin.left - margin.right,
      height = 400 - margin.top - margin.bottom;

// Playback variables
let currentTime = 0;
let playing = false;
let playbackSpeed = 1;
let timer = null;
let fastForwardMode = true; // Always in fast forward mode
let normalPlaybackSpeed = 1; // Store normal speed for restoration

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

// Global variable to store the case hierarchy
let caseHierarchy = null;

// Toggle lab results visibility
document
  .getElementById("labToggle")
  .addEventListener("change", function () {
    document.getElementById("labResults").style.display = this
      .checked
      ? "block"
      : "none";
  });

// Add event listener for case selector
document
  .getElementById("caseSelector")
  .addEventListener("change", function () {
    const caseId = this.value;
    console.log(
      "Case selector change event triggered with caseId:",
      caseId
    );

    updateCaseWithDataAPI(caseId);
    if (caseId) {
      updateAnomaliesList(caseId); // New function to update anomalies sidebar
    }
  });

// Listen for URL parameters on page load to handle returns from crisis view
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('caseId');
  const time = urlParams.get('time');
  
  if (caseId) {
    // If we have a caseId parameter, select that case
    setTimeout(() => {
      const caseSelect = document.getElementById('caseSelector');
      if (caseSelect && caseSelect.options.length > 0) {
        for (let i = 0; i < caseSelect.options.length; i++) {
          if (caseSelect.options[i].value == caseId) {
            caseSelect.selectedIndex = i;
            caseSelect.dispatchEvent(new Event('change'));
            break;
          }
        }
      }
      
      // If we also have a time parameter, set the current time
      if (time && typeof currentTime !== 'undefined') {
        setTimeout(() => {
          currentTime = parseFloat(time);
          updatePlayback();
          updateTimeDisplay(currentTime, getCurrentValue());
        }, 500);
      }
    }, 500);
  }
});

// ----------------------------------------------------------
// 0) Basics
// ----------------------------------------------------------

// Function to update the anomalies list in the sidebar
function updateAnomaliesList(caseId) {
  // This would be populated with actual data in the real implementation
  const dummyAnomalies = [
    { time: "00:32:15", type: "Hypotension", severity: "Medium" },
    { time: "01:15:45", type: "Tachycardia", severity: "High" },
    { time: "02:05:10", type: "Oxygen Desaturation", severity: "Low" }
  ];
  
  const anomaliesList = document.getElementById('anomalies-list');
  anomaliesList.innerHTML = '';
  
  dummyAnomalies.forEach((anomaly, index) => {
    const anomalyItem = document.createElement('div');
    anomalyItem.className = 'box is-small mb-2';
    anomalyItem.innerHTML = `
      <p class="is-size-7 has-text-weight-bold">${anomaly.type} <span class="tag is-${getSeverityColor(anomaly.severity)}">${anomaly.severity}</span></p>
      <p class="is-size-7">Time: ${anomaly.time}</p>
      <a href="crisisAnalysis.html?caseId=${caseId}&time=${timeToSeconds(anomaly.time)}" class="button is-small is-outlined is-info mt-1">Analyze</a>
    `;
    anomaliesList.appendChild(anomalyItem);
  });
}
  
function getSeverityColor(severity) {
  switch(severity.toLowerCase()) {
    case 'low': return 'warning';
    case 'medium': return 'info';
    case 'high': return 'danger';
    default: return 'info';
  }
}

function timeToSeconds(timeStr) {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

// Update current time display when playback updates
function updateTimeDisplay(time, value) {
  document.getElementById('current-time-display').textContent = formatTime(time);
  document.getElementById('current-value-display').textContent = value ? value.toFixed(2) : '--';
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Dummy function to get current value - would be replaced with actual implementation
function getCurrentValue() {
  return Math.random() * 100;
}
              
// ----------------------------------------------------------
// 1) PLAYBACK CONTROLS
// ----------------------------------------------------------
function updatePlayback() {
  // Update scrubber position
  if (window.mainXScale) {
    // Convert current time to percentage for scrubber
    const domain = window.mainXScale.domain();
    const min = domain[0];
    const max = domain[1];
    const percentage = ((currentTime - min) / (max - min)) * 100;
    document.getElementById("scrubber").value = percentage;
    
    // Update time marker position
    const timeMarker = d3.select(".time-marker");
    if (!timeMarker.empty()) {
      timeMarker
        .attr("x1", window.mainXScale(currentTime))
        .attr("x2", window.mainXScale(currentTime));
    }
    
    // Check for anomalies
  checkForAnomalies();
  }
}

function stepPlayback() {
  if (!playing) return;
  
  // Increment time based on speed
  currentTime += playbackSpeed;
  
  // Check if we've reached the end of the current domain
  if (window.mainXScale) {
    const domain = window.mainXScale.domain();
    if (currentTime > domain[1]) {
      // Loop back to beginning if at the end
      currentTime = domain[0];
    }
  }
  
  // Update the display
  updatePlayback();
  
  // Always use fast forward timing (50ms)
  timer = setTimeout(stepPlayback, 50);
}

function fastForwardPlayback() {
  if (playing) {
    // If already playing, stop
    playing = false;
    
    // Update button visual to indicate stopped state
    document.getElementById("fastForward").classList.remove("active-ff");
    document.getElementById("fastForward").innerHTML = '<i class="fas fa-play"></i> Play';
    
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  } else {
    // Start playback in fast forward mode
  playing = true;
    playbackSpeed = normalPlaybackSpeed * 5; // 5x faster
    
    // Update button visual to indicate playing state
    document.getElementById("fastForward").classList.add("active-ff");
    document.getElementById("fastForward").innerHTML = '<i class="fas fa-pause"></i> Stop';
  
  stepPlayback();
  }
}

function rewindPlayback() {
  if (playing) {
    // Stop playback
  playing = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
    // Reset play button state
    document.getElementById("fastForward").classList.remove("active-ff");
    document.getElementById("fastForward").innerHTML = '<i class="fas fa-play"></i> Play';
  }
  
  // First try to get domain from mainXScale, then fall back to currentXDomain, then use default
  if (window.mainXScale) {
    const domain = window.mainXScale.domain();
    currentTime = domain[0];
  } else if (currentXDomain) {
    currentTime = currentXDomain[0];
  } else {
    currentTime = 0;
  }
  
  updatePlayback();
}

// If adjusting or updating playback speed
function updatePlaybackSpeed(newSpeed) {
  normalPlaybackSpeed = newSpeed;
  if (playing) {
    playbackSpeed = newSpeed * 5; // Maintain 5x speed while playing
  }
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
        showErrorMessage("Signal data loading requires the data API module.");
        return Promise.reject("Signal data loading requires the data API module");
      }
    };
  }
  
  // Bind playback buttons
  document.getElementById("rewind").addEventListener("click", rewindPlayback);
  document.getElementById("fastForward").addEventListener("click", fastForwardPlayback);
  
  // Initialize speed control
  document.getElementById("speed").addEventListener("change", function() {
    updatePlaybackSpeed(parseFloat(this.value));
  });

  // Initialize loading - using data API if available
  if (window.dataAPI) {
    initializeWithDataAPI();
  } else {
    // Legacy loading method
    loadData();
  }

  // Load case hierarchy data
  loadCaseHierarchy();
});

// Initialize data API
function initializeWithDataAPI() {
  // Check if dataAPI is available
  if (!window.dataAPI) {
    console.error("dataAPI is not available. Make sure data_api.js is loaded properly");
    showErrorMessage("The data API could not be initialized. Please check your console for more information.");
    
    // Still show a default visualization
    showDefaultVisualization();
    return Promise.reject("dataAPI is not available");
  }

  // Show loading indicator
  showLoadingOverlay('Initializing dashboard...');
  
  console.log("Initializing data API...");
  
  // Initialize the data API
  return window.dataAPI.initialize()
    .then(() => {
      console.log("Data API initialized successfully");
      // Once initialized, get the case list
      return window.dataAPI.getCaseList();
    })
    .then(cases => {
      console.log("Cases loaded:", cases.length);
      
      // Populate case dropdown (for legacy mode only)
      let caseSelector = d3.select("#caseSelector");
      
      // Only do this if we're not using the hierarchical selection
      const isUsingHierarchy = document.getElementById('operationCategory') && 
                             document.getElementById('complexityLevel');
      
      if (!isUsingHierarchy) {
        caseSelector.selectAll("option")
          .data(cases)
          .enter()
          .append("option")
          .attr("value", d => d.caseid)
          .text(d => `Case ${d.caseid}: ${d.opname || 'Unknown'}`);
          
        // On case change
        caseSelector.on("change", function() {
          try {
            updateCaseWithDataAPI(+this.value);
          } catch (error) {
            console.error("Error updating case:", error);
            showErrorMessage("Failed to update case. Using default visualization instead.");
            loadDefaultCaseFromDataset();
          }
        });

        // By default, pick the first case
        let defaultCase = cases[0];
        if (defaultCase) {
          caseSelector.property("value", defaultCase.caseid);
          try {
            updateCaseWithDataAPI(defaultCase.caseid);
          } catch (error) {
            console.error("Error loading default case:", error);
            loadDefaultCaseFromDataset();
          }
        } else {
          showInfoMessage("No cases found in the dataset. Using default visualization.");
          loadDefaultCaseFromDataset();
        }
      } else {
        // For hierarchical selection, trigger the loadCaseHierarchy which will
        // populate the hierarchical fields
        loadCaseHierarchy().then(() => {
          // After loading hierarchy, select the first case
          setTimeout(() => {
            const operationSelect = document.getElementById('operationCategory');
            if (operationSelect && operationSelect.options.length > 0) {
              operationSelect.selectedIndex = 1; // Select first non-empty option
              const event = new Event('change');
              operationSelect.dispatchEvent(event);
              
              // After operation type is selected, select a complexity
              setTimeout(() => {
                const complexitySelect = document.getElementById('complexityLevel');
                if (complexitySelect && complexitySelect.options.length > 0) {
                  complexitySelect.selectedIndex = 1; // Select first complexity
                  complexitySelect.dispatchEvent(new Event('change'));
                  
                  // After complexity is selected, select a case
                  setTimeout(() => {
                    const caseSelect = document.getElementById('caseSelector');
                    if (caseSelect && caseSelect.options.length > 0) {
                      caseSelect.selectedIndex = 1; // Select first case
                      caseSelect.dispatchEvent(new Event('change'));
                    } else {
                      loadDefaultCaseFromDataset();
                    }
                  }, 100);
                } else {
                  loadDefaultCaseFromDataset();
                }
              }, 100);
            } else {
              loadDefaultCaseFromDataset();
            }
          }, 100);
        }).catch(err => {
          console.error("Error loading case hierarchy:", err);
          loadDefaultCaseFromDataset();
        });
      }
      
      // Hide loading overlay
      hideLoadingOverlay();
      
      return cases;
    })
    .catch(error => {
      console.error("Error initializing with data API:", error);
      showErrorMessage("An error occurred while initializing the dashboard. Default visualization is shown.");
      hideLoadingOverlay();
      // Load a default case from the dataset instead of showing generated data
      loadDefaultCaseFromDataset();
    });
}

// Function to load a default case from the dataset
function loadDefaultCaseFromDataset() {
  console.log("Loading default case from dataset");
  
  // Show loading indicator
  showLoadingOverlay("Preparing default visualization...");
  
  // Clear any existing chart
  d3.select("#chart").select("svg").remove();
  
  // First try with a specific case ID
  const defaultCaseId = 1;
  
  try {
    // Try to get the track data for a default case
    window.dataAPI.getTracksForCase(defaultCaseId)
      .then(tracks => {
        if (tracks && tracks.length > 0) {
          // If we have tracks, update the UI to show we're using case 1
          const caseSelector = document.getElementById('caseSelector');
          if (caseSelector) {
            for (let i = 0; i < caseSelector.options.length; i++) {
              if (caseSelector.options[i].value == defaultCaseId) {
                caseSelector.selectedIndex = i;
                break;
              }
            }
          }
          
          // Update the track selector
          let trackSelector = d3.select("#trackSelector");
          trackSelector.selectAll("option").remove();
          trackSelector.selectAll("option")
            .data(tracks)
            .enter()
            .append("option")
            .attr("value", d => d.tid)
            .text(d => d.tname || `Track ${d.tid}`);
          
          // Select the first track and visualize it
          if (tracks.length > 0) {
            trackSelector.property("value", tracks[0].tid);
            updateChartWithDataAPI(tracks[0].tid);
            return; // Done, we've loaded a real track
          }
        }
        
        // If we get here, we couldn't load tracks for case 1
        throw new Error("No tracks available for default case");
      })
      .catch(error => {
        console.error("Error loading default case:", error);
        // Fall back to simulated data
        hideLoadingOverlay();
        showDefaultVisualization();
      });
  } catch (error) {
    console.error("Error in loadDefaultCaseFromDataset:", error);
    hideLoadingOverlay();
    showDefaultVisualization();
  }
}

// Create a default visualization without relying on real data
function showDefaultVisualization() {
  console.log("Creating default visualization");
  
  // Clear any existing chart
  d3.select("#chart").select("svg").remove();
  
  // Default time range
  const startTime = 0;
  const endTime = 1000;
  
  // Get default data
  let defaultData = [];
  if (window.dataAPI && typeof window.dataAPI.generateDefaultData === 'function') {
    defaultData = window.dataAPI.generateDefaultData(startTime, endTime);
  } else {
    // In case dataAPI is not available, generate simple data here
    const numPoints = 1000;
    const step = (endTime - startTime) / numPoints;
    
    for (let i = 0; i < numPoints; i++) {
      const time = startTime + i * step;
      const value = 80 + 10 * Math.sin(time / 10) + 5 * Math.sin(time / 60) + (Math.random() - 0.5) * 3;
      defaultData.push({
        time: time,
        value: value,
        minValue: value - 1,
        maxValue: value + 1
      });
    }
  }
  
  // Clear interface selections to match the default state
  try {
    // Clear dropdown selections
    const operationSelect = document.getElementById('operationCategory');
    if (operationSelect) operationSelect.selectedIndex = 0;
    
    const complexitySelect = document.getElementById('complexityLevel');
    if (complexitySelect) complexitySelect.selectedIndex = 0;
    
    const caseSelect = document.getElementById('caseSelector');
    if (caseSelect) caseSelect.selectedIndex = 0;
    
    const trackSelect = document.getElementById('trackSelector');
    if (trackSelect) {
      // Clear existing options
      while (trackSelect.options.length > 0) {
        trackSelect.remove(0);
      }
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.text = 'Default Visualization';
      defaultOption.value = '';
      trackSelect.add(defaultOption);
    }
  } catch (e) {
    console.error("Error clearing interface selections:", e);
  }
  
  // Set up the chart with default data
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
    .attr("y", -margin.top / 2 + 5)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .text("Patient Biosignal Monitoring");
  
  // Add subtitle
  svg.append("text")
    .attr("class", "chart-subtitle")
    .attr("x", width / 2)
    .attr("y", -margin.top / 2 + 30)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .text("Default Heart Rate Visualization");
  
  // Set up scales
  const xScale = d3.scaleLinear()
    .range([0, width])
    .domain([startTime, endTime]);
  
  const valueExtent = d3.extent(defaultData, d => d.value);
  const yScale = d3.scaleLinear()
    .range([height, 0])
    .domain([valueExtent[0] - 5, valueExtent[1] + 5]);
  
  // Save scales globally
  window.mainXScale = xScale;
  window.mainYScale = yScale;
  window.currentTrackData = defaultData;
  
  // Add clip path
  svg.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);
  
  // Add background grid
  const gridG = svg.append("g")
    .attr("class", "grid-lines");
  
  // Add X grid lines
  gridG.append("g")
    .attr("class", "grid x-grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickSize(-height)
      .tickFormat("")
    );
  
  // Add Y grid lines
  gridG.append("g")
    .attr("class", "grid y-grid")
    .call(d3.axisLeft(yScale)
      .tickSize(-width)
      .tickFormat("")
    );
  
  const chartG = svg.append("g")
    .attr("clip-path", "url(#clip)");
  
  // Create smooth line generator
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.value))
    .curve(d3.curveCatmullRom.alpha(0.5));
  
  // Add range area if we have min/max values
  if ('minValue' in defaultData[0] && 'maxValue' in defaultData[0]) {
    const area = d3.area()
      .x(d => xScale(d.time))
      .y0(d => yScale(d.minValue))
      .y1(d => yScale(d.maxValue))
      .curve(d3.curveCatmullRom.alpha(0.5));
    
    chartG.append("path")
      .datum(defaultData)
      .attr("class", "range-area")
      .attr("fill", "rgba(66, 133, 244, 0.2)")
      .attr("d", area);
  }
  
  // Add line
  chartG.append("path")
    .datum(defaultData)
    .attr("class", "line")
    .attr("fill", "none")
    .attr("stroke", "#4285F4")
    .attr("stroke-width", 2)
    .attr("d", line);
  
  // Add time marker
  chartG.append("line")
    .attr("class", "time-marker")
    .attr("y1", 0)
    .attr("y2", height)
    .attr("x1", xScale(startTime))
    .attr("x2", xScale(startTime))
    .attr("stroke", "rgba(0, 0, 0, 0.6)")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4,4");
  
  // Add axes
  const xAxis = d3.axisBottom(xScale)
    .tickSizeOuter(0)
    .tickPadding(10);
  
  const yAxis = d3.axisLeft(yScale)
    .tickSizeOuter(0)
    .tickPadding(10);
  
  // X-axis
  svg.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);
  
  // X-axis label
  svg.append("text")
    .attr("class", "x-label")
    .attr("x", width / 2)
    .attr("y", height + 40)
    .attr("text-anchor", "middle")
    .text("Time (seconds)");
  
  // Y-axis
  svg.append("g")
    .attr("class", "y-axis")
    .call(yAxis);
  
  // Y-axis label
  svg.append("text")
    .attr("class", "y-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -45)
    .attr("text-anchor", "middle")
    .text("Heart Rate (BPM)");
  
  // Generate data-driven annotations
  const annotations = generateDataDrivenAnnotations(defaultData, [startTime, endTime]);
  
  // Add annotation markers
  const annotationGroup = svg.append("g")
    .attr("class", "annotations");
  
  annotationGroup.selectAll("circle")
    .data(annotations)
      .enter()
    .append("circle")
    .attr("cx", d => xScale(d.time))
    .attr("cy", d => {
      // Position based on the value at that time
      const index = Math.floor(d.time / (endTime - startTime) * defaultData.length);
      const point = defaultData[Math.min(Math.max(0, index), defaultData.length - 1)];
      return yScale(point.value);
    })
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
        <div class="tooltip-content">
          <div class="tooltip-header">${d.type}</div>
          <div class="tooltip-text">${d.label}</div>
          <div class="tooltip-text">Time: ${d.time.toFixed(1)}s</div>
        </div>
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
  
  // Update scrubber
  d3.select("#scrubber")
    .attr("min", startTime)
    .attr("max", endTime)
    .attr("step", (endTime - startTime) / 1000)
    .property("value", startTime)
    .on("input", function() {
      currentTime = +this.value;
      updatePlayback();
    });
  
  // Add legend with improved positioning and styling
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - 120}, 20)`);
    
  // Add background rectangle for better visibility
  legend.append("rect")
    .attr("width", 100)
    .attr("height", 80)
    .attr("fill", "rgba(255, 255, 255, 0.9)")
    .attr("rx", 5)
    .attr("ry", 5)
    .attr("stroke", "#ddd")
    .attr("stroke-width", 1);
    
  // Legend title
  legend.append("text")
    .attr("x", 50)
    .attr("y", 15)
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .style("font-size", "10px")
    .text("Legend");
  
  // Raw data
  legend.append("line")
    .attr("x1", 10)
    .attr("y1", 30)
    .attr("x2", 30)
    .attr("y2", 30)
    .attr("stroke", colors.mainLine || "#4285F4")
    .attr("stroke-width", 2.5);
  
  legend.append("text")
    .attr("x", 35)
    .attr("y", 33)
    .text("Heart Rate")
    .style("font-size", "10px");
  
  // Store global settings
  currentTime = startTime;
  
  console.log("Default visualization created");
}

// Legacy loading method (fallback)
function loadData() {
  showLoadingOverlay("Initializing data...");
  
  // Initialize the data API first
  initializeWithDataAPI()
    .then(() => {
      console.log("Data API initialized, now loading case hierarchy");
      // Load case hierarchy after data API is initialized
      return loadCaseHierarchy();
  })
  .catch(error => {
      console.error("Error during initialization:", error);
    hideLoadingOverlay();
      showErrorMessage("Failed to initialize data. Please try refreshing the page.");
  });
}

// ----------------------------------------------------------
// 3) UPDATE CASE USING DATA API
// ----------------------------------------------------------
function updateCaseWithDataAPI(caseId) {
  console.log("updateCaseWithDataAPI called with caseId:", caseId);
  
  if (!caseId) {
    console.warn("Invalid case ID, using default visualization instead");
    showDefaultVisualization();
    return;
  }
  
  if (playing) {
    playing = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  // Show loading indicator
  showLoadingOverlay('Loading case data...');

  // Try to update the case selection UI to show which case we're loading
  try {
    const caseSelector = document.getElementById('caseSelector');
    if (caseSelector) {
      for (let i = 0; i < caseSelector.options.length; i++) {
        if (caseSelector.options[i].value == caseId) {
          caseSelector.selectedIndex = i;
          break;
        }
      }
    }
  } catch (e) {
    console.error("Error updating case selector UI:", e);
  }

  // Load tracks for this case
  window.dataAPI.getTracksForCase(caseId)
    .then(tracks => {
      console.log("Tracks loaded:", tracks ? tracks.length : 0);
      
      // Check if we got valid tracks back
      if (!tracks || tracks.length === 0) {
        console.warn("No tracks found for case:", caseId);
        showInfoMessage("No tracks found for the selected case. Showing default visualization.");
        hideLoadingOverlay();
        showDefaultVisualization();
        return;
      }
      
      // Update track dropdown
      let trackSelector = d3.select("#trackSelector");
      trackSelector.selectAll("option").remove();
      trackSelector.selectAll("option")
        .data(tracks)
        .enter()
        .append("option")
        .attr("value", d => d.tid)
        .text(d => d.tname || `Track ${d.tid}`);

      // On track change
      trackSelector.on("change", function() {
        if (playing) {
          playing = false;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
        updateChartWithDataAPI(this.value);
      });

      // If we have at least one track, update the chart
      if (tracks.length > 0) {
        trackSelector.property("value", tracks[0].tid);
        updateChartWithDataAPI(tracks[0].tid);
      } else {
        showInfoMessage("No track data available for this case. Showing default visualization.");
        hideLoadingOverlay();
        showDefaultVisualization();
      }

      // Load labs in the background
      window.dataAPI.getLabsForCase(caseId)
        .then(labs => {
          // Update labs table
          updateLabTable(labs);
        })
        .catch(error => {
          console.error("Error loading lab data:", error);
          hideLoadingOverlay();
        });
    })
    .catch(error => {
      console.error("Error loading tracks for case:", error);
      showErrorMessage(`Error loading tracks: ${error.message}`);
      hideLoadingOverlay();
      showDefaultVisualization();
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
  console.log("updateChartWithDataAPI called with tid:", tid);
  
  if (!tid || tid === 'undefined') {
    console.warn("Invalid track ID, using default visualization instead");
    showDefaultVisualization();
    return;
  }
  
  if (playing) {
    playing = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  currentTime = 0;
  anomalies = []; // Reset anomalies

  // Remove any existing chart
  d3.select("#chart").select("svg").remove();
  
  // Show loading indicator
  showLoadingOverlay('Loading chart data...');

  try {
  // Set up main SVG with responsive sizing
  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add title with improved styling
  svg.append("text")
    .attr("class", "chart-title")
    .attr("x", width / 2)
      .attr("y", -margin.top / 2 + 5) // Adjust position slightly
    .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .text("Patient Biosignal Monitoring");
      
    // Add track name as subtitle if available
    const trackName = d3.select("#trackSelector option:checked").text();
    if (trackName) {
      svg.append("text")
        .attr("class", "chart-subtitle")
        .attr("x", width / 2)
        .attr("y", -margin.top / 2 + 30) // Position below main title
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .text(trackName);
    }

  // Add clip path
  svg.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

    // Add background grid placeholder - actual grid will be added after scales are defined
    const gridG = svg.append("g")
      .attr("class", "grid-lines");

  const chartG = svg.append("g")
    .attr("clip-path", "url(#clip)");

  // Get an initial time range estimate
  const startTime = 0;
  const endTime = 1000; // Initial estimate, will be refined

  // Fetch signal data with optimized loading
  window.dataAPI.getSignalData(tid, startTime, endTime)
    .then(data => {
        try {
          // Check if data is valid - if not, fall back to default visualization
          if (!data || !Array.isArray(data) || data.length === 0) {
            console.warn("No data received for track, showing default visualization");
            hideLoadingOverlay();
            showDefaultVisualization();
            return;
          }
          
      // Store globally for reference
      window.currentTrackData = data;

      // Compute domain with a bit of padding
      const timeExtent = d3.extent(data, d => d.time);
          
          // If we have min/max values in our dataset, use them for more accurate visualization
          let valueMin, valueMax;
          if ('minValue' in data[0] && 'maxValue' in data[0]) {
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
          
          // Now add the grid lines with the defined scales
          gridG.selectAll("*").remove(); // Clear any existing grid
          
          // Add X grid lines
          gridG.append("g")
            .attr("class", "grid x-grid")
        .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xScale)
              .tickSize(-height)
              .tickFormat("")
            );

          // Add Y grid lines
          gridG.append("g")
            .attr("class", "grid y-grid")
        .call(d3.axisLeft(yScale)
          .tickSize(-width)
          .tickFormat("")
            );
          
          // Check if we're dealing with a large dataset
          const isLargeDataset = data.length > 1000;

          // Create line generator with smoothing
      const line = d3.line()
        .x(d => xScale(d.time))
        .y(d => yScale(d.value))
            .curve(d3.curveCatmullRom.alpha(0.5)); // smoother curve

          // Add the line path - with proper rendering strategy based on dataset size
          if (isLargeDataset && 'minValue' in data[0] && 'maxValue' in data[0]) {
            // For large datasets, add a range area to show data variation
            const area = d3.area()
              .x(d => xScale(d.time))
              .y0(d => yScale(d.minValue))
              .y1(d => yScale(d.maxValue))
              .curve(d3.curveCatmullRom.alpha(0.5));
              
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
              .attr("stroke-width", 2)
        .attr("d", line);
          } else {
            // Standard line rendering for smaller datasets
            chartG.append("path")
              .datum(data)
              .attr("class", "line")
              .attr("fill", "none")
              .attr("stroke", "#4285F4")
              .attr("stroke-width", 2)
              .attr("d", line);
          }

          // Add a vertical line to visualize current time
          chartG.append("line")
            .attr("class", "time-marker")
            .attr("y1", 0)
            .attr("y2", height)
            .attr("x1", xScale(timeExtent[0]))
            .attr("x2", xScale(timeExtent[0]))
            .attr("stroke", "rgba(0, 0, 0, 0.6)")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "4,4");

          // Add axes with improved styling
          const xAxis = d3.axisBottom(xScale)
            .tickSizeOuter(0)
            .tickPadding(10);
            
          const yAxis = d3.axisLeft(yScale)
            .tickSizeOuter(0)
            .tickPadding(10);

          // X-axis
          svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis);

          // X-axis label
          svg.append("text")
            .attr("class", "x-label")
            .attr("x", width / 2)
            .attr("y", height + 40)
            .attr("text-anchor", "middle")
            .text("Time (seconds)");

          // Y-axis
          svg.append("g")
            .attr("class", "y-axis")
            .call(yAxis);

          // Y-axis label
          svg.append("text")
            .attr("class", "y-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -45)
            .attr("text-anchor", "middle")
            .text("Value");

      // Compute moving averages
          try {
      computeMovingAverages(data);
          } catch (error) {
            console.error("Error computing moving averages:", error);
          }
      
          // Add 1-minute moving average line if we have computed values
          if (data.some(d => d.ma1min !== undefined)) {
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
              
            // Store reference
            window.ma1Path = ma1Path;
            // Initially hide
            ma1Path.style("display", "none");
          }
          
          // Add 5-minute moving average line if we have computed values
          if (data.some(d => d.ma5min !== undefined)) {
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
              
            // Store reference
            window.ma5Path = ma5Path;
            // Initially hide
            ma5Path.style("display", "none");
          }
          
          // Add event handler for the moving average dropdown if not already added
      d3.select("#MAdropdownMenu").on("change", function() {
        const value = this.value;
            if (window.ma1Path) window.ma1Path.style("display", value === "1min" || value === "both" ? "block" : "none");
            if (window.ma5Path) window.ma5Path.style("display", value === "5min" || value === "both" ? "block" : "none");
          });
          
          // Generate data-driven annotations
          const annotations = generateDataDrivenAnnotations(data, timeExtent);
          
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
        .attr("cy", d => {
          // Calculate a proper y position based on the data value at that time
          const closestPoint = data.reduce((prev, curr) => {
            return Math.abs(curr.time - d.time) < Math.abs(prev.time - d.time) ? curr : prev;
          });
          return yScale(closestPoint.value);
        })
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
                <div class="tooltip-content">
                  <div class="tooltip-header">${d.type}</div>
                  <div class="tooltip-text">${d.label}</div>
                  <div class="tooltip-text">Time: ${d.time.toFixed(1)}s</div>
                </div>
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

      // Update the scrubber slider range
      d3.select("#scrubber")
        .attr("min", timeExtent[0])
        .attr("max", timeExtent[1])
        .attr("step", (timeExtent[1] - timeExtent[0]) / 1000)
            .property("value", timeExtent[0])
        .on("input", function() {
          currentTime = +this.value;
          updatePlayback();
        });
        
      // Add legend
      const legend = svg.append("g")
        .attr("class", "legend")
            .attr("transform", `translate(${width - 120}, 20)`);
            
          // Add background rectangle for better visibility
          legend.append("rect")
            .attr("width", 100)
            .attr("height", 80)
            .attr("fill", "rgba(255, 255, 255, 0.9)")
            .attr("rx", 5)
            .attr("ry", 5)
            .attr("stroke", "#ddd")
            .attr("stroke-width", 1);
            
          // Legend title
          legend.append("text")
            .attr("x", 50)
            .attr("y", 15)
            .attr("text-anchor", "middle")
            .attr("font-weight", "bold")
            .style("font-size", "10px")
            .text("Legend");
        
      // Raw data
      legend.append("line")
            .attr("x1", 10)
            .attr("y1", 30)
            .attr("x2", 30)
            .attr("y2", 30)
            .attr("stroke", colors.mainLine || "#4285F4")
        .attr("stroke-width", 2.5);
        
      legend.append("text")
            .attr("x", 35)
            .attr("y", 33)
        .text("Raw Data")
        .style("font-size", "10px");
        
      // 1-min MA
      legend.append("line")
            .attr("x1", 10)
            .attr("y1", 50)
            .attr("x2", 30)
            .attr("y2", 50)
            .attr("stroke", colors.movingAvg1 || "#FF9800")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
        
      legend.append("text")
            .attr("x", 35)
            .attr("y", 53)
        .text("1-min MA")
        .style("font-size", "10px");
        
      // 5-min MA
      legend.append("line")
            .attr("x1", 10)
            .attr("y1", 70)
            .attr("x2", 30)
            .attr("y2", 70)
            .attr("stroke", colors.movingAvg5 || "#4CAF50")
        .attr("stroke-width", 2)
            .attr("stroke-dasharray", "1,3");
        
      legend.append("text")
            .attr("x", 35)
            .attr("y", 73)
        .text("5-min MA")
        .style("font-size", "10px");
        
      // Update the overview timeline
      if (typeof drawOverview === "function") {
            try {
        drawOverview();
            } catch (err) {
              console.error("Error drawing overview:", err);
            }
      }
          
          // Initialize current time
          currentTime = timeExtent[0];
      
      // Hide loading indicator
      hideLoadingOverlay();
        } catch (innerError) {
          console.error("Error processing chart data:", innerError);
          hideLoadingOverlay();
          showErrorMessage(`Error processing chart data: ${innerError.message}`);
          // Fall back to default visualization
          showDefaultVisualization();
        }
    })
    .catch(error => {
      console.error("Error loading signal data:", error);
      hideLoadingOverlay();
        showErrorMessage(`Error loading signal data: ${error.message}`);
        // Fall back to default visualization
        showDefaultVisualization();
      });
  } catch (error) {
    console.error("Error creating chart:", error);
    hideLoadingOverlay();
    showErrorMessage(`Error creating chart: ${error.message}`);
    // Fall back to default visualization
    showDefaultVisualization();
  }
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

// Enhanced loading overlay function
function showLoadingOverlay(message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  
  if (!overlay) {
    // Create loading overlay if it doesn't exist
    const newOverlay = document.createElement('div');
    newOverlay.id = 'loadingOverlay';
    
    newOverlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading</div>
      <div class="loading-message">${message}</div>
    `;
    
    document.body.appendChild(newOverlay);
    
    // Force reflow/repaint before adding visible class
    newOverlay.offsetHeight;
    newOverlay.classList.add('visible');
  } else {
    // Update existing overlay
    const messageEl = overlay.querySelector('.loading-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
    overlay.classList.add('visible');
  }
}

// Hide loading overlay with fade effect
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
    
    // Remove from DOM after animation completes
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300); // Match the CSS transition time
  }
}

// Enhanced error message display
function showErrorMessage(message) {
  // Create error message element
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.innerHTML = `
    <h3><i class="fas fa-exclamation-circle"></i> Error</h3>
    <p>${message}</p>
    <button onclick="location.reload()">Retry</button>
  `;
  
  // Show in chart area
  const chartEl = document.getElementById('chart');
  if (chartEl) {
    chartEl.innerHTML = '';
    chartEl.appendChild(errorElement);
  } else {
    // As fallback, append to body
    document.body.appendChild(errorElement);
  }
}

// Show info message
function showInfoMessage(message, targetElement = 'chart') {
  const infoElement = document.createElement('div');
  infoElement.className = 'info-message';
  infoElement.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
  
  const targetEl = document.getElementById(targetElement);
  if (targetEl) {
    targetEl.innerHTML = '';
    targetEl.appendChild(infoElement);
  }
}

// Show no data message
function showNoDataMessage(title, message, targetElement = 'chart') {
  const noDataElement = document.createElement('div');
  noDataElement.className = 'no-data-message';
  noDataElement.innerHTML = `
    <i class="fas fa-chart-area"></i>
    <h3>${title}</h3>
    <p>${message}</p>
  `;
  
  const targetEl = document.getElementById(targetElement);
  if (targetEl) {
    targetEl.innerHTML = '';
    targetEl.appendChild(noDataElement);
  }
}

function updateCase(caseId) {
  // This function redirects to updateCaseWithDataAPI to fix the "updateCase is not defined" error
  updateCaseWithDataAPI(caseId);
}

// Load case hierarchy data
async function loadCaseHierarchy() {
    // This function needs to ensure that:
    // 1. We properly display loading states
    // 2. We try multiple sources for the case hierarchy file
    // 3. We fall back gracefully with proper error handling
    // 4. We update the UI appropriately

    try {
        console.log("Loading case hierarchy...");
        
        // Show loading indicator for case categories
        document.getElementById('operationCategory').innerHTML = '<option value="">Loading categories...</option>';
        document.getElementById('complexityLevel').innerHTML = '<option value="">Select Level</option>';
        document.getElementById('complexityLevel').disabled = true;
        document.getElementById('caseSelector').innerHTML = '<option value="">Select Case</option>';
        document.getElementById('caseSelector').disabled = true;
        
        showLoadingOverlay("Loading case categories...");
        
        // Fetch the case hierarchy
        let caseHierarchy = {};
        let loaded = false;
        
        // First try loading from root directory
        try {
            console.log("Trying to load case hierarchy from root directory");
            const response = await fetch('./case_hierarchy.json');
            if (response.ok) {
                const data = await response.json();
                caseHierarchy = data;
                loaded = true;
                console.log("Loaded case hierarchy from root directory");
            } else {
                console.warn("Failed to load case hierarchy from root, trying processed directory");
            }
        } catch (rootError) {
            console.warn("Error loading from root:", rootError);
        }
        
        // If that fails, try loading from the processed directory
        if (!loaded) {
            try {
                console.log("Trying to load case hierarchy from processed directory");
                const response = await fetch('./data/processed/case_hierarchy.json');
                if (response.ok) {
                    const data = await response.json();
                    caseHierarchy = data;
                    loaded = true;
                    console.log("Loaded case hierarchy from processed directory");
                } else {
                    console.warn("Failed to load case hierarchy from processed directory");
                }
            } catch (processedError) {
                console.warn("Error loading from processed directory:", processedError);
            }
        }
        
        // If still not loaded, try loading from the data directory directly
        if (!loaded) {
            try {
                console.log("Trying to load case hierarchy from data directory");
                const response = await fetch('./data/case_hierarchy.json');
                if (response.ok) {
                    const data = await response.json();
                    caseHierarchy = data;
                    loaded = true;
                    console.log("Loaded case hierarchy from data directory");
                } else {
                    console.warn("Failed to load case hierarchy from data directory");
                }
            } catch (dataError) {
                console.warn("Error loading from data directory:", dataError);
            }
        }
        
        // If still not loaded, use a default hierarchy
        if (!loaded) {
            console.warn("Using default case hierarchy");
            caseHierarchy = {
                "general": {
                    "Low": ["1", "2", "3", "4", "5"],
                    "Medium": ["6", "7", "8", "9", "10"],
                    "High": ["11", "12", "13", "14", "15"]
                },
                "cardiac": {
                    "Low": ["16", "17", "18", "19", "20"],
                    "Medium": ["21", "22", "23", "24", "25"],
                    "High": ["26", "27", "28", "29", "30"]
                },
                "thoracic": {
                    "Low": ["31", "32", "33", "34", "35"],
                    "Medium": ["36", "37", "38", "39", "40"],
                    "High": ["41", "42", "43", "44", "45"]
                }
            };
            loaded = true;
        }
        
        // Ensure we have valid data
        if (!loaded || Object.keys(caseHierarchy).length === 0) {
            throw new Error("Failed to load or create case hierarchy");
        }
        
        // Store the case hierarchy in the window scope
        window.caseHierarchy = caseHierarchy;
        console.log("Case hierarchy stored in window scope:", window.caseHierarchy);
        
        // Reset and populate operation categories
        const categorySelect = document.getElementById('operationCategory');
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        
        // Get sorted operation types - capitalize first letter of each word
        const operationTypes = Object.keys(caseHierarchy).sort().map(category => {
            return {
                value: category,
                label: category
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')
            };
        });
        
        console.log(`Found ${operationTypes.length} operation types`);
        
        // Add each operation type as an option
        operationTypes.forEach(category => {
            const option = document.createElement('option');
            option.value = category.value;
            option.textContent = category.label;
            categorySelect.appendChild(option);
        });
        
        // Enable the category select
        categorySelect.disabled = false;
        
        // Remove any existing event listeners to prevent duplicates
        categorySelect.removeEventListener('change', updateComplexityOptions);
        document.getElementById('complexityLevel').removeEventListener('change', updateCaseOptions);
        
        // Add event listeners
        categorySelect.addEventListener('change', updateComplexityOptions);
        document.getElementById('complexityLevel').addEventListener('change', updateCaseOptions);
        
        console.log("Case hierarchy loaded successfully with", operationTypes.length, "operation types");
        
        hideLoadingOverlay();
        
        return caseHierarchy;
    } catch (error) {
        console.error('Error loading case hierarchy:', error);
        document.getElementById('operationCategory').innerHTML = 
            '<option value="">Error loading categories</option>';
        hideLoadingOverlay();
        showErrorMessage("Failed to load operation categories. Loading default data.");
        loadDefaultCaseFromDataset();
        return null;
    }
}

// Update complexity options based on selected category
function updateComplexityOptions() {
    const category = document.getElementById('operationCategory').value;
    const complexitySelect = document.getElementById('complexityLevel');
    const caseSelect = document.getElementById('caseSelector');
    
    console.log("Updating complexity options for category:", category);
    
    // Reset case selector
    caseSelect.innerHTML = '<option value="">Select Case</option>';
    caseSelect.disabled = true;
    
    // Check if caseHierarchy exists
    if (!window.caseHierarchy) {
        console.error("Case hierarchy not found");
        complexitySelect.innerHTML = '<option value="">Error: No data available</option>';
        complexitySelect.disabled = true;
        return;
    }
    
    if (!category || !window.caseHierarchy[category]) {
        console.log("No category selected or no data for category");
        complexitySelect.innerHTML = '<option value="">Select Level</option>';
        complexitySelect.disabled = true;
        return;
    }
    
    // Get available complexity levels for this category
    const availableLevels = Object.keys(window.caseHierarchy[category]);
    console.log("Available complexity levels:", availableLevels);
    
    // Reset and populate complexity options
    complexitySelect.innerHTML = '<option value="">Select Level</option>';
    availableLevels.forEach(level => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = level;
        complexitySelect.appendChild(option);
    });
    
    complexitySelect.disabled = false;
    
    // Auto-select first level if only one is available
    if (availableLevels.length === 1) {
        complexitySelect.value = availableLevels[0];
        complexitySelect.dispatchEvent(new Event('change'));
    }
}

// Update case options based on selected category and complexity
function updateCaseOptions() {
    const category = document.getElementById('operationCategory').value;
    const complexity = document.getElementById('complexityLevel').value;
    const caseSelect = document.getElementById('caseSelector');
    
    console.log("Updating case options for category:", category, "complexity:", complexity);
    
    // Reset case selector
    caseSelect.innerHTML = '<option value="">Select Case</option>';
    
    if (!category || !complexity) {
        caseSelect.disabled = true;
        console.log("No category or complexity selected");
        return;
    }
    
    // Make sure caseHierarchy is available
    if (!window.caseHierarchy) {
        console.error("Case hierarchy not found. Loading default visualization.");
        loadDefaultCaseFromDataset();
        return;
    }
    
    // Get cases for selected category and complexity
    if (!window.caseHierarchy[category] || !window.caseHierarchy[category][complexity]) {
        console.warn(`No cases found for ${category} - ${complexity}`);
        caseSelect.innerHTML = '<option value="">No cases available</option>';
        caseSelect.disabled = true;
        return;
    }
    
    const cases = window.caseHierarchy[category][complexity];
    
    if (!cases || cases.length === 0) {
        console.warn(`Empty case list for ${category} - ${complexity}`);
        caseSelect.innerHTML = '<option value="">No cases available</option>';
        caseSelect.disabled = true;
        return;
    }
    
    console.log(`Found ${cases.length} cases for ${category} - ${complexity}`);
    
    // Show loading state
    caseSelect.innerHTML = '<option value="">Loading cases...</option>';
    caseSelect.disabled = true;
    
    // Load case details and add options for each case
    Promise.resolve()
        .then(() => {
            // Try to fetch from processed directory first
            return fetch('./data/processed/cases_processed.txt')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to load from processed directory');
                    }
                    return response.text();
                })
                .catch(() => {
                    // If that fails, try the regular directory
                    console.log("Trying to load from regular cases.txt");
                    return fetch('./data/cases.txt')
                        .then(response => {
                            if (!response.ok) {
                                throw new Error('Failed to load from regular directory');
                            }
                            return response.text();
                        });
                });
        })
        .then(text => {
            const lines = text.split('\n');
            const headers = lines[0].split(',');
            const caseidIndex = headers.indexOf('caseid');
            const opnameIndex = headers.indexOf('opname');
            
            // Reset case selector for actual options
            caseSelect.innerHTML = '<option value="">Select Case</option>';
            let addedOptions = 0;
            
            // Add options for matching cases
            cases.forEach(caseId => {
                // Find the case data
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',');
                    if (values.length <= caseidIndex) continue;
                    
                    if (values[caseidIndex] === caseId) {
                        const option = document.createElement('option');
                        option.value = caseId;
                        
                        // Display case ID and operation name if available
                        let label = `Case ${caseId}`;
                        if (opnameIndex >= 0 && values.length > opnameIndex && values[opnameIndex]) {
                            const opname = values[opnameIndex].trim();
                            if (opname.length > 30) {
                                label += `: ${opname.substring(0, 30)}...`;
                            } else {
                                label += `: ${opname}`;
                            }
                        }
                        
                        option.textContent = label;
                        caseSelect.appendChild(option);
                        addedOptions++;
                        break;
                    }
                }
            });
            
            console.log(`Added ${addedOptions} case options to selector`);
            
            // If no options were added but we have case IDs, add them directly
            if (addedOptions === 0 && cases.length > 0) {
                console.log("No matching cases found in case details file, adding just the IDs");
                cases.forEach(caseId => {
                    const option = document.createElement('option');
                    option.value = caseId;
                    option.textContent = `Case ${caseId}`;
                    caseSelect.appendChild(option);
                    addedOptions++;
                });
            }
            
            // Enable/disable the selector based on whether we have options
            if (addedOptions === 0) {
                caseSelect.innerHTML = '<option value="">No cases available</option>';
                caseSelect.disabled = true;
            } else {
                caseSelect.disabled = false;
                
                // Auto-select first case if only one is available
                if (addedOptions === 1) {
                    caseSelect.selectedIndex = 1;
                    const event = new Event('change');
                    caseSelect.dispatchEvent(event);
                }
            }
        })
        .catch(error => {
            console.error('Error loading case details:', error);
            
            // Even if we can't load case details, still add the case IDs directly
            if (cases.length > 0) {
                console.log("Adding case IDs without details due to error");
                caseSelect.innerHTML = '<option value="">Select Case</option>';
                cases.forEach(caseId => {
                    const option = document.createElement('option');
                    option.value = caseId;
                    option.textContent = `Case ${caseId}`;
                    caseSelect.appendChild(option);
                });
                
                caseSelect.disabled = false;
            } else {
                caseSelect.innerHTML = '<option value="">Error loading cases</option>';
                caseSelect.disabled = true;
            }
        });
}

// Event handler for case selection
function onCaseSelectChange(event) {
  console.log("Case selection changed:", event.target.value);
  
  // Show loading indicator while we process
  showLoadingOverlay("Loading selected case...");
  
  const caseId = parseInt(event.target.value, 10);
  if (!caseId || isNaN(caseId)) {
    console.warn("Invalid case ID selected:", event.target.value);
    hideLoadingOverlay();
    showDefaultVisualization();
    return;
  }
  
  try {
    console.log("Selected case ID:", caseId);
    
    // Highlight selected case in dropdown
    const caseSelect = document.getElementById('caseSelector');
    if (caseSelect) {
      for (let i = 0; i < caseSelect.options.length; i++) {
        if (parseInt(caseSelect.options[i].value, 10) === caseId) {
          caseSelect.selectedIndex = i;
          break;
        }
      }
    }
    
    // Load the selected case
    updateCaseWithDataAPI(caseId);
  } catch (error) {
    console.error("Error updating case:", error);
    hideLoadingOverlay();
    showErrorMessage("Failed to update case. Using default visualization instead.");
    showDefaultVisualization();
  }
}

// Generate data-driven annotations based on actual data points
function generateDataDrivenAnnotations(data, timeExtent) {
  // If no data, return empty annotations
  if (!data || data.length === 0) {
    return [];
  }
  
  const annotations = [];
  const timeRange = timeExtent[1] - timeExtent[0];
  
  // Find min, max, and significant changes in the data
  const valueExtent = d3.extent(data, d => d.value);
  const valueRange = valueExtent[1] - valueExtent[0];
  
  // Find the maximum point
  const maxPoint = data.reduce((max, point) => point.value > max.value ? point : max, data[0]);
  annotations.push({
    time: maxPoint.time,
    type: "Peak",
    label: `Maximum Value: ${maxPoint.value.toFixed(1)}`,
    critical: true,
    baseColor: "#F44336" // Red
  });
  
  // Find the minimum point
  const minPoint = data.reduce((min, point) => point.value < min.value ? point : min, data[0]);
  // Only add if significantly different from max
  if (Math.abs(minPoint.value - maxPoint.value) > valueRange * 0.3) {
    annotations.push({
      time: minPoint.time,
      type: "Low",
      label: `Minimum Value: ${minPoint.value.toFixed(1)}`,
      critical: false,
      baseColor: "#2196F3" // Blue
    });
  }
  
  // Find significant changes (large slopes)
  const derivatives = [];
  for (let i = 5; i < data.length - 5; i += 5) {
    const slope = (data[i + 5].value - data[i - 5].value) / (data[i + 5].time - data[i - 5].time);
    derivatives.push({ time: data[i].time, slope: slope, value: data[i].value });
  }
  
  // Find the point with the maximum positive change
  if (derivatives.length > 0) {
    const maxRise = derivatives.reduce((max, point) => point.slope > max.slope ? point : max, derivatives[0]);
    if (maxRise.slope > valueRange / timeRange * 50) { // Significant rise
      annotations.push({
        time: maxRise.time,
        type: "Rapid Increase",
        label: `Rising Trend: ${maxRise.slope.toFixed(2)} units/s`,
        critical: true,
        baseColor: "#4CAF50" // Green
      });
    }
    
    // Find the point with the maximum negative change
    const maxFall = derivatives.reduce((min, point) => point.slope < min.slope ? point : min, derivatives[0]);
    if (maxFall.slope < -valueRange / timeRange * 50) { // Significant fall
      annotations.push({
        time: maxFall.time,
        type: "Rapid Decrease",
        label: `Falling Trend: ${maxFall.slope.toFixed(2)} units/s`,
        critical: true,
        baseColor: "#FF9800" // Orange
      });
    }
  }
  
  // If we have less than 2 annotations, add some at interesting points
  if (annotations.length < 2) {
    // Add a point at 1/3 of the time range
    const thirdPointIndex = Math.floor(data.length / 3);
    if (thirdPointIndex < data.length) {
      annotations.push({
        time: data[thirdPointIndex].time,
        type: "Event",
        label: "Monitoring Point",
        critical: false,
        baseColor: "#9C27B0" // Purple
      });
    }
    
    // Add a point at 2/3 of the time range if needed
    if (annotations.length < 2) {
      const twoThirdsPointIndex = Math.floor(2 * data.length / 3);
      if (twoThirdsPointIndex < data.length) {
        annotations.push({
          time: data[twoThirdsPointIndex].time,
          type: "Event",
          label: "Monitoring Point",
          critical: false,
          baseColor: "#9C27B0" // Purple
        });
      }
    }
  }
  
  // Ensure annotations are not too close to each other (at least 10% of time range apart)
  const minTimeDiff = timeRange * 0.1;
  return annotations.filter((ann, index) => {
    for (let i = 0; i < index; i++) {
      if (Math.abs(ann.time - annotations[i].time) < minTimeDiff) {
        return false;
      }
    }
    return true;
  });
}
