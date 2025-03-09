// data_worker.js - Web Worker for parsing large CSV files

// Setup CSV parser (simplified version)
function parseCSV(text, hasHeader = true) {
  const lines = text.split('\n');
  const result = [];
  let headers = [];
  
  // Parse header if present
  if (hasHeader && lines.length > 0) {
    headers = lines[0].split(',').map(h => h.trim());
    lines.shift(); // Remove header
  }
  
  // Parse rows
  for (const line of lines) {
    if (!line.trim()) continue; // Skip empty lines
    
    const values = line.split(',');
    
    if (hasHeader) {
      // Convert to object with header keys
      const obj = {};
      for (let i = 0; i < Math.min(headers.length, values.length); i++) {
        const value = values[i].trim();
        // Try to convert numeric values
        obj[headers[i]] = !isNaN(value) && value !== '' ? +value : value;
      }
      result.push(obj);
    } else {
      // Just return array of values
      result.push(values.map(v => {
        const value = v.trim();
        return !isNaN(value) && value !== '' ? +value : value;
      }));
    }
  }
  
  return result;
}

// Process data in chunks to avoid blocking
function processDataInChunks(data, chunkSize, processChunk) {
  return new Promise((resolve, reject) => {
    const result = [];
    let index = 0;
    
    function doChunk() {
      const chunk = data.slice(index, index + chunkSize);
      
      try {
        // Process this chunk
        const processed = processChunk(chunk);
        result.push(...processed);
        
        index += chunkSize;
        
        if (index < data.length) {
          // More data to process, schedule next chunk
          setTimeout(doChunk, 0);
        } else {
          // All done
          resolve(result);
        }
      } catch (error) {
        reject(error);
      }
    }
    
    // Start processing
    doChunk();
  });
}

// Handle messages from main thread
self.onmessage = async function(e) {
  const command = e.data.command;
  
  try {
    if (command === 'loadCases') {
      // Load cases.txt
      const response = await fetch(e.data.url);
      const text = await response.text();
      
      // Parse CSV
      const cases = parseCSV(text);
      
      // Send back the cases data
      self.postMessage({ type: 'cases', data: cases });
      
      // Signal completion
      self.postMessage({ type: 'complete' });
    }
    
    else if (command === 'filterData') {
      // Filter a large dataset by some criteria
      const { data, field, value } = e.data;
      
      // Process data in chunks to avoid blocking
      const filtered = await processDataInChunks(data, 1000, (chunk) => {
        return chunk.filter(item => item[field] === value);
      });
      
      // Send back the filtered results
      self.postMessage({ type: 'filtered', data: filtered });
    }
    
    else if (command === 'downsample') {
      // Downsample time series data
      const { data, targetPoints } = e.data;
      
      if (data.length <= targetPoints) {
        self.postMessage({ type: 'downsampled', data });
        return;
      }
      
      const factor = Math.ceil(data.length / targetPoints);
      const result = [];
      
      for (let i = 0; i < data.length; i += factor) {
        // For each bucket, calculate mean of points
        const bucket = data.slice(i, Math.min(i + factor, data.length));
        const avgTime = bucket.reduce((sum, d) => sum + d.time, 0) / bucket.length;
        const avgValue = bucket.reduce((sum, d) => sum + d.value, 0) / bucket.length;
        
        result.push({
          time: avgTime,
          value: avgValue
        });
      }
      
      self.postMessage({ type: 'downsampled', data: result });
    }
    
    else {
      self.postMessage({ error: `Unknown command: ${command}` });
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
}; 