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

let currentTransform = d3.zoomIdentity;

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
    window.location.href = `index.html?caseId=${caseId}&time=${centerTime}#dashboard-view`;
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
    .then((response) => response.text())
    .then((csvText) => {
      const tracks = d3.csvParse(csvText);

      // Filter down to signals that we want
      const biosignalsForCase = tracks
        .filter((track) => track.tname && track.tname.includes("/"))
        .slice(0, 8) // limit for demo
        .map((track, index) => ({
          tid: track.tid,
          name: track.tname,
          checked: index === 0, // Only the first signal checked by default
          color: colors[`signal${index + 1}`] || "#999"
        }));

      selectedSignals = biosignalsForCase.filter(s => s.checked);
      createBiosignalCheckboxes(biosignalsForCase, startTime, endTime, centerTime);
    })
    .catch((error) => {
      console.error("Error fetching track list:", error);

      // Fallback example signals with simpler IDs that work better with demo data
      const fallbackSignals = [
        { tid: "signal1", name: "Heart Rate", checked: true, color: colors.signal1 },
        { tid: "signal2", name: "Blood Pressure", checked: false, color: colors.signal2 },
        { tid: "signal3", name: "Oxygen Saturation", checked: false, color: colors.signal3 },
        { tid: "signal4", name: "Respiration Rate", checked: false, color: colors.signal4 },
        { tid: "signal5", name: "Temperature", checked: false, color: colors.signal5 },
        { tid: "signal6", name: "EEG", checked: false, color: colors.signal6 }
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
  
  // Add a header to clarify purpose
  const header = document.createElement("div");
  header.className = "signal-header";
  header.innerHTML = "Toggle biosignals to compare different measurements";
  container.appendChild(header);

  signals.forEach((signal, index) => {
    const checkboxId = `signal-${index}`;
    
    // Create checkbox container
    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "signal-checkbox-container";
    
    // Highlight the container if selected
    if (signal.checked) {
      checkboxContainer.classList.add("selected");
    }
    
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

    colorSwatch.addEventListener("click", function(e) {
      e.preventDefault();
      checkbox.click();
    });
    
    // Create label with signal name and improve formatting
    const label = document.createElement("label");
    label.htmlFor = checkboxId;
    label.className = "signal-label";
    
    // Format signal name to be more readable
    let displayName = signal.name;
    if (displayName.includes("/")) {
      const parts = displayName.split("/");
      displayName = parts[parts.length - 1];
      // Add the category as a prefix in smaller text if available
      if (parts.length > 1 && parts[0]) {
        displayName = `<span class="signal-category">${parts[0]}:</span> ${displayName}`;
      }
    }
    
    label.innerHTML = displayName;
    
    // Add elements to container
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(colorSwatch);
    checkboxContainer.appendChild(label);
    container.appendChild(checkboxContainer);

    // Set up event listener
    checkbox.addEventListener("change", function () {
      // Update container highlighting
      if (this.checked) {
        checkboxContainer.classList.add("selected");
        const selectedSignal = signals.find(s => s.tid === this.dataset.tid);
        selectedSignals.push(selectedSignal);
      } else {
        checkboxContainer.classList.remove("selected");
        selectedSignals = selectedSignals.filter(s => s.tid !== this.dataset.tid);
      }
      
      // Refresh the chart with our selection
      refreshChart(startTime, endTime, centerTime, currentTransform);
    });
  });

  // Fetch data for all siginals and draw chart for selectedSignals
  // const promises = selectedSignals.map(signal => fetchSignalData(signal.tid, startTime, endTime));
  const promises = signals.map(signal => fetchSignalData(signal.tid, startTime, endTime));
  
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
function refreshChart(startTime, endTime, centerTime, preservedTransform) {
  // Clear existing chart
  d3.select("#detailedChartArea").selectAll("*").remove();
  
  // Set dimensions for the chart
  const margin = { top: 25, right: 60, bottom: 50, left: 60 };
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
  const chartContainer = g.append("g")
  .attr("clip-path", "url(#clip)");

// Create the zoomable chart area INSIDE the clipped container.
const chartArea = chartContainer.append("g")
  .attr("class", "chart-area");
  
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
  
  // Check if we have any valid values
  if (allValues.length === 0) {
    console.warn("No valid values found for Y-scale calculation, using defaults");
    // Add some default values to prevent errors
    allValues = [0, 10, 20, 30, 40, 50];
  }
  
  // Calculate extent of values with padding
  const valueExtent = d3.extent(allValues);
  const valuePadding = (valueExtent[1] - valueExtent[0]) * 0.1;
  
  // Ensure we have a non-zero range to prevent flat lines
  let yMin = valueExtent[0] - valuePadding;
  let yMax = valueExtent[1] + valuePadding;
  
  // If range is too small, enforce a minimum range
  const minRange = 10; // Minimum range to prevent flat lines
  if (yMax - yMin < minRange) {
    const center = (yMin + yMax) / 2;
    yMin = center - minRange / 2;
    yMax = center + minRange / 2;
  }
  
  console.log(`Y scale range: ${yMin} to ${yMax}`);
  
  // Create y scale
  detailedYScale = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([height, 0])
    .nice();
  
  // Create axes
  const xAxis = d3.axisBottom(detailedXScale)
    .ticks(10)
    .tickFormat(d => d + "s");
  
  const yAxis = d3.axisLeft(detailedYScale)
    .ticks(8);
  
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

  // 在创建完 x、y 轴后添加 grid（在同一个 g 内，这样它们会随 zoom 一起更新）
    g.append("g")
      .attr("class", "x-grid")
      .attr("transform", `translate(0, ${height})`)
      .call(
        d3.axisBottom(detailedXScale)
          .ticks(10)
          .tickSize(-height)
          .tickFormat("")
      ).call(g => g.select(".domain").remove())  // 移除底部黑色轴线
      .call(g => g.selectAll(".tick line")
        .attr("stroke", "#eee")
        .attr("stroke-dasharray", "3,3"));

  g.append("g")
  .attr("class", "y-grid")
  .call(
    d3.axisLeft(detailedYScale)
      .ticks(8)
      .tickSize(-width)
      .tickFormat("")
  )
  .call(g => g.select(".domain").remove())
  .call(g => g.selectAll(".tick line")
    .attr("stroke", "#eee")
    .attr("stroke-dasharray", "3,3"));

  
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

    // 先在 g 里面创建一个静态层，放置不受缩放影响的元素
  const staticLayer = g.append("g")
  .attr("class", "static-layer");

  // 添加中心时间线到静态层，而不是 chartArea
  staticLayer.append("line")
  .attr("class", "center-time-line")
  .attr("x1", detailedXScale(centerTime))
  .attr("x2", detailedXScale(centerTime))
  .attr("y1", 0)
  .attr("y2", height)
  .attr("stroke", colors.timeMarker)
  .attr("stroke-width", 2)
  .attr("stroke-dasharray", "5,5");

  
  // Create a line generator
  const line = d3.line()
    .x(d => detailedXScale(d.time))
    .y(d => detailedYScale(d.value))
    .defined(d => !isNaN(d.value) && d.value !== null && d.value !== undefined)
    .curve(d3.curveMonotoneX);
  
  // Add lines for each selected signal
  selectedSignals.forEach(signal => {
    if (loadedData[signal.tid] && loadedData[signal.tid].length > 0) {
      // Log some diagnostic information
      console.log(`Drawing signal ${signal.name} with ${loadedData[signal.tid].length} points`);
      console.log(`First few values:`, loadedData[signal.tid].slice(0, 5).map(d => d.value));
      
      // Filter out invalid data points
      const validData = loadedData[signal.tid].filter(d => 
        !isNaN(d.value) && d.value !== null && d.value !== undefined
      );
      
      if (validData.length === 0) {
        console.warn(`No valid data points for signal ${signal.name}`);
        return;
      }
      
      const clipId = "clip-signal-" + signal.tid;
    let defs = detailedChartSvg.select("defs");
    if (defs.empty()) {
      defs = detailedChartSvg.append("defs");
    }
    // 如果之前已经存在同样 id 的 clipPath，先移除它
    defs.select("#" + clipId).remove();
    defs.append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("width", 0)        // 初始宽度为 0，动画时逐渐增大
      .attr("height", height); // 高度与图表区域一致

    // 绘制信号路径，保持原有的样式（例如实线或 dash 样式不变）
    const path = chartArea.append("path")
      .datum(validData)
      .attr("class", "signal-line")
      .attr("fill", "none")
      .attr("stroke", signal.color)
      .attr("stroke-width", 2)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("d", line)
      .attr("clip-path", `url(#${clipId})`);
    
    // 动画 clipPath 的矩形宽度，从 0 增加到完整宽度，从而逐步“揭示”路径
    d3.select(`#${clipId} rect`)
      .transition()
      .duration(1000)
      .ease(d3.easeLinear)
      .attr("width", width);
  }
});
  // Add simulation data if available
  if (simulatedData.length > 0) {
    // 创建一个 clipPath，用于限制虚线显示区域
    const clipId = "clip-sim";
    // 确保 defs 已经存在，否则先创建
    let defs = detailedChartSvg.select("defs");
    if (defs.empty()) {
      defs = detailedChartSvg.append("defs");
    }
    
    // 定义 clipPath，初始宽度为 0，高度为图表高度
    defs.append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("width", 0)
      .attr("height", height);
      
    // 绘制虚线路径，附加 clipPath
    const simPath = chartArea.append("path")
      .datum(simulatedData)
      .attr("class", "simulation-line")
      .attr("fill", "none")
      .attr("stroke", colors.simulation)
      .attr("stroke-width", 2.5)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke-dasharray", "5,5")
      .attr("clip-path", `url(#${clipId})`)
      .attr("d", line);
      
    // 动画 clipPath 的 rect 宽度，从 0 到图表宽度，
    // 实现 dash 虚线从左到右显示的效果
    d3.select(`#${clipId} rect`)
      .transition()
      .duration(1000)
      .ease(d3.easeLinear)
      .attr("width", width);
  }
  
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
      // 获取相对于 g 的鼠标坐标（g 是不变换的容器）
      const [xPos] = d3.pointer(event, g.node());
      
      // 获取当前 zoom 变换，并构造新的 x 轴比例尺
      const transform = d3.zoomTransform(chartArea.node());
      const newXScale = transform.rescaleX(detailedXScale);
      
      // 根据新的比例尺反演得到数据时间
      const time = newXScale.invert(xPos);
      
      // 更新 tooltip 的位置和内容（略）
      tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
      
      let html = `<strong>Time: ${time.toFixed(1)}s</strong><br/>`;
      let foundData = false;
      selectedSignals.forEach(signal => {
        if (loadedData[signal.tid]) {
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
      }
      
      // 移除之前的 tracking line，并在静态层中添加新的 tracking line
      staticLayer.select(".tracking-line").remove();
      staticLayer.append("line")
        .attr("class", "tracking-line")
        .attr("x1", newXScale(time))
        .attr("x2", newXScale(time))
        .attr("y1", 0)
        .attr("y2", height)  // 固定为原始图表高度
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    })
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
      staticLayer.select(".tracking-line").remove();
    });

  
  // Add zooming behavior
  // 在 zoom 回调中
  zoom = d3.zoom()
    .filter(function(event) {
      return event.target.closest('.overlay') || event.target.closest('.chart-area');
    })
    .scaleExtent([1, 10])
    .extent([[0, 0], [width, height]])
    .on("zoom", function(event) {
      let t = event.transform;
      currentTransform = t; // 保存当前变换
      const k = t.k;
      
      if (!event.sourceEvent) {
        const currentT = d3.zoomTransform(chartArea.node());
        const visibleCenterX = currentT.rescaleX(detailedXScale).invert(width / 2);
        const visibleCenterY = currentT.rescaleY(detailedYScale).invert(height / 2);
        t = d3.zoomIdentity
              .translate(width/2 - k * detailedXScale(visibleCenterX),
                        height/2 - k * detailedYScale(visibleCenterY))
              .scale(k);
      }
      
      // 限制平移范围
      const minTx = width - k * width;
      const maxTx = 0;
      const tx = Math.max(Math.min(t.x, maxTx), minTx);
      const minTy = height - k * height;
      const maxTy = 0;
      const ty = Math.max(Math.min(t.y, maxTy), minTy);
      
      t = d3.zoomIdentity.translate(tx, ty).scale(k);
      
      // 应用变换
      chartArea.attr("transform", t);
      
      // 更新轴和网格……
      const newXScale = t.rescaleX(detailedXScale);
      g.select(".x-axis").call(xAxis.scale(newXScale));
      const newYScale = t.rescaleY(detailedYScale);
      g.select(".y-axis").call(yAxis.scale(newYScale));
      
      staticLayer.select(".center-time-line")
        .attr("x1", newXScale(centerTime))
        .attr("x2", newXScale(centerTime));
      
      // 同时更新网格（如之前代码）
      g.select(".x-grid")
        .call(
          d3.axisBottom(newXScale)
            .ticks(10)
            .tickSize(-height)
            .tickFormat("")
        )
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line")
          .attr("stroke", "#eee")
          .attr("stroke-dasharray", "3,3"));
      
      g.select(".y-grid")
        .call(
          d3.axisLeft(newYScale)
            .ticks(8)
            .tickSize(-width)
            .tickFormat("")
        )
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line")
          .attr("stroke", "#eee")
          .attr("stroke-dasharray", "3,3"));
      
      // chartArea.selectAll(".simulation-line")
      //   .attr("stroke-dasharray", (5 / t.k) + ", " + (5 / t.k));
    });

    if (preservedTransform) {
      detailedChartSvg.call(zoom.transform, preservedTransform);
    } else {
      detailedChartSvg.call(zoom);
    }
  
  // Add zoom controls
  detailedChartSvg.call(zoom);
  
  // Add zoom buttons
  const zoomControls = g.append("g")
    .attr("class", "zoom-controls")
    .attr("transform", `translate(${width - 100}, 10)`);
  
  // Zoom in button
  // Zoom in 按钮
  const zoomInButton = zoomControls.append("g")
    .attr("class", "zoom-button zoom-in")
    .on("click", () => {
      detailedChartSvg.transition().duration(300).call(zoom.scaleBy, 1.5);
    });

  zoomInButton.append("rect")
    .attr("x", 0)
    .attr("y", -20)
    .attr("width", 30)
    .attr("height", 30)
    .attr("rx", 5)
    .attr("fill", "#f0f0f0")
    .attr("stroke", "#ccc");

  zoomInButton.append("text")
    .attr("x", 15)
    .attr("y", 0)
    .attr("text-anchor", "middle")
    .text("+")
    .style("font-size", "20px")
    .style("user-select", "none");

  // Zoom out 按钮
  const zoomOutButton = zoomControls.append("g")
    .attr("class", "zoom-button zoom-out")
    .on("click", () => {
      detailedChartSvg.transition().duration(300).call(zoom.scaleBy, 0.67);
    });

  zoomOutButton.append("rect")
    .attr("x", 40)
    .attr("y", -20)
    .attr("width", 30)
    .attr("height", 30)
    .attr("rx", 5)
    .attr("fill", "#f0f0f0")
    .attr("stroke", "#ccc");

  zoomOutButton.append("text")
    .attr("x", 55)
    .attr("y", 0)
    .attr("text-anchor", "middle")
    .text("-")
    .style("font-size", "20px")
    .style("user-select", "none");

  // Reset zoom 按钮
  const resetButton = zoomControls.append("g")
    .attr("class", "zoom-button zoom-reset")
    .on("click", () => {
      detailedChartSvg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    });

  resetButton.append("rect")
    .attr("x", 80)
    .attr("y", -20)
    .attr("width", 30)
    .attr("height", 30)
    .attr("rx", 5)
    .attr("fill", "#f0f0f0")
    .attr("stroke", "#ccc");

  resetButton.append("text")
    .attr("x", 95)
    .attr("y", 0)
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

  if (selectedSignals.length !== 1) {
    d3.select(".crisis-right-panel").selectAll(":not(.simulation-only-hint)")
      .style("display", "none");
    d3.select(".crisis-right-panel").select(".simulation-only-hint")
      .style("display", "block");
    chartArea.selectAll(".simulation-line").remove();
  } else {
    d3.select(".crisis-right-panel").selectAll(":not(.simulation-only-hint)")
      .style("display", null);
    d3.select(".crisis-right-panel").select(".simulation-only-hint")
      .style("display", "none");
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

  //Evenly distribute leaf nodes horizontally
  const leafMargin = 25;  
  const effectiveWidth = width - 2 * leafMargin;  // available width for leaf nodes
  const leaves = root.leaves();
  const nLeaves = leaves.length;
  if (nLeaves > 1) {
    leaves.forEach((leaf, i) => {
      leaf.x = leafMargin + i * (effectiveWidth / (nLeaves - 1));
    });
  } else if (nLeaves === 1) {
    leaves[0].x = leafMargin + effectiveWidth / 2;
  }
  
  // Update internal nodes' x coordinate to be the average of their children
  root.eachAfter(node => {
    if (node.children) {
      node.x = d3.mean(node.children, d => d.x);
    }
  });
  
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
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
      chartArea.select(".tracking-line").remove();
    })
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
    
    // Create formatted HTML for the tooltip
    let html = `<div class="tooltip-content">`;
    html += `<div class="tooltip-header">${d.data.name}</div>`;
    
    if (d.data.type === "root") {
      html += `<div class="tooltip-text">Critical event detected at ${centerTime.toFixed(1)} seconds</div>`;
      html += `<div class="tooltip-tip">Explore intervention options by selecting an event type below</div>`;
    } else if (d.data.type === "event") {
      html += `<div class="tooltip-category">Event Type</div>`;
      html += `<div class="tooltip-text">${d.data.eventType.charAt(0).toUpperCase() + d.data.eventType.slice(1)}</div>`;
      html += `<div class="tooltip-tip">Select an intervention below to simulate outcomes</div>`;
    } else if (d.data.type === "intervention") {
      html += `<div class="tooltip-category">Treatment Strategy</div>`;
      html += `<div class="tooltip-text">${d.data.strategy}</div>`;
      
      html += `<div class="tooltip-category">Success Probability</div>`;
      // Create visual probability indicator
      const probWidth = Math.min(100, Math.max(0, d.data.probability));
      const probColor = probWidth > 80 ? "#4CAF50" : probWidth > 60 ? "#FFC107" : "#F44336";
      
      html += `<div class="tooltip-prob-container">
                <div class="tooltip-prob-value">${d.data.probability}%</div>
                <div class="tooltip-prob-bar" style="width:100px">
                  <div class="tooltip-prob-fill" style="width:${probWidth}px;background-color:${probColor}"></div>
                </div>
              </div>`;
              
      if (d.data.description) {
        html += `<div class="tooltip-category">Description</div>`;
        html += `<div class="tooltip-text">${d.data.description}</div>`;
      }
      
      html += `<div class="tooltip-tip">Click to simulate this intervention</div>`;
    } else if (d.data.type === "outcome") {
      html += `<div class="tooltip-text">${d.data.description}</div>`;
    }
    
    html += `</div>`;
    
    tooltip.html(html)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 28) + "px");
  }
}

// Generate tree data structure
function generateTreeData(centerTime) {
  // Create case-specific and signal-specific success probabilities
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = parseInt(urlParams.get("caseId")) || 1;
  
  // Generate probabilities that vary by case but are consistent for each case
  const caseVariation = (caseId * 17) % 100 / 100; // 0-1 range
  
  // Determine signal type for better contextual interventions
  let signalType = "unknown";
  let eventTypes = ["hypotension", "bradycardia"]; // default events
  
  if (selectedSignals.length > 0) {
    const signalName = selectedSignals[0].name.toLowerCase();
    
    if (signalName.includes("hr") || signalName.includes("heart")) {
      signalType = "heartrate";
      eventTypes = ["bradycardia", "tachycardia"];
    } else if (signalName.includes("bp") || signalName.includes("press")) {
      signalType = "bloodpressure";
      eventTypes = ["hypotension", "hypertension"];
    } else if (signalName.includes("o2") || signalName.includes("spo2") || signalName.includes("oxygen")) {
      signalType = "oxygen";
      eventTypes = ["hypoxemia", "desaturation"];
    } else if (signalName.includes("temp")) {
      signalType = "temperature";
      eventTypes = ["hypothermia", "hyperthermia"];
    } else if (signalName.includes("eeg") || signalName.includes("bis")) {
      signalType = "eeg";
      eventTypes = ["burst suppression", "awareness"];
    } else if (signalName.includes("resp")) {
      signalType = "respiration";
      eventTypes = ["hypoventilation", "apnea"];
    }
  }
  
  // Generate intervention success rates that vary by case and signal type
  const generateProbability = (baseProb, variation) => {
    // Calculate the raw probability value
    const rawValue = Math.round(baseProb + (variation - 0.5) * 30);
    // Cap the probability at 100% and ensure it's not below 0%
    return Math.min(100, Math.max(0, rawValue));
  };
  
  // Generate different interventions based on event type
  const getInterventionsForEvent = (eventType) => {
    switch (eventType) {
      case "bradycardia":
        return [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Atropine",
            probability: generateProbability(75, caseVariation),
            eventType: eventType,
            description: "Administer atropine to increase heart rate by blocking parasympathetic activity"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "Pacing",
            probability: generateProbability(90, 1 - caseVariation),
            eventType: eventType,
            description: "Apply transcutaneous pacing to directly stimulate cardiac contractions" 
          }
        ];
      case "tachycardia":
        return [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Beta Blockers",
            probability: generateProbability(82, caseVariation),
            eventType: eventType,
            description: "Administer beta blockers to slow heart rate by blocking sympathetic stimulation"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "Cardioversion",
            probability: generateProbability(88, 1 - caseVariation),
            eventType: eventType,
            description: "Apply synchronized electrical shock to reset heart rhythm"
          }
        ];
      case "hypotension":
        return [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Fluid Bolus",
            probability: generateProbability(70, caseVariation),
            eventType: eventType,
            description: "Administer IV fluids to increase blood volume and pressure"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "Vasopressors",
            probability: generateProbability(85, 1 - caseVariation),
            eventType: eventType,
            description: "Administer vasopressors to increase vascular tone and blood pressure"
          }
        ];
      case "hypertension":
        return [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Vasodilators",
            probability: generateProbability(80, caseVariation),
            eventType: eventType,
            description: "Administer vasodilators to reduce systemic vascular resistance"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "Beta Blockers",
            probability: generateProbability(75, 1 - caseVariation),
            eventType: eventType,
            description: "Administer beta blockers to reduce cardiac output and blood pressure"
          }
        ];
      case "hypoxemia":
      case "desaturation":
        return [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Increase FiO2",
            probability: generateProbability(85, caseVariation),
            eventType: eventType,
            description: "Increase fraction of inspired oxygen to improve oxygenation"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "PEEP Adjustment",
            probability: generateProbability(78, 1 - caseVariation),
            eventType: eventType,
            description: "Increase positive end-expiratory pressure to recruit alveoli"
          }
        ];
      default:
        return [
          {
            name: "Intervention A",
            type: "intervention",
            strategy: "Conservative Approach",
            probability: generateProbability(75, caseVariation),
            eventType: eventType,
            description: "Apply standard treatment protocol with minimal invasiveness"
          },
          {
            name: "Intervention B",
            type: "intervention",
            strategy: "Aggressive Approach",
            probability: generateProbability(85, 1 - caseVariation),
            eventType: eventType,
            description: "Apply intensive intervention with potential for faster response"
          }
        ];
    }
  };
  
  // Create the tree structure
  return {
    name: "Crisis at " + centerTime.toFixed(1) + "s",
    type: "root",
    children: eventTypes.map(eventType => ({
      name: eventType.charAt(0).toUpperCase() + eventType.slice(1),
      type: "event",
      eventType: eventType,
      children: getInterventionsForEvent(eventType)
    }))
  };
}

// Handle intervention A choice
function chooseInterventionA(eventType) {
  // Generate simulation data for intervention A
  simulatedData = buildSimulatedData(d3.select("#paramSlider").property("value"));
  // Refresh chart with simulation data
  const preservedTransform = currentTransform;
  refreshChart(detailedXScale.domain()[0], detailedXScale.domain()[1], (detailedXScale.domain()[0] + detailedXScale.domain()[1]) / 2,
  preservedTransform);
}

// Handle intervention B choice
function chooseInterventionB(eventType) {
  // Use a different model for intervention B
  const paramValue = d3.select("#paramSlider").property("value");
  simulatedData = buildSimulatedData(paramValue, true);
  // Refresh chart with simulation data
  const preservedTransform = currentTransform;
  refreshChart(detailedXScale.domain()[0], detailedXScale.domain()[1], (detailedXScale.domain()[0] + detailedXScale.domain()[1]) / 2,
             preservedTransform);
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
    
    // 保持当前 zoom 变换
    const preservedTransform = currentTransform;  // 或者：d3.zoomTransform(detailedChartSvg.node())
    
    // 刷新图表，并传入 preservedTransform（修改 refreshChart 函数以支持可选 transform 参数）
    refreshChart(detailedXScale.domain()[0], detailedXScale.domain()[1], (detailedXScale.domain()[0] + detailedXScale.domain()[1]) / 2, preservedTransform);
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
  let signalType = "unknown";
  
  if (selectedSignals.length > 0 && loadedData[selectedSignals[0].tid]) {
    referenceData = loadedData[selectedSignals[0].tid];
    // Try to determine signal type from name to customize simulation behavior
    const signalName = selectedSignals[0].name.toLowerCase();
    if (signalName.includes("hr") || signalName.includes("heart")) {
      signalType = "heartrate";
    } else if (signalName.includes("bp") || signalName.includes("press")) {
      signalType = "bloodpressure";
    } else if (signalName.includes("o2") || signalName.includes("spo2") || signalName.includes("oxygen")) {
      signalType = "oxygen";
    } else if (signalName.includes("temp")) {
      signalType = "temperature";
    } else if (signalName.includes("eeg") || signalName.includes("bis")) {
      signalType = "eeg";
    } else if (signalName.includes("resp")) {
      signalType = "respiration";
    }
  } else {
    // If no reference data, return empty array
    return [];
  }
  
  console.log(`Building simulation for signal type: ${signalType}`);
  
  // Get case ID for case-specific variations
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = parseInt(urlParams.get("caseId")) || 1;
  
  // Generate a reproducible random factor based on case ID
  const caseRandomFactor = ((caseId * 17) % 100) / 100; // 0-1 range
  
  // Find the average value before center time
  const preValues = referenceData.filter(d => d.time < centerTime).map(d => d.value);
  const preAvg = preValues.length > 0 ? d3.mean(preValues) : 0;
  
  // Calculate standard deviation to model natural variability
  const stdDev = preValues.length > 0 ? 
    Math.sqrt(d3.sum(preValues, d => Math.pow(d - preAvg, 2)) / preValues.length) : 1;
  
  // Get min and max values to keep simulated data within reasonable bounds
  const minValue = d3.min(referenceData, d => d.value);
  const maxValue = d3.max(referenceData, d => d.value);
  const valueRange = maxValue - minValue;
  
  // Treatment efficacy modifiers by signal type (some conditions respond differently)
  const efficacyByType = {
    heartrate: { a: 0.8 + caseRandomFactor * 0.4, b: 1.2 - caseRandomFactor * 0.3 },
    bloodpressure: { a: 0.6 + caseRandomFactor * 0.3, b: 1.3 - caseRandomFactor * 0.2 },
    oxygen: { a: 1.0 + caseRandomFactor * 0.5, b: 0.7 + caseRandomFactor * 0.4 },
    temperature: { a: 0.4 + caseRandomFactor * 0.2, b: 0.9 + caseRandomFactor * 0.3 },
    eeg: { a: 0.7 + caseRandomFactor * 0.6, b: 0.8 + caseRandomFactor * 0.5 },
    respiration: { a: 0.9 + caseRandomFactor * 0.3, b: 1.1 - caseRandomFactor * 0.4 },
    unknown: { a: 0.8 + caseRandomFactor * 0.4, b: 0.9 + caseRandomFactor * 0.2 }
  };
  
  // Get the right efficacy modifiers
  const efficacy = efficacyByType[signalType];
  
  // Target values that each intervention is trying to reach
  // Some interventions aim to raise the value, others to lower it
  const getTargetValue = () => {
    switch (signalType) {
      case "heartrate":
        // Move heart rate toward normal range (60-100)
        return preAvg > 100 ? 80 - caseRandomFactor * 15 : 
               preAvg < 60 ? 70 + caseRandomFactor * 15 : preAvg;
      case "bloodpressure":
        // Usually try to lower blood pressure if high
        return preAvg > 140 ? preAvg * (0.7 + caseRandomFactor * 0.2) : 
               preAvg < 90 ? preAvg * (1.1 + caseRandomFactor * 0.2) : preAvg;
      case "oxygen":
        // Always try to increase oxygen levels toward 100%
        return Math.min(98 + caseRandomFactor * 2, 100);
      case "temperature":
        // Move temperature toward normal (36.5-37.5°C)
        return 37 + (caseRandomFactor - 0.5);
      default:
        // Generic case - move halfway back to pre-crisis average
        return preAvg;
    }
  };
  
  const targetValue = getTargetValue();
  
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
      // After intervention: simulate based on parameter and intervention type
      // Time since intervention (normalized to 0-1 range for the remaining time)
      const timeRemaining = domain[1] - centerTime;
      const elapsed = (time - centerTime) / timeRemaining;
      
      // Parameter effect (0-1 range)
      const paramEffect = param / 100;
      
      // Current difference from target
      const currentDiff = targetValue - closestPoint.value;
      
      // Add some variability based on the original data's standard deviation
      const variability = (Math.random() - 0.5) * stdDev * 0.5;
      
      // Different models for different interventions
      if (isInterventionB) {
        // Intervention B: quick response then plateau with potential relapse
        const responseSpeed = 3 + caseRandomFactor * 3; // How quickly it responds
        const effectMagnitude = paramEffect * efficacy.b;
        const baseResponse = 1 - Math.exp(-elapsed * responseSpeed);
        
        // Add potential relapse for some cases (based on case and parameter)
        const relapseEffect = caseRandomFactor > 0.7 && paramEffect < 0.7 ? 
          Math.max(0, (elapsed - 0.6) * 2) * 0.4 : 0;
        
        value = closestPoint.value + currentDiff * baseResponse * effectMagnitude * (1 - relapseEffect) + variability;
      } else {
        // Intervention A: gradual improvement with consistent trajectory
        const effectMagnitude = paramEffect * efficacy.a;
        const baseResponse = Math.pow(elapsed, 0.7); // Slightly faster initial response
        
        // Add some oscillation for more realistic response
        const oscillation = Math.sin(elapsed * 10) * stdDev * 0.1 * (1 - elapsed);
        
        value = closestPoint.value + currentDiff * baseResponse * effectMagnitude + oscillation + variability;
      }
      
      // Ensure value stays within reasonable bounds (within 150% of observed range)
      const safeBoundary = valueRange * 1.5;
      value = Math.max(minValue - safeBoundary, Math.min(maxValue + safeBoundary, value));
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
  
  // Create a more consistent hash from the track ID that always produces a number
  const getNumericValue = (str, index, mod) => {
    // If tid is not a string or is empty, use a default value
    if (typeof str !== 'string' || !str) {
      return (index % mod) + 1;
    }
    
    // Convert the character at position (index % string length) to a number
    const charCode = str.charCodeAt(index % str.length);
    return (charCode % mod) + 1;
  };

  // Base waveform parameters - different for each signal
  const baseFreq = getNumericValue(tid, 0, 9) * 0.1 + 0.1; // 0.1-1.0 Hz
  const amplitude = getNumericValue(tid, 1, 20) + 10; // 10-30 amplitude
  const trend = (getNumericValue(tid, 2, 3) - 2); // -1, 0, or 1
  
  // Crisis event at 40% of the time range
  const crisisPoint = startTime + (endTime - startTime) * 0.4;
  const recoveryPoint = startTime + (endTime - startTime) * 0.7;
  
  // Add secondary oscillation for more complex waveforms
  const secondaryFreq = getNumericValue(tid, 3, 5) * 0.5; // 0.5-3.0 Hz
  const secondaryAmp = amplitude * 0.3; // 30% of main amplitude
  
  for (let i = 0; i < dataPoints; i++) {
    const time = startTime + i * timeStep;
    
    // Base sinusoidal signal with more complex waveform
    let value = amplitude * Math.sin(2 * Math.PI * baseFreq * i / 50);
    
    // Add secondary oscillation
    value += secondaryAmp * Math.sin(2 * Math.PI * secondaryFreq * i / 10);
    
    // Add trend
    value += trend * (i / dataPoints) * 20;
    
    // Add crisis event - sudden change followed by recovery
    if (time >= crisisPoint && time < recoveryPoint) {
      // How far into the crisis (0-1)
      const crisisProgress = (time - crisisPoint) / (recoveryPoint - crisisPoint);
      
      // Make the crisis more dramatic
      if (crisisProgress < 0.1) {
        // Initial sharp change
        value += amplitude * 1.2 * (crisisProgress / 0.1);
      } else if (crisisProgress < 0.4) {
        // Sustained crisis with additional oscillation
        value += amplitude * 1.2 + (Math.sin(crisisProgress * 50) * amplitude * 0.2);
      } else {
        // Recovery with some instability
        value += amplitude * 1.2 * (1 - (crisisProgress - 0.4) / 0.6);
        value += (Math.sin(crisisProgress * 30) * amplitude * 0.15);
      }
    }
    
    // Add noise (more pronounced)
    value += (Math.random() - 0.5) * amplitude * 0.3;
    
    // Ensure value has sufficient variation
    result.push({
      time: time,
      value: value,
      // Include min/max values for consistency with data_api.js
      minValue: value - Math.random() * amplitude * 0.15,
      maxValue: value + Math.random() * amplitude * 0.15
    });
  }
  
  return result;
}
