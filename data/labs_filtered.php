<?php
// labs_filtered.php - Server-side filtering for lab results by case ID

// Include the preprocessing functions
require_once('data_preprocessing.php');

// Set headers for JSON response
header('Content-Type: application/json');

// Check if case ID is provided
if (!isset($_GET['caseid']) || !is_numeric($_GET['caseid'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid case ID']);
    exit;
}

$caseId = (int)$_GET['caseid'];
$filteredLabs = [];

// Additional options that can be passed as query parameters
$options = [
    'clean' => isset($_GET['clean']) ? (bool)$_GET['clean'] : true,
    'normalize' => isset($_GET['normalize']) ? (bool)$_GET['normalize'] : false,
    'detectAnomalies' => isset($_GET['anomalies']) ? (bool)$_GET['anomalies'] : false,
    'limitResults' => isset($_GET['limit']) ? (int)$_GET['limit'] : 500
];

// Path to labs data file
$dataFile = 'labs.txt';

// Check if file exists
if (!file_exists($dataFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Data file not found']);
    exit;
}

// Open the file
$handle = fopen($dataFile, 'r');
if (!$handle) {
    http_response_code(500);
    echo json_encode(['error' => 'Cannot open data file']);
    exit;
}

// Read the header
$header = fgetcsv($handle);
if (!$header) {
    http_response_code(500);
    echo json_encode(['error' => 'Invalid data file format']);
    fclose($handle);
    exit;
}

// Find index of caseid column
$caseIdIndex = array_search('caseid', $header);
if ($caseIdIndex === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Case ID column not found in data']);
    fclose($handle);
    exit;
}

// Set a limit to avoid overloading
$limit = $options['limitResults'];
$count = 0;

// Process the file line by line
while (($data = fgetcsv($handle)) !== false) {
    // Check if this row matches the requested case ID
    if (isset($data[$caseIdIndex]) && (int)$data[$caseIdIndex] === $caseId) {
        $lab = [];
        foreach ($header as $i => $columnName) {
            if (isset($data[$i])) {
                // Convert to appropriate types
                if ($columnName === 'caseid') {
                    $lab[$columnName] = (int)$data[$i];
                } elseif ($columnName === 'dt') {
                    $lab[$columnName] = (int)$data[$i];
                    // Also add a standardized timestamp
                    $lab['time'] = standardizeTimestamp($data[$i], 'epoch');
                } elseif ($columnName === 'result' && is_numeric($data[$i])) {
                    $lab[$columnName] = (float)$data[$i];
                    // Map result to value for consistency with other preprocessing functions
                    $lab['value'] = (float)$data[$i]; 
                } else {
                    $lab[$columnName] = $data[$i];
                }
            }
        }
        $filteredLabs[] = $lab;
        
        // Check if we've reached the limit
        $count++;
        if ($count >= $limit) {
            break;
        }
    }
}

fclose($handle);

// Apply data preprocessing if requested
if ($options['clean'] || $options['normalize'] || $options['detectAnomalies']) {
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
            'method' => 'z_score',
            'params' => [
                'threshold' => 3.0,
                'window_size' => 20
            ],
            'enabled' => $options['detectAnomalies']
        ],
        'feature_engineering' => [
            'enabled' => true
        ]
    ];
    
    // Group by test name for proper context in preprocessing
    $labsByTest = [];
    foreach ($filteredLabs as $lab) {
        if (!isset($lab['test']) || !isset($lab['time']) || !isset($lab['value'])) {
            continue;
        }
        
        $testName = $lab['test'];
        if (!isset($labsByTest[$testName])) {
            $labsByTest[$testName] = [];
        }
        
        $labsByTest[$testName][] = $lab;
    }
    
    // Process each test group separately for better context
    $processedLabs = [];
    foreach ($labsByTest as $testName => $testLabs) {
        // Skip if too few data points for meaningful processing
        if (count($testLabs) < 3) {
            $processedLabs = array_merge($processedLabs, $testLabs);
            continue;
        }
        
        // Apply preprocessing
        $processed = preprocessData($testLabs, $preprocessingOptions);
        $processedLabs = array_merge($processedLabs, $processed);
    }
    
    // Sort by time
    usort($processedLabs, function($a, $b) {
        return $a['time'] <=> $b['time'];
    });
    
    // Replace the filtered labs with the processed ones
    $filteredLabs = $processedLabs;
}

// Return the filtered data
echo json_encode($filteredLabs); 