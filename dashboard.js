// Global dimensions and margins for the chart
const margin = { top: 20, right: 30, bottom: 50, left: 50 },
  width = 800 - margin.left - margin.right,
  height = 400 - margin.top - margin.bottom;

// Global playback variables
let currentTime = 0;
let playing = false;
let playbackSpeed = 1;
let timer = null;

// Global variables to hold current chart elements
let currentXScale,
  currentYScale,
  currentTimeMarker,
  currentAnnotationGroup,
  currentXDomain;

// Global data holders for external files
let casesData, labsData, trksData;

// Append a tooltip (for interactive feedback)
const tooltip = d3.select("body").append("div").attr("class", "tooltip");

// --- Global Playback Functions --- //

function updatePlayback() {
  // Update scrubber slider position
  d3.select("#scrubber").property("value", currentTime);

  // Move the vertical time marker if available
  if (currentXScale && currentTimeMarker) {
    const xPos = currentXScale(currentTime);
    currentTimeMarker.attr("x1", xPos).attr("x2", xPos);
  }

  // Update annotation marker colors if the event time is passed
  if (currentAnnotationGroup) {
    currentAnnotationGroup
      .selectAll("circle")
      .attr("fill", (d) => (currentTime >= d.time ? "#f6b26b" : d.baseColor));
    // #f6b26b is a light orange shade to indicate it's "passed"
    // or you could do something like fill = "gray" once passed
  }
}

function stepPlayback() {
  // Increment time based on playback speed
  // Increased increment for more noticeable movement
  currentTime += 3 * playbackSpeed;

  // Check if we've reached the end of the timeline
  if (currentXDomain && currentTime >= currentXDomain[1]) {
    currentTime = currentXDomain[1];
    pausePlayback();
    return;
  }

  // Update the visualization
  updatePlayback();
}

function playPlayback() {
  console.log("Play button clicked"); // Debug logging

  // Only start playing if not already playing
  if (!playing) {
    playing = true;

    // Reset the timer to ensure clean playback
    if (timer) {
      timer.stop();
    }

    // Create a new timer that calls stepPlayback every 100ms
    timer = d3.interval(stepPlayback, 100);

    // Update button state
    d3.select("#play").classed("active", true);
    d3.select("#pause").classed("active", false);

    console.log("Playback started, timer created"); // Debug logging
  }
}

function pausePlayback() {
  console.log("Pause button clicked"); // Debug logging

  if (playing) {
    playing = false;

    // Stop the timer
    if (timer) {
      timer.stop();
      timer = null; // Ensure timer is fully cleared
    }

    // Update button state
    d3.select("#play").classed("active", false);
    d3.select("#pause").classed("active", true);

    console.log("Playback paused, timer stopped"); // Debug logging
  }
}

function rewindPlayback() {
  // Jump back 5 seconds
  currentTime = Math.max(
    currentXDomain ? currentXDomain[0] : 0,
    currentTime - 5
  );
  updatePlayback();

  // If already playing, ensure smooth continuation
  if (playing) {
    if (timer) {
      timer.stop();
    }
    timer = d3.interval(stepPlayback, 100);
  }
}

function fastForwardPlayback() {
  // Jump forward 5 seconds
  currentTime = Math.min(
    currentXDomain ? currentXDomain[1] : 100,
    currentTime + 5
  );
  updatePlayback();

  // If already playing, ensure smooth continuation
  if (playing) {
    if (timer) {
      timer.stop();
    }
    timer = d3.interval(stepPlayback, 100);
  }
}

// Ensure DOM is loaded before binding events
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded, binding playback controls"); // Debug logging

  // Global event bindings for playback controls
  document.getElementById("play").addEventListener("click", playPlayback);
  document.getElementById("pause").addEventListener("click", pausePlayback);
  document.getElementById("rewind").addEventListener("click", rewindPlayback);
  document
    .getElementById("fastForward")
    .addEventListener("click", fastForwardPlayback);

  document.getElementById("scrubber").addEventListener("input", function () {
    currentTime = +this.value;
    updatePlayback();
  });

  document.getElementById("speed").addEventListener("change", function () {
    playbackSpeed = +this.value;

    // If currently playing, restart the timer with the new speed
    if (playing) {
      if (timer) {
        timer.stop();
      }
      timer = d3.interval(stepPlayback, 100);
    }
  });

  // Load external data files
  loadData();
});

// --- Load external data files --- //
function loadData() {
  console.log("Loading data files"); // Debug logging

  d3.csv("data/cases.txt", d3.autoType)
    .then(function (cases) {
      console.log("Cases data loaded:", cases.length, "records"); // Debug logging
      casesData = cases;
      // Populate case selector
      let caseSelector = d3.select("#caseSelector");
      caseSelector
        .selectAll("option")
        .data(cases)
        .enter()
        .append("option")
        .attr("value", (d) => d.caseid)
        .text((d) => `Case ${d.caseid}: ${d.opname}`);

      // Listen for case selection change
      caseSelector.on("change", function () {
        let selectedCaseId = +this.value;
        updateCase(selectedCaseId);
      });

      // Automatically select the first case if available
      if (cases.length > 0) {
        caseSelector.property("value", cases[0].caseid);
        updateCase(cases[0].caseid);
      }
    })
    .catch((error) => {
      console.error("Error loading data/cases.txt:", error);
    });

  d3.csv("data/labs.txt", d3.autoType)
    .then(function (labs) {
      console.log("Labs data loaded:", labs.length, "records"); // Debug logging
      labsData = labs;
    })
    .catch((error) => {
      console.error("Error loading data/labs.txt:", error);
    });

  d3.csv("data/trks.txt", d3.autoType)
    .then(function (trks) {
      console.log("Tracks data loaded:", trks.length, "records"); // Debug logging
      trksData = trks;
    })
    .catch((error) => {
      console.error("Error loading data/trks.txt:", error);
    });
}

// --- Update UI when a new case is selected --- //
function updateCase(caseid) {
  console.log("Updating case:", caseid); // Debug logging

  // Reset playback when changing case
  if (playing) {
    pausePlayback();
  }

  // Filter tracks for the selected case
  let filteredTracks = trksData
    ? trksData.filter((d) => d.caseid === caseid)
    : [];
  let trackSelector = d3.select("#trackSelector");
  trackSelector.selectAll("option").remove();
  trackSelector
    .selectAll("option")
    .data(filteredTracks)
    .enter()
    .append("option")
    .attr("value", (d) => d.tid)
    .text((d) => d.tname);

  // Filter and display lab results for the selected case
  let filteredLabs = labsData
    ? labsData.filter((d) => d.caseid === caseid)
    : [];
  let labTable = d3.select("#labTable");
  labTable.html(""); // Clear previous lab results
  if (filteredLabs.length > 0) {
    let header = labTable.append("thead").append("tr");
    header.append("th").text("Date");
    header.append("th").text("Test Name");
    header.append("th").text("Result");
    let tbody = labTable.append("tbody");
    filteredLabs.forEach((lab) => {
      let row = tbody.append("tr");
      row.append("td").text(lab.dt);
      row.append("td").text(lab.name);
      row.append("td").text(lab.result);
    });
  } else {
    labTable
      .append("tr")
      .append("td")
      .attr("colspan", 3)
      .text("No lab results available.");
  }

  // If tracks exist, update the chart with the first available track
  if (filteredTracks.length > 0) {
    let firstTid = filteredTracks[0].tid;
    trackSelector.property("value", firstTid);
    updateChart(firstTid);
  } else {
    d3.select("#chart").html("No track data available for this case.");
  }
}

// Listen for track selection changes
document.addEventListener("DOMContentLoaded", function () {
  d3.select("#trackSelector").on("change", function () {
    // Reset playback when changing track
    if (playing) {
      pausePlayback();
    }

    let tid = this.value;
    updateChart(tid);
  });
});

// Update Chart
function updateChart(tid) {
  console.log("Updating chart for track:", tid);
  if (playing) pausePlayback();
  currentTime = 0;

  d3.select("#chart").select("svg").remove();

  const svgChart = d3
    .select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const chartG = svgChart
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const xNew = d3.scaleLinear().range([0, width]);
  const yNew = d3.scaleLinear().range([height, 0]);

  const trackURL = "https://api.vitaldb.net/" + tid;
  console.log("Loading track data from:", trackURL);

  d3.csv(trackURL, d3.autoType)
    .then((data) => {
      console.log("Track data loaded:", data.length, "points");
      data.forEach((d) => {
        d.time = +d.Time;
        let keys = Object.keys(d);
        let valueKey = keys.find((key) => key !== "Time");
        d.value = +d[valueKey];
      });
      data.sort((a, b) => a.time - b.time);

      window.currentTrackData = data; // expose globally

      const timeExtent = d3.extent(data, (d) => d.time);
      xNew.domain(timeExtent);
      const yExtent = d3.extent(data, (d) => d.value);
      yNew.domain([yExtent[0] - 10, yExtent[1] + 10]);

      currentXScale = xNew;
      currentYScale = yNew;
      currentXDomain = timeExtent;

      // X-axis
      chartG
        .append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(xNew));

      // Y-axis
      chartG.append("g").attr("class", "y-axis").call(d3.axisLeft(yNew));

      // Main line
      const line = d3
        .line()
        .x((d) => xNew(d.time))
        .y((d) => yNew(d.value));

      chartG
        .append("path")
        .datum(data)
        .attr("class", "line")
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", line);

      // MA1min line
      const movingAverageWindow1 = 60; // 1 minute in seconds
      data.forEach((d, i) => {
        const windowStart = d.time - movingAverageWindow1;
        const windowData = data.filter(
          (other_d) => other_d.time >= windowStart && other_d.time <= d.time
        );
        const sum = d3.sum(windowData, (other_d) => other_d.value);
        d.ma1min = sum / windowData.length;
      });

      const ma1min = d3
        .line()
        .x((d) => xNew(d.time))
        .y((d) => yNew(d.ma1min));

      chartG
        .append("path")
        .datum(data)
        .attr("class", "ma1min-line")
        .attr("fill", "none")
        .attr("stroke", "orange")
        .attr("stroke-width", 2)
        .attr("d", ma1min);

      // MA5min line
      const movingAverageWindow5 = 300; // 5 minute in seconds
      data.forEach((d, i) => {
        const windowStart = d.time - movingAverageWindow5;
        const windowData = data.filter(
          (other_d) => other_d.time >= windowStart && other_d.time <= d.time
        );
        const sum = d3.sum(windowData, (other_d) => other_d.value);
        d.ma5min = sum / windowData.length;
      });

      const ma5min = d3
        .line()
        .x((d) => xNew(d.time))
        .y((d) => yNew(d.ma5min));

      chartG
        .append("path")
        .datum(data)
        .attr("class", "ma5min-line")
        .attr("fill", "none")
        .attr("stroke", "red")
        .attr("stroke-width", 2)
        .attr("d", ma5min);

      // Legend
      const legend = svgChart.append("g").attr("class", "legend");

      legend
      .append("rect")
      .attr("x", width - 150)
      .attr("y", 10)
      .attr("width", 140)
      .attr("height", 30)
      .attr("fill", "white")
      .attr("stroke", "black");

      legend
        .append("line")
        .attr("x1", width - 140)
        .attr("y1", 20)
        .attr("x2", width - 120)
        .attr("y2", 20)
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2);

      legend
        .append("text")
        .attr("x", width - 110)
        .attr("y", 25)
        .text("Raw")
        .attr("alignment-baseline", "middle");



      // Dropdown menu for toggles

      document
        .getElementById("MAdropdownMenu")
        .addEventListener("change", function () {
          // Lines
            if (this.value === "1min") {
            d3.selectAll(".ma1min-line").style("display", null);
            d3.selectAll(".ma5min-line").style("display", "none");
            d3.selectAll(".line").style("opacity", 0.5);
            } else if (this.value === "5min") {
            d3.selectAll(".ma1min-line").style("display", "none");
            d3.selectAll(".ma5min-line").style("display", null);
            d3.selectAll(".line").style("opacity", 0.5);
            } else {
            d3.selectAll(".ma1min-line").style("display", "none");
            d3.selectAll(".ma5min-line").style("display", "none");
            d3.selectAll(".line").style("opacity", 1);
            }

          // Legends
          legend.selectAll("*").remove();

            let legendItems = [{ color: "steelblue", text: "Raw" }];
            if (this.value === "1min") {
            legendItems.push({ color: "orange", text: "MA1min" });
            }
            if (this.value === "5min") {
            legendItems.push({ color: "red", text: "MA5min" });
            }

          legend
            .append("rect")
            .attr("x", width - 150)
            .attr("y", 10)
            .attr("width", 140)
            .attr("height", legendItems.length * 20 + 10)
            .attr("fill", "white")
            .attr("stroke", "black");

          legendItems.forEach((item, index) => {
            legend
              .append("line")
              .attr("x1", width - 140)
              .attr("y1", 20 + index * 20)
              .attr("x2", width - 120)
              .attr("y2", 20 + index * 20)
              .attr("stroke", item.color)
              .attr("stroke-width", 2);

            legend
              .append("text")
              .attr("x", width - 110)
              .attr("y", 25 + index * 20)
              .text(item.text)
              .attr("alignment-baseline", "middle");
          });
        });

      // Initialize the toggle switch state
      document.getElementById("MAdropdownMenu").value = "none";
      d3.selectAll(".ma1min-line").style("display", "none");
      d3.selectAll(".ma5min-line").style("display", "none");
      legend
        .selectAll("text")
        .filter((d, i) => i === 1)
        .style("display", "none");
      legend
        .selectAll("line")
        .filter((d, i) => i === 1)
        .style("display", "none");

      // Time marker
      const timeMarkerNew = chartG
        .append("line")
        .attr("class", "time-marker")
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("y1", 0)
        .attr("y2", height)
        .attr("x1", xNew(timeExtent[0]))
        .attr("x2", xNew(timeExtent[0]));

      // Annotations
      const annotationGroupNew = chartG
        .append("g")
        .attr("class", "annotations");
      // sample events
      const annotations = [
        {
          time: timeExtent[0] + (timeExtent[1] - timeExtent[0]) * 0.2,
          label: "Phase Transition",
          type: "phase",
          baseColor: "orange",
        },
        {
          time: timeExtent[0] + (timeExtent[1] - timeExtent[0]) * 0.5,
          label: "Intervention",
          type: "intervention",
          baseColor: "purple",
        },
        {
          time: timeExtent[0] + (timeExtent[1] - timeExtent[0]) * 0.8,
          label: "Critical Event",
          type: "critical",
          baseColor: "red",
        },
      ];

      annotationGroupNew
        .selectAll("circle")
        .data(annotations)
        .enter()
        .append("circle")
        .attr("class", (d) => {
          if (d.type === "critical") return "critical-dot flash";
          else if (d.type === "intervention") return "intervention-dot";
          else return "phase-dot";
        })
        .attr("cx", (d) => xNew(d.time))
        .attr("cy", (d) => yNew(getValueAtTime(d.time, data)))
        .attr("r", 5)
        .attr("baseColor", (d) => d.baseColor)
        .on("mouseover", function (event, d) {
          d3.select(this).transition().duration(100).attr("r", 8);
          tooltip.transition().duration(50).style("opacity", 0.9);
          tooltip
            .html(`${d.label} at ${d.time.toFixed(1)} sec`)
            .style("left", event.pageX + 15 + "px")
            .style("top", event.pageY - 28 + "px");
        })
        .on("mouseout", function (event, d) {
          d3.select(this).transition().duration(100).attr("r", 5);
          tooltip.transition().duration(100).style("opacity", 0);
        })
        .on("click", function (event, d) {
          if (playing) pausePlayback();
          currentTime = d.time;
          updatePlayback();
        });

      annotationGroupNew
        .selectAll("text")
        .data(annotations)
        .enter()
        .append("text")
        .attr("x", (d) => xNew(d.time) + 10)
        .attr("y", (d) => yNew(getValueAtTime(d.time, data)) - 5)
        .text((d) => d.label)
        .attr("fill", "#333");

      currentTime = timeExtent[0];
      currentTimeMarker = timeMarkerNew;
      currentAnnotationGroup = annotationGroupNew;

      d3.select("#scrubber")
        .attr("min", currentXDomain[0])
        .attr("max", currentXDomain[1])
        .property("value", currentTime);

      updatePlayback();

      console.log("Chart setup complete, ready for playback");

      if (window.redrawOverview) {
        window.currentAnnotations = annotations;
        window.redrawOverview();
      }
    })
    .catch((error) => {
      console.error("Error loading track data:", error);
      d3.select("#chart").html(
        `<p>Error loading track data: ${error.message}</p>`
      );
    });
}

// Helper: Interpolate biosensor value at a given time from data
function getValueAtTime(t, data) {
  if (!data || data.length === 0) return 0;

  const bisect = d3.bisector((d) => d.time).left;
  const index = bisect(data, t);
  if (index === 0) return data[0].value;
  if (index >= data.length) return data[data.length - 1].value;

  const d0 = data[index - 1],
    d1 = data[index],
    ratio = (t - d0.time) / (d1.time - d0.time);
  return d0.value + ratio * (d1.value - d0.value);
}

function setMainChartDomain(timeRange) {
  if (!currentXScale || !currentYScale || !window.currentTrackData) {
    return;
  }
  currentXScale.domain(timeRange);

  // x-axis
  d3.select("#chart")
    .select(".x-axis")
    .transition()
    .duration(500)
    .call(d3.axisBottom(currentXScale));

  // line
  d3.select("#chart")
    .select("path.line")
    .datum(window.currentTrackData)
    .transition()
    .duration(500)
    .attr(
      "d",
      d3
        .line()
        .x((d) => currentXScale(d.time))
        .y((d) => currentYScale(d.value))
    );

  // annotations
  if (currentAnnotationGroup) {
    currentAnnotationGroup
      .selectAll("circle")
      .transition()
      .duration(500)
      .attr("cx", (d) => currentXScale(d.time))
      .attr("cy", (d) =>
        currentYScale(getValueAtTime(d.time, window.currentTrackData))
      );

    currentAnnotationGroup
      .selectAll("text")
      .transition()
      .duration(500)
      .attr("x", (d) => currentXScale(d.time) + 10)
      .attr(
        "y",
        (d) =>
          currentYScale(getValueAtTime(d.time, window.currentTrackData)) - 5
      );
  }

  // time marker
  currentTime = Math.max(timeRange[0], Math.min(timeRange[1], currentTime));
  if (currentTimeMarker) {
    currentTimeMarker
      .transition()
      .duration(500)
      .attr("x1", currentXScale(currentTime))
      .attr("x2", currentXScale(currentTime));
  }
}
