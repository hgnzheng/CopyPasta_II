document.addEventListener("DOMContentLoaded", () => {
    const miniMargin = { top: 10, right: 20, bottom: 20, left: 40 },
          miniWidth = 800 - miniMargin.left - miniMargin.right,
          miniHeight = 100 - miniMargin.top - miniMargin.bottom;
  
    const svgMini = d3.select("#overview")
      .append("svg")
      .attr("width", miniWidth + miniMargin.left + miniMargin.right)
      .attr("height", miniHeight + miniMargin.top + miniMargin.bottom)
      .append("g")
      .attr("transform", `translate(${miniMargin.left}, ${miniMargin.top})`);
  
    const xMini = d3.scaleLinear().range([0, miniWidth]);
    const yMini = d3.scaleLinear().range([miniHeight, 0]);
  
    let brush = null;
  
    function drawOverview() {
      if (!window.currentTrackData || window.currentTrackData.length === 0) {
        console.warn("No track data for overview timeline");
        return;
      }
  
      const data = window.currentTrackData;
      svgMini.selectAll("*").remove();
  
      const timeExtent = d3.extent(data, d => d.time);
      xMini.domain(timeExtent);
      const valueExtent = d3.extent(data, d => d.value);
      yMini.domain(valueExtent);
  
      const lineMini = d3.line()
        .x(d => xMini(d.time))
        .y(d => yMini(d.value));
  
      svgMini.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .attr("d", lineMini);
  
      svgMini.append("g")
        .attr("transform", `translate(0, ${miniHeight})`)
        .call(d3.axisBottom(xMini).ticks(4));
  
      const events = window.currentAnnotations || [];
  
      svgMini.selectAll(".mini-event-line")
        .data(events)
        .enter()
        .append("line")
        .attr("class", "mini-event-line")
        .attr("x1", d => xMini(d.time))
        .attr("x2", d => xMini(d.time))
        .attr("y1", 0)
        .attr("y2", miniHeight)
        .attr("stroke", d => d.baseColor || "red")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2")
        .on("click", function(event, d) {
          if (typeof setMainChartDomain === "function") {
            const halfWindow = 20;
            const newDomain = [ d.time - halfWindow, d.time + halfWindow ];
            setMainChartDomain(newDomain);
          }
        })
        .on("mouseover", function() {
          d3.select(this).attr("stroke-width", 2);
        })
        .on("mouseout", function() {
          d3.select(this).attr("stroke-width", 1);
        });
  
      svgMini.selectAll(".mini-event-label")
        .data(events)
        .enter()
        .append("text")
        .attr("class", "mini-event-label")
        .attr("x", d => xMini(d.time) + 2)
        .attr("y", 10)                   
        .text(d => d.label)
        .attr("font-size", "10px")
        .attr("fill", "#333")
        .on("click", function(event, d) {
          if (typeof setMainChartDomain === "function") {
            const halfWindow = 20;
            const newDomain = [ d.time - halfWindow, d.time + halfWindow ];
            setMainChartDomain(newDomain);
          }
        });
  
      brush = d3.brushX()
        .extent([[0, 0], [miniWidth, miniHeight]])
        .on("brush end", brushed);
  
      svgMini.append("g")
        .attr("class", "brush")
        .call(brush);
  
      function brushed({ selection }) {
        if (!selection) return;
        const [x0, x1] = selection;
        const newDomain = [ xMini.invert(x0), xMini.invert(x1) ];
        if (typeof setMainChartDomain === "function") {
          setMainChartDomain(newDomain);
        }
      }
    }
  
    const clearBtn = document.getElementById("clearBrush");
    clearBtn.addEventListener("click", function() {
      if (brush) {
        svgMini.select(".brush").call(brush.move, null); 
      }
      if (window.currentTrackData && typeof setMainChartDomain === "function") {
        const timeExtent = d3.extent(window.currentTrackData, d => d.time);
        setMainChartDomain(timeExtent);
      }
    });
  
    window.redrawOverview = drawOverview;
  });
  