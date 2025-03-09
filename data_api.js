// data_api.js - Efficient data loading middleware

// In-memory data caches
const dataCache = {
  cases: null,
  labs: {},  // Keyed by caseId
  tracks: {}, // Keyed by caseId
  signals: {}, // Keyed by trackId + time range
  expandedSignals: {} // For storing higher resolution data
};

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

// ------------------------------------------------
// Core Data Loading Functions
// ------------------------------------------------

// Initialize data loading - returns a promise
function initializeData() {
  if (initialLoadComplete) {
    return Promise.resolve();
  }
  
  if (loadingPromise) {
    return loadingPromise;
  }
  
  // Show loading indicator
  showLoadingIndicator();
  
  // If we have a worker, use it for parsing
  if (worker) {
    loadingPromise = new Promise((resolve, reject) => {
      worker.onmessage = function(e) {
        if (e.data.error) {
          reject(e.data.error);
          return;
        }
        
        if (e.data.type === 'cases') {
          dataCache.cases = e.data.data;
        }
        
        if (e.data.type === 'complete') {
          initialLoadComplete = true;
          hideLoadingIndicator();
          resolve();
        }
      };
      
      worker.onerror = function(error) {
        console.error('Worker error:', error);
        reject(error);
      };
      
      // Start the worker processing cases.txt
      worker.postMessage({ command: 'loadCases', url: 'data/cases.txt' });
    });
  } else {
    // Fallback to loading just the case data for now
    loadingPromise = d3.csv("data/cases.txt", d3.autoType)
      .then(cases => {
        dataCache.cases = cases;
        initialLoadComplete = true;
        hideLoadingIndicator();
      })
      .catch(error => {
        console.error("Error loading initial data:", error);
        hideLoadingIndicator();
        throw error;
      });
  }
  
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
  // Check if a request is already in progress
  const requestKey = `tracks_${caseId}`;
  if (activeRequests.has(requestKey)) {
    return activeRequests.get(requestKey);
  }

  // Check cache first
  if (dataCache.tracks[caseId]) {
    return Promise.resolve(dataCache.tracks[caseId]);
  }
  
  // Show loading indicator
  showLoadingIndicator(true);
  
  // Load tracks specifically for this case
  const fetchPromise = fetch(`data/tracks_filtered.php?caseid=${caseId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .catch((error) => {
      console.warn(`Error fetching filtered tracks: ${error.message}. Falling back to client-side filtering.`);
      // Fallback to client-side filtering if the PHP endpoint isn't available
      return d3.csv("data/trks.txt", d3.autoType)
        .then(tracks => tracks.filter(t => t.caseid === +caseId));
    })
    .then(tracks => {
      dataCache.tracks[caseId] = tracks;
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      return tracks;
    })
    .catch(error => {
      console.error(`Failed to load tracks for case ${caseId}:`, error);
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      throw error;
    });
  
  // Store promise in activeRequests
  activeRequests.set(requestKey, fetchPromise);
  return fetchPromise;
}

// Get labs for a specific case
function getLabsForCase(caseId) {
  // Check if a request is already in progress
  const requestKey = `labs_${caseId}`;
  if (activeRequests.has(requestKey)) {
    return activeRequests.get(requestKey);
  }

  // Check cache first
  if (dataCache.labs[caseId]) {
    return Promise.resolve(dataCache.labs[caseId]);
  }
  
  // Show loading indicator for labs
  showLoadingIndicator(true);
  
  // Load labs specifically for this case
  const fetchPromise = fetch(`data/labs_filtered.php?caseid=${caseId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .catch((error) => {
      console.warn(`Error fetching filtered labs: ${error.message}. Falling back to client-side filtering.`);
      // Fallback to client-side filtering
      return d3.csv("data/labs.txt", d3.autoType)
        .then(labs => labs.filter(l => l.caseid === +caseId));
    })
    .then(labs => {
      // Sort labs by datetime
      labs.sort((a, b) => a.dt - b.dt);
      dataCache.labs[caseId] = labs;
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      return labs;
    })
    .catch(error => {
      console.error(`Failed to load labs for case ${caseId}:`, error);
      hideLoadingIndicator();
      activeRequests.delete(requestKey);
      throw error;
    });
  
  // Store promise in activeRequests
  activeRequests.set(requestKey, fetchPromise);
  return fetchPromise;
}

// Get signal data with time range restriction
function getSignalData(trackId, startTime, endTime) {
  // Create cache key based on parameters
  const cacheKey = `${trackId}_${startTime}_${endTime}`;
  
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
  
  // First try to get data from VitalDB API with time restriction
  const url = `https://api.vitaldb.net/${trackId}?from=${startTime}&to=${endTime}`;
  
  const fetchPromise = d3.csv(url, d3.autoType)
    .then(data => {
      // If data is very large, we'll process it in chunks
      if (data.length > PROGRESSIVE_LOADING_THRESHOLD) {
        return processLargeDataProgressively(data, trackId, startTime, endTime);
      }
      
      // Otherwise process as normal
      const processedData = processSignalData(data);
      
      // Store both downsampled and full resolution data
      const downsampledData = downsampleData(processedData, MAX_POINTS_DETAILED);
      dataCache.signals[cacheKey] = downsampledData;
      
      // Store expanded dataset for future use
      dataCache.expandedSignals[`${trackId}_${startTime}_${endTime}`] = processedData;
      
      hideLoadingIndicator();
      activeRequests.delete(cacheKey);
      return downsampledData;
    })
    .catch(error => {
      console.error(`Error loading signal data for track ${trackId}:`, error);
      hideLoadingIndicator();
      activeRequests.delete(cacheKey);
      throw error;
    });
  
  // Store promise in activeRequests
  activeRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
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
}

// Hide loading indicator
function hideLoadingIndicator() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
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

// Export the API methods
window.dataAPI = {
  initialize: initializeData,
  getCaseList,
  getTracksForCase,
  getLabsForCase,
  getSignalData,
  clearCache
}; 