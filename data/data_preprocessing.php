<?php
// data_preprocessing.php - Advanced data preprocessing for biosignal data

// ----------------------------------------
// 1. Data Cleaning Functions
// ----------------------------------------

/**
 * Handle missing values in data series through interpolation
 * @param array $data Array of data points with 'time' and 'value' keys
 * @param string $method Interpolation method ('linear', 'previous', 'none')
 * @return array Processed data with missing values filled
 */
function handleMissingValues($data, $method = 'linear') {
    if (empty($data)) return $data;
    
    // Sort by time to ensure proper interpolation
    usort($data, function($a, $b) {
        return $a['time'] <=> $b['time'];
    });
    
    $result = [];
    
    // Check for missing values or large gaps
    for ($i = 0; $i < count($data) - 1; $i++) {
        $current = $data[$i];
        $next = $data[$i + 1];
        $result[] = $current;
        
        // Calculate time difference
        $timeDiff = $next['time'] - $current['time'];
        
        // If gap is larger than expected (e.g., > 5 seconds for most biosignals),
        // perform interpolation based on the selected method
        if ($timeDiff > 5) {
            if ($method === 'linear') {
                // Linear interpolation
                $steps = ceil($timeDiff);
                $valueStep = ($next['value'] - $current['value']) / $steps;
                $timeStep = $timeDiff / $steps;
                
                for ($step = 1; $step < $steps; $step++) {
                    $result[] = [
                        'time' => $current['time'] + ($timeStep * $step),
                        'value' => $current['value'] + ($valueStep * $step),
                        'interpolated' => true
                    ];
                }
            } elseif ($method === 'previous') {
                // Forward fill with previous value
                $result[] = [
                    'time' => $current['time'] + ($timeDiff / 2),
                    'value' => $current['value'],
                    'interpolated' => true
                ];
            }
            // 'none' method does nothing
        }
    }
    
    // Don't forget the last data point
    if (!empty($data)) {
        $result[] = $data[count($data) - 1];
    }
    
    return $result;
}

/**
 * Detect and handle outliers in biosignal data
 * @param array $data Array of data points with 'time' and 'value' keys
 * @param string $method Method to handle outliers ('cap', 'remove', 'tag')
 * @param float $threshold Z-score threshold for outlier detection (default 3)
 * @return array Processed data with outliers handled
 */
function handleOutliers($data, $method = 'tag', $threshold = 3.0) {
    if (empty($data)) return $data;
    
    // Calculate mean and standard deviation
    $values = array_column($data, 'value');
    $mean = array_sum($values) / count($values);
    
    // Calculate standard deviation
    $variance = 0;
    foreach ($values as $value) {
        $variance += pow($value - $mean, 2);
    }
    $std = sqrt($variance / count($values));
    
    // If standard deviation is too small, use a minimum value
    if ($std < 0.001) $std = 0.001;
    
    // Process each data point
    $result = [];
    foreach ($data as $point) {
        $zScore = abs(($point['value'] - $mean) / $std);
        
        if ($zScore > $threshold) {
            // This is an outlier
            switch ($method) {
                case 'cap':
                    // Cap values at threshold
                    $direction = $point['value'] > $mean ? 1 : -1;
                    $cappedValue = $mean + ($direction * $threshold * $std);
                    $result[] = array_merge($point, [
                        'value' => $cappedValue,
                        'original_value' => $point['value'],
                        'outlier' => true
                    ]);
                    break;
                
                case 'remove':
                    // Skip this point (don't add to results)
                    break;
                
                case 'tag':
                default:
                    // Keep but tag as outlier
                    $result[] = array_merge($point, [
                        'outlier' => true,
                        'z_score' => $zScore
                    ]);
                    break;
            }
        } else {
            // Not an outlier, keep as is
            $result[] = $point;
        }
    }
    
    return $result;
}

/**
 * Normalize biosignal data to a standard range
 * @param array $data Array of data points
 * @param float $targetMin Target minimum value (default 0)
 * @param float $targetMax Target maximum value (default 1)
 * @return array Normalized data
 */
function normalizeData($data, $targetMin = 0, $targetMax = 1) {
    if (empty($data)) return $data;
    
    // Find min and max values
    $values = array_column($data, 'value');
    $minVal = min($values);
    $maxVal = max($values);
    
    // Avoid division by zero
    $range = $maxVal - $minVal;
    if ($range == 0) $range = 1;
    
    // Apply normalization
    $targetRange = $targetMax - $targetMin;
    $result = [];
    
    foreach ($data as $point) {
        $normalizedValue = (($point['value'] - $minVal) / $range) * $targetRange + $targetMin;
        $result[] = array_merge($point, [
            'normalized_value' => $normalizedValue,
            'original_value' => $point['value']
        ]);
    }
    
    return $result;
}

// ----------------------------------------
// 2. Timestamp Synchronization Functions
// ----------------------------------------

/**
 * Convert various timestamp formats to Unix epoch time
 * @param mixed $timestamp Input timestamp (string or number)
 * @param string $format Format of the input timestamp
 * @return int Unix epoch timestamp
 */
function standardizeTimestamp($timestamp, $format = 'epoch') {
    if ($format === 'epoch') {
        // Already in epoch format
        return (int)$timestamp;
    } elseif ($format === 'iso8601') {
        // ISO 8601 format (e.g., "2023-03-05T14:30:00Z")
        return strtotime($timestamp);
    } elseif ($format === 'seconds_from_start') {
        // Seconds from procedure start
        // In this case, we need a reference epoch time for the start
        global $procedureStartTime;
        if (!isset($procedureStartTime)) {
            $procedureStartTime = time() - 3600; // Default: 1 hour ago
        }
        return $procedureStartTime + (int)$timestamp;
    }
    
    // Default fallback
    return (int)$timestamp;
}

/**
 * Segment data based on surgical phases
 * @param array $data Array of data points with timestamps
 * @param array $phaseMarkers Array of phase start times and labels
 * @return array Data with added phase labels
 */
function segmentSurgicalPhases($data, $phaseMarkers) {
    if (empty($data) || empty($phaseMarkers)) return $data;
    
    // Sort phase markers by time
    usort($phaseMarkers, function($a, $b) {
        return $a['time'] <=> $b['time'];
    });
    
    // Sort data by time
    usort($data, function($a, $b) {
        return $a['time'] <=> $b['time'];
    });
    
    $result = [];
    $currentPhaseIndex = 0;
    
    foreach ($data as $point) {
        // Find the appropriate phase for this point
        while ($currentPhaseIndex < count($phaseMarkers) - 1 && 
               $point['time'] >= $phaseMarkers[$currentPhaseIndex + 1]['time']) {
            $currentPhaseIndex++;
        }
        
        // Add phase info to the data point
        $result[] = array_merge($point, [
            'phase' => $phaseMarkers[$currentPhaseIndex]['label'],
            'phase_time' => $point['time'] - $phaseMarkers[$currentPhaseIndex]['time']
        ]);
    }
    
    return $result;
}

// ----------------------------------------
// 3. Advanced Anomaly Detection Functions
// ----------------------------------------

/**
 * Detect anomalies using statistical methods
 * @param array $data Array of data points
 * @param string $method Detection method ('z_score', 'iqr', 'moving_average')
 * @param array $params Parameters for the selected method
 * @return array Data with anomaly flags and scores
 */
function detectAnomalies($data, $method = 'z_score', $params = []) {
    if (empty($data)) return $data;
    
    if ($method === 'z_score') {
        return detectAnomaliesZScore($data, $params);
    } elseif ($method === 'iqr') {
        return detectAnomaliesIQR($data, $params);
    } elseif ($method === 'moving_average') {
        return detectAnomaliesMovingAverage($data, $params);
    }
    
    // Default fallback
    return $data;
}

/**
 * Z-score based anomaly detection
 * @param array $data Data points
 * @param array $params Parameters (threshold, window_size)
 * @return array Data with anomaly flags
 */
function detectAnomaliesZScore($data, $params) {
    $threshold = $params['threshold'] ?? 3.0;
    $windowSize = $params['window_size'] ?? 0; // 0 means use all data
    
    $result = [];
    
    // Process each point
    for ($i = 0; $i < count($data); $i++) {
        $currentPoint = $data[$i];
        
        // Determine window of data for context
        $startIdx = $windowSize > 0 ? max(0, $i - $windowSize) : 0;
        $endIdx = $windowSize > 0 ? min(count($data) - 1, $i + $windowSize) : count($data) - 1;
        
        // Calculate mean and std dev for the window
        $windowValues = [];
        for ($j = $startIdx; $j <= $endIdx; $j++) {
            if ($j != $i) { // Exclude current point
                $windowValues[] = $data[$j]['value'];
            }
        }
        
        if (empty($windowValues)) {
            $result[] = $currentPoint; // Not enough context
            continue;
        }
        
        $mean = array_sum($windowValues) / count($windowValues);
        
        // Calculate standard deviation
        $variance = 0;
        foreach ($windowValues as $value) {
            $variance += pow($value - $mean, 2);
        }
        $stdDev = sqrt($variance / count($windowValues));
        
        // Avoid division by zero
        if ($stdDev < 0.001) $stdDev = 0.001;
        
        // Calculate z-score
        $zScore = abs(($currentPoint['value'] - $mean) / $stdDev);
        
        // Flag as anomaly if z-score exceeds threshold
        $isAnomaly = $zScore > $threshold;
        $anomalySeverity = $isAnomaly ? ($zScore > $threshold * 1.5 ? 'critical' : 'warning') : 'normal';
        
        $result[] = array_merge($currentPoint, [
            'anomaly' => $isAnomaly,
            'anomaly_score' => $zScore,
            'severity' => $anomalySeverity,
            'mean' => $mean,
            'std_dev' => $stdDev
        ]);
    }
    
    return $result;
}

/**
 * IQR (Interquartile Range) based anomaly detection
 * @param array $data Data points
 * @param array $params Parameters (multiplier)
 * @return array Data with anomaly flags
 */
function detectAnomaliesIQR($data, $params) {
    $multiplier = $params['multiplier'] ?? 1.5;
    $windowSize = $params['window_size'] ?? 0; // 0 means use all data
    
    $result = [];
    
    // Process each point
    for ($i = 0; $i < count($data); $i++) {
        $currentPoint = $data[$i];
        
        // Determine window of data for context
        $startIdx = $windowSize > 0 ? max(0, $i - $windowSize) : 0;
        $endIdx = $windowSize > 0 ? min(count($data) - 1, $i + $windowSize) : count($data) - 1;
        
        // Extract values for the window
        $windowValues = [];
        for ($j = $startIdx; $j <= $endIdx; $j++) {
            if ($j != $i) { // Exclude current point
                $windowValues[] = $data[$j]['value'];
            }
        }
        
        if (count($windowValues) < 4) {
            $result[] = $currentPoint; // Not enough data for IQR
            continue;
        }
        
        // Sort values to calculate quartiles
        sort($windowValues);
        
        $count = count($windowValues);
        $q1Index = floor($count / 4);
        $q3Index = floor($count * 3 / 4);
        
        $q1 = $windowValues[$q1Index];
        $q3 = $windowValues[$q3Index];
        $iqr = $q3 - $q1;
        
        // Define bounds
        $lowerBound = $q1 - ($multiplier * $iqr);
        $upperBound = $q3 + ($multiplier * $iqr);
        
        // Check if point is an outlier
        $isAnomaly = $currentPoint['value'] < $lowerBound || $currentPoint['value'] > $upperBound;
        
        // Calculate severity
        $distance = 0;
        if ($currentPoint['value'] < $lowerBound) {
            $distance = ($lowerBound - $currentPoint['value']) / $iqr;
        } elseif ($currentPoint['value'] > $upperBound) {
            $distance = ($currentPoint['value'] - $upperBound) / $iqr;
        }
        
        $anomalySeverity = $isAnomaly ? ($distance > 2 ? 'critical' : 'warning') : 'normal';
        
        $result[] = array_merge($currentPoint, [
            'anomaly' => $isAnomaly,
            'anomaly_score' => $distance,
            'severity' => $anomalySeverity,
            'q1' => $q1,
            'q3' => $q3,
            'iqr' => $iqr
        ]);
    }
    
    return $result;
}

/**
 * Moving average based anomaly detection
 * @param array $data Data points
 * @param array $params Parameters (window_size, threshold)
 * @return array Data with anomaly flags
 */
function detectAnomaliesMovingAverage($data, $params) {
    $windowSize = $params['window_size'] ?? 10;
    $threshold = $params['threshold'] ?? 2.0;
    
    $result = [];
    
    // Process each point
    for ($i = 0; $i < count($data); $i++) {
        $currentPoint = $data[$i];
        
        // Calculate moving average
        $startIdx = max(0, $i - $windowSize);
        $sum = 0;
        $count = 0;
        
        for ($j = $startIdx; $j < $i; $j++) {
            $sum += $data[$j]['value'];
            $count++;
        }
        
        if ($count == 0) {
            $result[] = $currentPoint; // Not enough history
            continue;
        }
        
        $movingAvg = $sum / $count;
        
        // Calculate deviation from moving average
        $deviation = abs($currentPoint['value'] - $movingAvg);
        
        // Calculate average deviation within the window
        $deviationSum = 0;
        for ($j = $startIdx; $j < $i; $j++) {
            $deviationSum += abs($data[$j]['value'] - $movingAvg);
        }
        $avgDeviation = $deviationSum / $count;
        
        // Avoid division by zero
        if ($avgDeviation < 0.001) $avgDeviation = 0.001;
        
        // Calculate normalized deviation
        $normalizedDeviation = $deviation / $avgDeviation;
        
        // Flag as anomaly if normalized deviation exceeds threshold
        $isAnomaly = $normalizedDeviation > $threshold;
        $anomalySeverity = $isAnomaly ? ($normalizedDeviation > $threshold * 1.5 ? 'critical' : 'warning') : 'normal';
        
        $result[] = array_merge($currentPoint, [
            'anomaly' => $isAnomaly,
            'anomaly_score' => $normalizedDeviation,
            'severity' => $anomalySeverity,
            'moving_avg' => $movingAvg,
            'avg_deviation' => $avgDeviation
        ]);
    }
    
    return $result;
}

// ----------------------------------------
// 4. Feature Engineering Functions
// ----------------------------------------

/**
 * Extract additional features from time series data
 * @param array $data Original data points
 * @return array Enhanced data with additional features
 */
function engineFeatures($data) {
    if (empty($data)) return $data;
    
    // Sort data by time
    usort($data, function($a, $b) {
        return $a['time'] <=> $b['time'];
    });
    
    $result = [];
    
    // Calculate rate of change and other derived features
    for ($i = 0; $i < count($data); $i++) {
        $featurePoint = $data[$i];
        
        // Rate of change (first derivative)
        if ($i > 0) {
            $timeDiff = $data[$i]['time'] - $data[$i-1]['time'];
            if ($timeDiff > 0) {
                $featurePoint['rate_of_change'] = ($data[$i]['value'] - $data[$i-1]['value']) / $timeDiff;
            }
        }
        
        // Acceleration (second derivative)
        if ($i > 1) {
            $prevRateOfChange = ($data[$i-1]['value'] - $data[$i-2]['value']) / 
                               ($data[$i-1]['time'] - $data[$i-2]['time']);
            $currentRateOfChange = $featurePoint['rate_of_change'];
            $timeDiff = $data[$i]['time'] - $data[$i-1]['time'];
            
            if ($timeDiff > 0) {
                $featurePoint['acceleration'] = ($currentRateOfChange - $prevRateOfChange) / $timeDiff;
            }
        }
        
        // Calculate moving statistics
        $windowSize = 10; // Last 10 data points
        $startIdx = max(0, $i - $windowSize);
        
        $windowValues = [];
        for ($j = $startIdx; $j <= $i; $j++) {
            $windowValues[] = $data[$j]['value'];
        }
        
        // Calculate window statistics
        if (count($windowValues) > 0) {
            $featurePoint['window_mean'] = array_sum($windowValues) / count($windowValues);
            
            // Calculate variance
            $variance = 0;
            foreach ($windowValues as $value) {
                $variance += pow($value - $featurePoint['window_mean'], 2);
            }
            $featurePoint['window_variance'] = $variance / count($windowValues);
            $featurePoint['window_std_dev'] = sqrt($featurePoint['window_variance']);
            
            // Min and max in window
            $featurePoint['window_min'] = min($windowValues);
            $featurePoint['window_max'] = max($windowValues);
            $featurePoint['window_range'] = $featurePoint['window_max'] - $featurePoint['window_min'];
        }
        
        $result[] = $featurePoint;
    }
    
    return $result;
}

// ----------------------------------------
// Main Processing Function
// ----------------------------------------

/**
 * Apply complete preprocessing pipeline to data
 * @param array $data Raw data points
 * @param array $options Configuration options for preprocessing
 * @return array Fully processed and enhanced data
 */
function preprocessData($data, $options = []) {
    // Default options
    $defaultOptions = [
        'missing_values' => [
            'method' => 'linear'
        ],
        'outliers' => [
            'method' => 'tag',
            'threshold' => 3.0
        ],
        'normalization' => [
            'enabled' => true,
            'min' => 0,
            'max' => 1
        ],
        'anomaly_detection' => [
            'method' => 'z_score',
            'params' => [
                'threshold' => 3.0,
                'window_size' => 20
            ]
        ],
        'feature_engineering' => [
            'enabled' => true
        ]
    ];
    
    // Merge provided options with defaults
    $options = array_merge_recursive($defaultOptions, $options);
    
    $processed = $data;
    
    // 1. Handle missing values
    $processed = handleMissingValues(
        $processed, 
        $options['missing_values']['method']
    );
    
    // 2. Handle outliers
    $processed = handleOutliers(
        $processed, 
        $options['outliers']['method'],
        $options['outliers']['threshold']
    );
    
    // 3. Normalize data if enabled
    if ($options['normalization']['enabled']) {
        $processed = normalizeData(
            $processed,
            $options['normalization']['min'],
            $options['normalization']['max']
        );
    }
    
    // 4. Detect anomalies
    $processed = detectAnomalies(
        $processed,
        $options['anomaly_detection']['method'],
        $options['anomaly_detection']['params']
    );
    
    // 5. Engineer additional features if enabled
    if ($options['feature_engineering']['enabled']) {
        $processed = engineFeatures($processed);
    }
    
    return $processed;
} 