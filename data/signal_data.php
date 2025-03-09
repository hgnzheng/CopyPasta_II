<?php
// signal_data.php - Advanced signal data processing with anomaly detection and feature engineering

// Include the preprocessing functions
require_once('data_preprocessing.php');

// Set headers for JSON response
header('Content-Type: application/json');

// Check required parameters
if (!isset($_GET['tid']) || !is_numeric($_GET['tid'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid track ID']);
    exit;
}

$trackId = (int)$_GET['tid'];

// Optional time range parameters
$startTime = isset($_GET['start']) ? (int)$_GET['start'] : null;
$endTime = isset($_GET['end']) ? (int)$_GET['end'] : null;

// Additional processing options
$options = [
    'clean' => isset($_GET['clean']) ? (bool)$_GET['clean'] : true,
    'detectAnomalies' => isset($_GET['anomalies']) ? (bool)$_GET['anomalies'] : true,
    'anomalyMethod' => isset($_GET['method']) ? $_GET['method'] : 'z_score',
    'normalize' => isset($_GET['normalize']) ? (bool)$_GET['normalize'] : false,
    'features' => isset($_GET['features']) ? (bool)$_GET['features'] : true,
    'phases' => isset($_GET['phases']) ? (bool)$_GET['phases'] : false,
    'downsample' => isset($_GET['downsample']) ? (int)$_GET['downsample'] : 0,
    'smoothing' => isset($_GET['smoothing']) ? (int)$_GET['smoothing'] : 0,
];

// Get signal data - this is a simplified example
// In a real implementation, you would query from your database or data files
$signalData = getSignalDataFromFile($trackId, $startTime, $endTime);

// If we have phases from the track metadata, add them to the data
$phases = [];
if ($options['phases'] && isset($_GET['phases_data'])) {
    $phases = json_decode($_GET['phases_data'], true);
    
    if (is_array($phases) && !empty($phases) && $signalData) {
        $signalData = segmentSurgicalPhases($signalData, $phases);
    }
}

// Apply preprocessing pipeline if we have data
if ($signalData) {
    // Configure preprocessing options
    $preprocessingOptions = [
        'missing_values' => [
            'method' => 'linear'
        ],
        'outliers' => [
            'method' => 'tag',
            'threshold' => 3.0
        ],
        'normalization' => [
            'enabled' => $options['normalize'],
            'min' => 0,
            'max' => 1
        ],
        'anomaly_detection' => [
            'method' => $options['anomalyMethod'],
            'params' => [
                'threshold' => 3.0,
                'window_size' => 20,
                'multiplier' => 1.5 // for IQR method
            ],
            'enabled' => $options['detectAnomalies']
        ],
        'feature_engineering' => [
            'enabled' => $options['features']
        ]
    ];
    
    // Apply preprocessing
    $processedData = preprocessData($signalData, $preprocessingOptions);
    
    // Apply smoothing if requested (moving average)
    if ($options['smoothing'] > 0) {
        $processedData = smoothData($processedData, $options['smoothing']);
    }
    
    // Downsample if requested
    if ($options['downsample'] > 0 && count($processedData) > $options['downsample']) {
        $processedData = downsampleData($processedData, $options['downsample']);
    }
    
    // Prepare response
    $response = [
        'trackId' => $trackId,
        'dataPoints' => count($processedData),
        'timeRange' => [
            'start' => $processedData[0]['time'] ?? null,
            'end' => $processedData[count($processedData) - 1]['time'] ?? null
        ],
        'preprocessing' => [
            'cleaned' => $options['clean'],
            'normalized' => $options['normalize'],
            'anomaly_detection' => $options['detectAnomalies'],
            'anomaly_method' => $options['anomalyMethod'],
            'feature_engineering' => $options['features'],
            'smoothing' => $options['smoothing'],
            'downsampled' => $options['downsample'] > 0
        ],
        'data' => $processedData
    ];
    
    // Extract anomalies for quick reference
    if ($options['detectAnomalies']) {
        $anomalies = [];
        foreach ($processedData as $point) {
            if (isset($point['anomaly']) && $point['anomaly']) {
                $anomalies[] = [
                    'time' => $point['time'],
                    'value' => $point['value'],
                    'score' => $point['anomaly_score'] ?? 0,
                    'severity' => $point['severity'] ?? 'warning'
                ];
            }
        }
        $response['anomalies'] = $anomalies;
    }
    
    // Return processed data
    echo json_encode($response);
} else {
    // No data found
    http_response_code(404);
    echo json_encode(['error' => 'No signal data found for track ID ' . $trackId]);
}

/**
 * Apply smoothing to data using moving average
 * @param array $data Data points to smooth
 * @param int $windowSize Size of the smoothing window
 * @return array Smoothed data
 */
function smoothData($data, $windowSize) {
    if (empty($data) || $windowSize <= 1) {
        return $data;
    }
    
    $result = [];
    $halfWindow = floor($windowSize / 2);
    
    for ($i = 0; $i < count($data); $i++) {
        $currentPoint = $data[$i];
        
        // Calculate window boundaries
        $startIdx = max(0, $i - $halfWindow);
        $endIdx = min(count($data) - 1, $i + $halfWindow);
        
        // Calculate sum of values in window
        $sum = 0;
        $count = 0;
        
        for ($j = $startIdx; $j <= $endIdx; $j++) {
            $sum += $data[$j]['value'];
            $count++;
        }
        
        // Calculate moving average
        $smoothedValue = $sum / $count;
        
        // Create smoothed data point
        $smoothedPoint = $currentPoint;
        $smoothedPoint['original_value'] = $currentPoint['value'];
        $smoothedPoint['value'] = $smoothedValue;
        $smoothedPoint['smoothed'] = true;
        $smoothedPoint['window_size'] = $windowSize;
        
        $result[] = $smoothedPoint;
    }
    
    return $result;
}

/**
 * Downsample data to reduce number of points
 * @param array $data Data to downsample
 * @param int $targetPoints Target number of points
 * @return array Downsampled data
 */
function downsampleData($data, $targetPoints) {
    if (count($data) <= $targetPoints) {
        return $data;
    }
    
    $factor = ceil(count($data) / $targetPoints);
    $result = [];
    
    for ($i = 0; $i < count($data); $i += $factor) {
        // Extract points for this bucket
        $bucket = array_slice($data, $i, $factor);
        
        if (empty($bucket)) continue;
        
        // Use first point's time for timestamp
        $representativePoint = $bucket[0];
        
        // Calculate average value
        $sum = 0;
        foreach ($bucket as $point) {
            $sum += $point['value'];
        }
        $avgValue = $sum / count($bucket);
        
        // Also find min/max for range representation
        $values = array_column($bucket, 'value');
        $minValue = min($values);
        $maxValue = max($values);
        
        // Create representative point with stats
        $representativePoint['value'] = $avgValue;
        $representativePoint['min_value'] = $minValue;
        $representativePoint['max_value'] = $maxValue;
        $representativePoint['range'] = $maxValue - $minValue;
        $representativePoint['bucket_size'] = count($bucket);
        $representativePoint['downsampled'] = true;
        
        // Check if any point in the bucket was an anomaly
        $hasAnomaly = false;
        foreach ($bucket as $point) {
            if (isset($point['anomaly']) && $point['anomaly']) {
                $hasAnomaly = true;
                $representativePoint['anomaly'] = true;
                $representativePoint['severity'] = 'warning';
                
                // Use the highest anomaly score
                if (isset($point['anomaly_score']) && 
                    (!isset($representativePoint['anomaly_score']) || 
                     $point['anomaly_score'] > $representativePoint['anomaly_score'])) {
                    $representativePoint['anomaly_score'] = $point['anomaly_score'];
                    
                    // Update severity if this is a critical anomaly
                    if (isset($point['severity']) && $point['severity'] === 'critical') {
                        $representativePoint['severity'] = 'critical';
                    }
                }
                
                // No need to check further
                break;
            }
        }
        
        $result[] = $representativePoint;
    }
    
    return $result;
}

/**
 * Retrieves signal data from file for a given track ID and time range
 * @param int $trackId Track ID to fetch data for
 * @param int|null $startTime Optional start time to filter data
 * @param int|null $endTime Optional end time to filter data
 * @return array Signal data points or empty array if not found
 */
function getSignalDataFromFile($trackId, $startTime = null, $endTime = null) {
    // In a real implementation, you would read from your data files or database
    // This is a simplified example that generates sample data
    
    // Sample data generator (for testing)
    $data = [];
    $baseTime = time() - 3600; // 1 hour ago
    $interval = 5; // 5 seconds between points
    $baseValue = 70; // e.g., heart rate baseline
    
    // Generate 500 data points
    for ($i = 0; $i < 500; $i++) {
        $time = $baseTime + ($i * $interval);
        
        // Skip if outside requested time range
        if (($startTime !== null && $time < $startTime) || 
            ($endTime !== null && $time > $endTime)) {
            continue;
        }
        
        // Generate value with some variation and occasional anomalies
        $value = $baseValue + sin($i * 0.1) * 5;
        
        // Add some random noise
        $value += (mt_rand(-100, 100) / 100) * 2;
        
        // Create occasional spikes (anomalies)
        if ($i % 50 === 0) {
            $value += 15; // Upward spike
        } else if ($i % 75 === 0) {
            $value -= 12; // Downward spike
        }
        
        // Generate occasional missing values
        if ($i % 40 === 0) {
            continue; // Skip this point to simulate missing data
        }
        
        $data[] = [
            'time' => $time,
            'value' => $value
        ];
    }
    
    return $data;
} 