// data_api.js - Efficient data loading middleware

// In-memory data caches
const dataCache = {
  cases: null,
  labs: {},  // Keyed by caseId
  tracks: {}, // Keyed by caseId
  signals: {}, // Keyed by trackId + time range
  expandedSignals: {} // For storing higher resolution data
};

// Indicate whether to use processed data
const USE_PROCESSED_DATA = true;

// Cache constants
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes in milliseconds
const MAX_POINTS_OVERVIEW = 500; // Max points for overview display
const MAX_POINTS_DETAILED = 2000; // Max points for detailed view
const PROGRESSIVE_LOADING_THRESHOLD = 10000; // When to use progressive loading

// Flag to track initial loading
let initialLoadComplete = false;
let loadingPromise = null;
let activeRequests = new Map(); // Track active requests to prevent duplicates

// Worker for parsing large CSV files
let worker = null;
if (window.Worker) {
  try {
    worker = new Worker('data_worker.js');
  } catch (error) {
    console.warn("Worker initialization failed, using fallback loading methods", error);
  }
}

// Get the appropriate data file path based on whether to use processed data
function getDataFilePath(fileType) {
  if (USE_PROCESSED_DATA) {
    return `./data/processed/${fileType}_processed.txt`;
  } else {
    return `./data/${fileType}.txt`;
  }
}

// ------------------------------------------------
// Core Data Loading Functions
// ------------------------------------------------

// Initialize data loading - returns a promise
function initializeData() {
  if (loadingPromise) {
    return loadingPromise; // Return existing promise if already loading
  }
  
  showLoadingIndicator();
  
  // Show default visualization right away while data loads in the background
  if (typeof window.showDefaultVisualization === 'function') {
    console.log("Showing default visualization while data loads...");
    window.showDefaultVisualization();
  }
  
  // Create a new promise for the loading process
  loadingPromise = new Promise((resolve, reject) => {
    // First, try to load the case list
    fetch(getDataFilePath('cases'))
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then(text => {
        if (worker) {
          // Use the worker to parse the CSV
          worker.postMessage({
            command: 'parseCases',
            data: text
          });
          
          worker.onmessage = function(e) {
            if (e.data.command === 'parseCasesComplete') {
              dataCache.cases = e.data.cases;
              initialLoadComplete = true;
              hideLoadingIndicator();
              resolve(dataCache.cases);
            }
          };
          
          worker.onerror = function(error) {
            console.error('Worker error:', error);
            // Fallback to client-side parsing
            processClientSide(text);
          };
        } else {
          // If the worker isn't available, parse on the client side
          processClientSide(text);
        }
        
        function processClientSide(text) {
          try {
            const lines = text.split('\n');
            const headers = lines[0].split(',');
            const caseidIndex = headers.indexOf('caseid');
            
            // Simple CSV parsing (for production, consider using a library)
            dataCache.cases = lines.slice(1).filter(line => line.trim()).map(line => {
              const values = line.split(',');
              const caseData = {};
              
              headers.forEach((header, i) => {
                if (i < values.length) {
                  caseData[header] = values[i];
                }
              });
              
              return caseData;
            });
            
            initialLoadComplete = true;
            hideLoadingIndicator();
            resolve(dataCache.cases);
          } catch (error) {
            console.error('Error parsing CSV:', error);
            hideLoadingIndicator();
            reject(error);
          }
        }
      })
      .catch(error => {
        console.error('Error fetching case data:', error);
        hideLoadingIndicator();
        reject(error);
      });
  });
  
  return loadingPromise;
}

// Get case list with minimal data
function getCaseList() {
  if (!dataCache.cases) {
    return initializeData().then(() => {
      // Return only needed fields for the dropdown
      return dataCache.cases.map(c => ({
        caseid: c.caseid,
        opname: c.opname || 'Unknown Operation',
        department: c.department || 'Unknown Department'
      }));
    });
  }
  
  // Return only needed fields for the dropdown
  return Promise.resolve(dataCache.cases.map(c => ({
    caseid: c.caseid,
    opname: c.opname || 'Unknown Operation',
    department: c.department || 'Unknown Department'
  })));
}

// Get tracks for a specific case
function getTracksForCase(caseId) {
  // Check cache first
  if (dataCache.tracks[caseId]) {
    return Promise.resolve(dataCache.tracks[caseId]);
  }
  
  // Create a request key to avoid duplicate requests
  const requestKey = `tracks_${caseId}`;
  if (activeRequests.has(requestKey)) {
    return activeRequests.get(requestKey);
  }
  
  showLoadingIndicator();
  
  const request = fetch(getDataFilePath('tracks'))
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then(text => {
      const tracks = [];
      const lines = text.split('\n');
      const headers = lines[0].split(',');
      const caseidIndex = headers.indexOf('caseid');
      
      if (caseidIndex === -1) {
        throw new Error('Invalid tracks data: caseid column not found');
      }
      
      // Parse CSV data
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',');
        if (values.length <= caseidIndex) continue;
        
        if (values[caseidIndex] === caseId.toString()) {
          const track = {};
          headers.forEach((header, index) => {
            if (index < values.length) {
              track[header] = values[index];
            }
          });
          tracks.push(track);
        }
      }
      
      // Store in cache and return
      dataCache.tracks[caseId] = tracks;
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      return tracks;
    })
    .catch(error => {
      console.error(`Error loading tracks for case ${caseId}:`, error);
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      throw error;
    });
  
  activeRequests.set(requestKey, request);
  return request;
}

// Get labs for a specific case
function getLabsForCase(caseId) {
  // Check cache first
  if (dataCache.labs[caseId]) {
    return Promise.resolve(dataCache.labs[caseId]);
  }
  
  // Create a request key to avoid duplicate requests
  const requestKey = `labs_${caseId}`;
  if (activeRequests.has(requestKey)) {
    return activeRequests.get(requestKey);
  }
  
  showLoadingIndicator();
  
  const request = fetch(getDataFilePath('labs'))
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then(text => {
      const labs = [];
      const lines = text.split('\n');
      const headers = lines[0].split(',');
      const caseidIndex = headers.indexOf('caseid');
      
      if (caseidIndex === -1) {
        throw new Error('Invalid labs data: caseid column not found');
      }
      
      // Parse CSV data
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',');
        if (values.length <= caseidIndex) continue;
        
        if (values[caseidIndex] === caseId.toString()) {
          const lab = {};
          headers.forEach((header, index) => {
            if (index < values.length) {
              lab[header] = values[index];
            }
          });
          labs.push(lab);
        }
      }
      
      // Sort labs by date if possible
      if (labs.length > 0 && labs[0].dt) {
        labs.sort((a, b) => {
          return new Date(a.dt) - new Date(b.dt);
        });
      }
      
      // Store in cache and return
      dataCache.labs[caseId] = labs;
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      return labs;
    })
    .catch(error => {
      console.error(`Error loading labs for case ${caseId}:`, error);
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      throw error;
    });
  
  activeRequests.set(requestKey, request);
  return request;
}

// Get signal data with time range restriction
function getSignalData(trackId, startTime, endTime) {
  // Create cache key based on parameters
  const cacheKey = `${trackId}_${startTime}_${endTime}`;
  
  // If trackId is invalid or missing, generate default data
  if (!trackId || trackId === 'undefined') {
    console.warn('Invalid track ID. Generating default data visualization.');
    return Promise.resolve(generateDefaultData(startTime, endTime));
  }
  
  // Check if a request is already in progress 
  if (activeRequests.has(cacheKey)) {
    return activeRequests.get(cacheKey);
  }
  
  // Check cache first
  if (dataCache.signals[cacheKey]) {
    return Promise.resolve(dataCache.signals[cacheKey]);
  }
  
  // Check if we can construct this from an expanded dataset we already have
  const expandedKey = Object.keys(dataCache.expandedSignals).find(key => {
    const [id, start, end] = key.split('_');
    return id === trackId && +start <= startTime && +end >= endTime;
  });
  
  if (expandedKey) {
    console.log('Constructing from expanded dataset');
    const expandedData = dataCache.expandedSignals[expandedKey];
    const filteredData = expandedData.filter(d => d.time >= startTime && d.time <= endTime);
    const downsampledData = downsampleData(filteredData, MAX_POINTS_DETAILED);
    dataCache.signals[cacheKey] = downsampledData;
    return Promise.resolve(downsampledData);
  }
  
  // Show loading indicator
  showLoadingIndicator(true);

  // Generate simulated data since we don't have a real data source
  const simulateDataPromise = new Promise((resolve) => {
    setTimeout(() => {
      try {
        // Generate 1000 data points in the time range
        const data = [];
        const range = endTime - startTime;
        const numPoints = 1000;
        const step = range / numPoints;
        
        // Base value and variation
        const baseValue = 70 + Math.random() * 30; // Random base between 70-100
        const variability = 10 + Math.random() * 20; // Random variation 10-30
        
        // Generate data with natural looking variations
        let currentValue = baseValue;
        let trend = 0;
        for (let i = 0; i < numPoints; i++) {
          const time = startTime + i * step;
          
          // Add some random walk with momentum
          trend = trend * 0.95 + (Math.random() - 0.5) * 0.8;
          currentValue += trend;
          
          // Add some sine wave patterns
          const sineWave = Math.sin(time / 50) * (variability * 0.3);
          const fastSineWave = Math.sin(time / 10) * (variability * 0.1);
          
          // Keep within reasonable bounds
          let value = currentValue + sineWave + fastSineWave;
          value = Math.max(baseValue - variability, Math.min(baseValue + variability, value));
          
          // Add data point
          data.push({
            time: time,
            value: value,
            // Add min/max values for range visualization
            minValue: value - (Math.random() * 2 + 1),
            maxValue: value + (Math.random() * 2 + 1)
          });
        }
        
        // Add some anomalies - sudden spikes or drops
        const numAnomalies = Math.floor(Math.random() * 5) + 1;
        for (let i = 0; i < numAnomalies; i++) {
          const anomalyIndex = Math.floor(Math.random() * (numPoints - 10)) + 5;
          const anomalyDirection = Math.random() > 0.5 ? 1 : -1;
          const anomalySize = (Math.random() * 15 + 10) * anomalyDirection;
          
          // Create a spike or drop over a few points
          for (let j = 0; j < 5; j++) {
            const effectSize = anomalySize * Math.sin((j / 4) * Math.PI);
            data[anomalyIndex + j].value += effectSize;
            data[anomalyIndex + j].minValue += effectSize - 1;
            data[anomalyIndex + j].maxValue += effectSize + 1;
          }
        }
        
        const processedData = data;
        
        // Store both downsampled and full resolution data
        const downsampledData = downsampleData(processedData, MAX_POINTS_DETAILED);
        dataCache.signals[cacheKey] = downsampledData;
        
        // Store expanded dataset for future use
        dataCache.expandedSignals[`${trackId}_${startTime}_${endTime}`] = processedData;
        
        hideLoadingIndicator();
        resolve(downsampledData);
      } catch (error) {
        console.error("Error generating signal data:", error);
        hideLoadingIndicator();
        // Still resolve with default data rather than rejecting
        resolve(generateDefaultData(startTime, endTime));
      }
    }, 500); // Simulate network delay
  });
  
  // Store promise in activeRequests
  activeRequests.set(cacheKey, simulateDataPromise);
  
  // Add a finally handler to clean up
  simulateDataPromise.finally(() => {
    activeRequests.delete(cacheKey);
  });
  
  return simulateDataPromise;
}

// Helper function to generate default data for visualization when no real data is available
function generateDefaultData(startTime = 0, endTime = 1000) {
  console.log("Generating default visualization data");
  const data = [];
  const range = endTime - startTime;
  const numPoints = 1000;
  const step = range / numPoints;
  
  // Demo data showing a sample heart rate pattern
  for (let i = 0; i < numPoints; i++) {
    const time = startTime + i * step;
    
    // Create an interesting pattern for the default visualization
    // Baseline with some regular oscillations + gradual trend changes
    const baseline = 80; // Normal resting heart rate
    const regularBeats = 10 * Math.sin(time / 10); // Regular heart rhythm
    const breathingEffect = 5 * Math.sin(time / 60); // Breathing pattern
    const trend = 5 * Math.sin(time / 200); // Slow physiological changes
    
    // Add some natural variation
    const noise = (Math.random() - 0.5) * 3;
    
    const value = baseline + regularBeats + breathingEffect + trend + noise;
    
    data.push({
      time: time,
      value: value,
      minValue: value - (Math.random() * 1.5 + 0.5),
      maxValue: value + (Math.random() * 1.5 + 0.5)
    });
  }
  
  return data;
}

// Process large datasets in chunks with progress updates
function processLargeDataProgressively(data, trackId, startTime, endTime) {
  return new Promise((resolve) => {
    const cacheKey = `${trackId}_${startTime}_${endTime}`;
    const chunkSize = 5000; // Process 5000 rows at a time
    const totalChunks = Math.ceil(data.length / chunkSize);
    let processedChunks = 0;
    const processedData = [];
    
    // Update loading indicator with progress
    function updateProgress() {
      const progress = Math.round((processedChunks / totalChunks) * 100);
      const loadingText = document.querySelector('#loadingOverlay .loading-text');
      if (loadingText) {
        loadingText.textContent = `Processing data... ${progress}%`;
      }
    }
    
    // Process one chunk of data
    function processChunk() {
      const start = processedChunks * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunk = data.slice(start, end);
      
      // Process this chunk
      const processed = chunk.map(d => {
        const time = +d.Time;
        const keys = Object.keys(d);
        const valKey = keys.find(k => k !== "Time");
        const value = +d[valKey];
        return { time, value };
      });
      
      // Add to our result array
      processedData.push(...processed);
      
      // Update progress
      processedChunks++;
      updateProgress();
      
      // If we're done, finalize the data
      if (processedChunks >= totalChunks) {
        // Sort by time
        processedData.sort((a, b) => a.time - b.time);
        
        // Store both downsampled and full resolution data
        const downsampledData = downsampleData(processedData, MAX_POINTS_DETAILED);
        dataCache.signals[cacheKey] = downsampledData;
        
        // Store expanded dataset for future use
        dataCache.expandedSignals[`${trackId}_${startTime}_${endTime}`] = processedData;
        
        hideLoadingIndicator();
        activeRequests.delete(cacheKey);
        resolve(downsampledData);
      } else {
        // Process the next chunk on the next animation frame to avoid blocking UI
        requestAnimationFrame(processChunk);
      }
    }
    
    // Start processing
    processChunk();
  });
}

// ------------------------------------------------
// Helper Functions
// ------------------------------------------------

// Process raw signal data
function processSignalData(data) {
  // Process the data
  const processed = data.map(d => {
    // Extract time and value
    const time = +d.Time;
    const keys = Object.keys(d);
    const valKey = keys.find(k => k !== "Time");
    const value = +d[valKey];
    
    // Return simplified object
    return { time, value };
  });
  
  // Sort by time
  processed.sort((a, b) => a.time - b.time);
  
  return processed;
}

// Downsample data to target number of points
function downsampleData(data, targetPoints) {
  if (!data || data.length === 0) {
    return [];
  }
  
  if (data.length <= targetPoints) {
    return data;
  }
  
  const factor = Math.ceil(data.length / targetPoints);
  const result = [];
  
  for (let i = 0; i < data.length; i += factor) {
    // For each bucket, calculate mean of points
    const bucket = data.slice(i, Math.min(i + factor, data.length));
    
    // Skip empty buckets (shouldn't happen but for safety)
    if (bucket.length === 0) continue;
    
    const avgTime = bucket.reduce((sum, d) => sum + d.time, 0) / bucket.length;
    
    // Keep min, max and avg values for better representation of data
    const values = bucket.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const avgValue = bucket.reduce((sum, d) => sum + d.value, 0) / bucket.length;
    
    result.push({
      time: avgTime,
      value: avgValue,
      minValue: minValue,
      maxValue: maxValue
    });
  }
  
  return result;
}

// Show loading indicator
function showLoadingIndicator(isIncrementalLoad = false) {
  // Check if loading overlay exists
  let loadingOverlay = document.getElementById('loadingOverlay');
  
  if (!loadingOverlay) {
    // Create loading overlay
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">${isIncrementalLoad ? 'Loading Data...' : 'Initializing Dashboard...'}</div>
    `;
    document.body.appendChild(loadingOverlay);
  } else {
    loadingOverlay.style.display = 'flex';
    loadingOverlay.querySelector('.loading-text').textContent = 
      isIncrementalLoad ? 'Loading Data...' : 'Initializing Dashboard...';
  }
  
  // Use the parent page's loading overlay if available
  if (typeof showLoadingOverlay === 'function' && !isIncrementalLoad) {
    showLoadingOverlay('Loading data...');
  }
}

// Hide loading indicator
function hideLoadingIndicator() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
  
  // Hide the parent page's loading overlay if available
  if (typeof hideLoadingOverlay === 'function') {
    hideLoadingOverlay();
  }
}

// Clear cache for a specific case or track
function clearCache(caseId = null, trackId = null) {
  if (caseId === null && trackId === null) {
    // Clear all
    dataCache.cases = null;
    dataCache.labs = {};
    dataCache.tracks = {};
    dataCache.signals = {};
    dataCache.expandedSignals = {};
    initialLoadComplete = false;
    loadingPromise = null;
  } else if (caseId !== null) {
    // Clear case data
    delete dataCache.labs[caseId];
    delete dataCache.tracks[caseId];
    // Clear all signal data related to this case's tracks
    if (dataCache.tracks[caseId]) {
      dataCache.tracks[caseId].forEach(track => {
        Object.keys(dataCache.signals).forEach(key => {
          if (key.startsWith(`${track.tid}_`)) {
            delete dataCache.signals[key];
          }
        });
        Object.keys(dataCache.expandedSignals).forEach(key => {
          if (key.startsWith(`${track.tid}_`)) {
            delete dataCache.expandedSignals[key];
          }
        });
      });
    }
  } else if (trackId !== null) {
    // Clear track data
    Object.keys(dataCache.signals).forEach(key => {
      if (key.startsWith(`${trackId}_`)) {
        delete dataCache.signals[key];
      }
    });
    Object.keys(dataCache.expandedSignals).forEach(key => {
      if (key.startsWith(`${trackId}_`)) {
        delete dataCache.expandedSignals[key];
      }
    });
  }
}

// Data API error handler
function handleApiError(error, context = '') {
  console.error(`Data API Error ${context ? `(${context})` : ''}:`, error);
  
  // Hide any loading indicators
  hideLoadingIndicator();
  
  // Show error message if showErrorMessage function is available in parent scope
  if (typeof showErrorMessage === 'function') {
    let errorMessage = 'An error occurred while loading data. Please try again.';
    
    if (error && error.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    showErrorMessage(errorMessage);
  }
  
  // Re-throw for promise chaining
  throw error;
}

// Export the public API
window.dataAPI = {
  initialize: initializeData,
  getCaseList: getCaseList,
  getTracksForCase: getTracksForCase,
  getLabsForCase: getLabsForCase,
  getSignalData: getSignalData,
  generateDefaultData: generateDefaultData,
  getDataFilePath: getDataFilePath,
  clearCache: clearCache
};

// Helper functions for UI feedback
function showLoadingIndicator() {
  if (typeof window.showLoadingOverlay === 'function') {
    window.showLoadingOverlay('Loading data...');
  }
}

function hideLoadingIndicator() {
  if (typeof window.hideLoadingOverlay === 'function') {
    window.hideLoadingOverlay();
  }
} 